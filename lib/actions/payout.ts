"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import {
  calculateNormalSplit,
  calculateBonusSplit,
  computeFixedBaseExcess,
  computeFoundationExcess,
  convertToInrCents,
  founderMonthlySalaryCents,
  splitProportional,
} from "@/lib/founderPayout";
import type { Client, ClientPayoutSplit, Employee, Invoice, PayoutShareCategory } from "@/lib/types";

type InvoiceWithClient = Invoice & {
  clients: Pick<
    Client,
    "id" | "sales_owner_id" | "ops_owner_id" | "is_foundation_account" | "fixed_payout_base_usd_cents"
  > | null;
};

interface ShareInput {
  employee_id: string;
  category: PayoutShareCategory;
  source_invoice_id: string | null;
  amount_inr_cents: number;
}

// Pure UTC-calendar arithmetic — deliberately avoids `new Date(dateIso)` +
// local getters (e.g. getFullYear/getMonth), which parses a date-only
// string like "2026-08-01" as UTC midnight but then reads it back in the
// server's local timezone. On a server behind UTC that silently resolves
// "2026-08-01" to July, misfiling every invoice paid that month.
function monthBoundsFor(dateIso: string) {
  const [year, month] = dateIso.slice(0, 7).split("-").map(Number);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

// Attributes `poolCents` across whichever employees hold credit for a
// client (checking project-scoped client_payout_splits rows first if
// `projectId` is given, then the client's project_id-is-null default rows,
// then 100% to the fallback owner, then split evenly across all founders
// if no owner is set) and appends the resulting per-employee shares.
function attributeCredit(
  shares: ShareInput[],
  category: PayoutShareCategory,
  poolCents: number,
  splitRows: ClientPayoutSplit[],
  clientId: string,
  splitType: "sales" | "ops",
  fallbackOwnerId: string | null,
  founderIds: string[],
  projectId: string | null = null
) {
  const projectRows = projectId
    ? splitRows.filter((r) => r.client_id === clientId && r.project_id === projectId && r.split_type === splitType)
    : [];
  const rows =
    projectRows.length > 0
      ? projectRows
      : splitRows.filter((r) => r.client_id === clientId && r.project_id === null && r.split_type === splitType);
  let credits: { employeeId: string; fraction: number }[];

  if (rows.length > 0) {
    credits = rows.map((r) => ({ employeeId: r.employee_id, fraction: Number(r.share_percent) / 100 }));
  } else if (fallbackOwnerId) {
    credits = [{ employeeId: fallbackOwnerId, fraction: 1 }];
  } else if (founderIds.length > 0) {
    // No owner set: split evenly across all founders rather than dropping
    // the credit entirely (mirrors the fallback the retired
    // lib/actions/founders.ts used for unattributed revenue).
    credits = founderIds.map((id) => ({ employeeId: id, fraction: 1 / founderIds.length }));
  } else {
    return;
  }

  const parts = splitProportional(
    poolCents,
    credits.map((c) => c.fraction)
  );
  credits.forEach((credit, i) => {
    shares.push({ employee_id: credit.employeeId, category, source_invoice_id: null, amount_inr_cents: parts[i] });
  });
}

// Recomputes and persists one calendar month's founder payout from scratch,
// from every invoice paid in it. Called internally by lib/actions/billing.ts
// whenever an invoice transitions to 'paid' — any authenticated staff member
// can trigger this (matches invoices' own RLS), but the actual write goes
// through the replace_founder_payout_month() security-definer function, so
// payout_runs/payout_shares stay admin-only regardless of who triggered it.
export async function recomputeFounderPayoutForMonth(supabase: SupabaseClient, referenceDateIso: string) {
  const { start: periodStart, end: periodEnd } = monthBoundsFor(referenceDateIso);

  const [{ data: invoices, error: invoicesError }, { data: founders, error: foundersError }] = await Promise.all([
    supabase
      .from("invoices")
      .select("*, clients(id, sales_owner_id, ops_owner_id, is_foundation_account, fixed_payout_base_usd_cents)")
      .eq("status", "paid")
      .gte("paid_at", `${periodStart}T00:00:00`)
      .lt("paid_at", `${periodEnd}T23:59:59.999`)
      .returns<InvoiceWithClient[]>(),
    supabase.from("employees").select("*").eq("is_founder", true).returns<Employee[]>(),
  ]);

  if (invoicesError) throw new Error(invoicesError.message);
  if (foundersError) throw new Error(foundersError.message);

  const founderIds = (founders ?? []).map((f) => f.id);
  const clientIds = Array.from(
    new Set((invoices ?? []).map((inv) => inv.clients?.id).filter((id): id is string => Boolean(id)))
  );
  const { data: splitRows, error: splitError } = clientIds.length
    ? await supabase.from("client_payout_splits").select("*").in("client_id", clientIds).returns<ClientPayoutSplit[]>()
    : { data: [] as ClientPayoutSplit[], error: null };
  if (splitError) throw new Error(splitError.message);

  const shares: ShareInput[] = [];
  let conversionTotalCents = 0;
  let esqueTotalCents = 0;

  // Hourly / contractor invoices: no salary deduction, no split — the full
  // converted amount is retained as ESQUE.
  for (const inv of invoices ?? []) {
    if (inv.payout_type !== "hourly" || !inv.conversion_rate) continue;
    const conversion = convertToInrCents(inv.amount_cents, inv.conversion_rate);
    conversionTotalCents += conversion;
    esqueTotalCents += conversion;
  }

  // Bonus invoices: 70% to the handler(s) / 30% held for ESQUE.
  for (const inv of invoices ?? []) {
    if (inv.payout_type !== "bonus" || !inv.conversion_rate || !inv.clients) continue;
    const conversion = convertToInrCents(inv.amount_cents, inv.conversion_rate);
    conversionTotalCents += conversion;
    const { handlerPoolCents, esqueCents } = calculateBonusSplit(conversion);
    esqueTotalCents += esqueCents;

    const handlerId = inv.clients.sales_owner_id;
    if (!handlerId) {
      // No handler on file: nothing to attribute to, so it falls back into
      // ESQUE rather than being silently dropped.
      esqueTotalCents += handlerPoolCents;
      continue;
    }
    if (inv.bonus_co_handler_employee_id) {
      const [founderPart, coHandlerPart] = splitProportional(handlerPoolCents, [
        inv.bonus_handler_share_percent,
        100 - inv.bonus_handler_share_percent,
      ]);
      shares.push({ employee_id: handlerId, category: "bonus", source_invoice_id: inv.id, amount_inr_cents: founderPart });
      shares.push({
        employee_id: inv.bonus_co_handler_employee_id,
        category: "bonus",
        source_invoice_id: inv.id,
        amount_inr_cents: coHandlerPart,
      });
    } else {
      shares.push({ employee_id: handlerId, category: "bonus", source_invoice_id: inv.id, amount_inr_cents: handlerPoolCents });
    }
  }

  // Normal invoices: grouped by client (so multiple invoices for the same
  // Foundation Account client combine before the pairing rule applies, and
  // so weekly-billed fixed-base clients see their whole month at once),
  // then split 10/50/32/8. Also bucketed by project within each client, so
  // a client with multiple separately-billed "seats" (project_id) can
  // attribute sales/ops credit differently per seat — see attributeCredit.
  // Project buckets are keyed by project id, or "" for invoices with no
  // project tag (the client's general/default work).
  const normalByClient = new Map<
    string,
    {
      clientId: string;
      salesOwnerId: string | null;
      opsOwnerId: string | null;
      isFoundation: boolean;
      fixedPayoutBaseUsdCents: number | null;
      totalInrCents: number;
      rawUsdCents: number;
      rateSum: number;
      rateCount: number;
      projectBuckets: Map<string, number>;
    }
  >();
  for (const inv of invoices ?? []) {
    if (inv.payout_type !== "normal" || !inv.conversion_rate || !inv.clients) continue;
    const conversion = convertToInrCents(inv.amount_cents, inv.conversion_rate);
    conversionTotalCents += conversion;
    const clientId = inv.clients.id;
    const bucketKey = inv.project_id ?? "";
    const existing = normalByClient.get(clientId);
    if (existing) {
      existing.totalInrCents += conversion;
      existing.rawUsdCents += inv.amount_cents;
      existing.rateSum += inv.conversion_rate;
      existing.rateCount += 1;
      existing.projectBuckets.set(bucketKey, (existing.projectBuckets.get(bucketKey) ?? 0) + conversion);
    } else {
      normalByClient.set(clientId, {
        clientId,
        salesOwnerId: inv.clients.sales_owner_id,
        opsOwnerId: inv.clients.ops_owner_id,
        isFoundation: inv.clients.is_foundation_account,
        fixedPayoutBaseUsdCents: inv.clients.fixed_payout_base_usd_cents,
        totalInrCents: conversion,
        rawUsdCents: inv.amount_cents,
        rateSum: inv.conversion_rate,
        rateCount: 1,
        projectBuckets: new Map([[bucketKey, conversion]]),
      });
    }
  }

  // Per-client fixed payout base: replaces the real conversion total as the
  // split basis for that client, with whatever was actually billed above
  // the base going 100% to the Sales owner (falling back to ESQUE if no
  // owner is set, so money is never silently dropped).
  for (const client of normalByClient.values()) {
    if (client.fixedPayoutBaseUsdCents === null) continue;
    const avgConversionRate = client.rateSum / client.rateCount;
    const { baseInrCents, excessInrCents } = computeFixedBaseExcess(
      client.rawUsdCents,
      client.fixedPayoutBaseUsdCents,
      avgConversionRate
    );
    client.totalInrCents = baseInrCents;
    if (excessInrCents > 0) {
      if (client.salesOwnerId) {
        shares.push({
          employee_id: client.salesOwnerId,
          category: "client_excess",
          source_invoice_id: null,
          amount_inr_cents: excessInrCents,
        });
      } else {
        esqueTotalCents += excessInrCents;
      }
    }
  }

  // Policy §5 — Foundation Accounts. Only applies when exactly two
  // Foundation clients have paid invoices this month.
  const foundationClients = Array.from(normalByClient.values()).filter((c) => c.isFoundation);
  let foundationExcessCents = 0;
  let cappedClientId: string | null = null;
  let cappedToInrCents = 0;

  if (foundationClients.length === 2) {
    const excess = computeFoundationExcess(
      { clientId: foundationClients[0].clientId, ownerEmployeeId: foundationClients[0].salesOwnerId, totalInrCents: foundationClients[0].totalInrCents },
      { clientId: foundationClients[1].clientId, ownerEmployeeId: foundationClients[1].salesOwnerId, totalInrCents: foundationClients[1].totalInrCents }
    );
    if (excess) {
      foundationExcessCents = excess.excessInrCents;
      cappedClientId = excess.cappedClientId;
      cappedToInrCents = excess.cappedToInrCents;
      shares.push({
        employee_id: excess.excessOwnerEmployeeId,
        category: "foundation_excess",
        source_invoice_id: null,
        amount_inr_cents: foundationExcessCents,
      });
    }
  }

  let partnersPoolCents = 0;
  for (const client of normalByClient.values()) {
    const splitBasis = client.clientId === cappedClientId ? cappedToInrCents : client.totalInrCents;
    const split = calculateNormalSplit(splitBasis);
    esqueTotalCents += split.esque;
    partnersPoolCents += split.partners;

    // Distribute the client's sales/ops pool across whichever projects
    // ("seats") actually generated the revenue, weighted by each project's
    // share of the client's raw invoiced total (unaffected by the fixed
    // payout base or Foundation Account cap above, which only scale the
    // overall pool size, not the per-project mix) — so a client with no
    // project-tagged invoices gets exactly one bucket (project_id "") and
    // behaves exactly as before this feature existed.
    const bucketEntries = Array.from(client.projectBuckets.entries());
    const salesParts = splitProportional(
      split.sales,
      bucketEntries.map(([, amount]) => amount)
    );
    const opsParts = splitProportional(
      split.operations,
      bucketEntries.map(([, amount]) => amount)
    );
    bucketEntries.forEach(([bucketKey], i) => {
      const projectId = bucketKey || null;
      attributeCredit(shares, "sales", salesParts[i], splitRows ?? [], client.clientId, "sales", client.salesOwnerId, founderIds, projectId);
      attributeCredit(shares, "ops", opsParts[i], splitRows ?? [], client.clientId, "ops", client.opsOwnerId, founderIds, projectId);
    });
  }

  // Partners' pool is summed across all normal invoices for the month, then
  // divided evenly across every founder (generalizes the old calculator's
  // hardcoded /3).
  if (founderIds.length > 0 && partnersPoolCents > 0) {
    const parts = splitProportional(
      partnersPoolCents,
      founderIds.map(() => 1)
    );
    founderIds.forEach((id, i) => {
      shares.push({ employee_id: id, category: "partner", source_invoice_id: null, amount_inr_cents: parts[i] });
    });
  }

  // Salary deduction: each founder's flat monthly salary, subtracted once
  // from their summed shares for the month, floored at 0.
  for (const founder of founders ?? []) {
    const earnedCents = shares
      .filter((s) => s.employee_id === founder.id)
      .reduce((sum, s) => sum + s.amount_inr_cents, 0);
    const salaryCents = founderMonthlySalaryCents(founder);
    const deductionCents = -Math.min(salaryCents, Math.max(earnedCents, 0));
    shares.push({ employee_id: founder.id, category: "salary", source_invoice_id: null, amount_inr_cents: deductionCents });
  }

  const { error: rpcError } = await supabase.rpc("replace_founder_payout_month", {
    p_period_start: periodStart,
    p_period_end: periodEnd,
    p_conversion_total_inr_cents: conversionTotalCents,
    p_esque_total_inr_cents: esqueTotalCents,
    p_foundation_excess_inr_cents: foundationExcessCents,
    p_shares: shares,
  });

  if (rpcError) throw new Error(rpcError.message);

  revalidatePath("/founders");
  revalidatePath("/payroll/annual");
}

// Admin-only manual trigger (the "Recompute this month" button on
// /founders), for reconciling after a retroactive edit — e.g. fixing a
// client's owner or an invoice's conversion rate after it was already paid.
export async function recomputeFounderPayoutForMonthAction(periodStart: string) {
  await requireAdmin();
  const supabase = await createClient();
  await recomputeFounderPayoutForMonth(supabase, periodStart);
}
