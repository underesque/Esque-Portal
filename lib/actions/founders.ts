"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { logActivity } from "@/lib/actions/activityLog";
import { toMinorUnits } from "@/lib/format";
import type { FounderRole } from "@/lib/types";

const assignmentSchema = z.object({
  employee_id: z.string().uuid(),
  role: z.enum(["sales", "operations", "partner"]),
});

export async function addFounderAssignment(formData: FormData) {
  const { user } = await requireAdmin();
  const data = assignmentSchema.parse({
    employee_id: formData.get("employee_id"),
    role: formData.get("role"),
  });

  const supabase = await createClient();
  const { error } = await supabase
    .from("founder_assignments")
    .upsert(
      { employee_id: data.employee_id, role: data.role, active: true },
      { onConflict: "employee_id,role" }
    );

  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "assigned", "founder_role", data.employee_id, {
    role: data.role,
  });

  revalidatePath("/founders");
}

export async function removeFounderAssignment(assignmentId: string) {
  const { user } = await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("founder_assignments")
    .delete()
    .eq("id", assignmentId);

  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "removed", "founder_role", assignmentId);

  revalidatePath("/founders");
}

// Splits `total` (integer minor units) evenly across `n` recipients so the
// parts sum back to exactly `total` — the first `remainder` recipients get
// one extra unit rather than losing paise to rounding.
function splitEven(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  const remainder = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0));
}

// Splits `total` proportionally to `weights` (e.g. each sales founder's own
// client revenue for the period), using the largest-remainder method so the
// parts still sum back to exactly `total`. Falls back to an even split if
// every weight is zero (no revenue to attribute yet).
function splitProportional(total: number, weights: number[]): number[] {
  const sumWeights = weights.reduce((a, b) => a + b, 0);
  if (sumWeights <= 0) return splitEven(total, weights.length);

  const raw = weights.map((w) => (w / sumWeights) * total);
  const floors = raw.map(Math.floor);
  const remainder = total - floors.reduce((a, b) => a + b, 0);

  const byFraction = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);

  const result = [...floors];
  for (let k = 0; k < remainder; k++) result[byFraction[k].i] += 1;
  return result;
}

const runSchema = z.object({
  period_start: z.string().min(1),
  period_end: z.string().min(1),
  revenue_usd: z.coerce.number().min(0).optional(),
  exchange_rate: z.coerce.number().positive().optional(),
  revenue_inr: z.coerce.number().min(0).optional(),
  total_salaries_inr: z.coerce.number().min(0).default(0),
  notes: z.string().optional(),
});

export async function runDistribution(formData: FormData) {
  const { user } = await requireAdmin();
  const parsed = runSchema.parse({
    period_start: formData.get("period_start"),
    period_end: formData.get("period_end"),
    revenue_usd: formData.get("revenue_usd") || undefined,
    exchange_rate: formData.get("exchange_rate") || undefined,
    revenue_inr: formData.get("revenue_inr") || undefined,
    total_salaries_inr: formData.get("total_salaries_inr") || 0,
    notes: formData.get("notes") || "",
  });

  let revenueInrCents: number;
  if (parsed.revenue_inr !== undefined) {
    revenueInrCents = toMinorUnits(parsed.revenue_inr);
  } else if (parsed.revenue_usd !== undefined && parsed.exchange_rate !== undefined) {
    revenueInrCents = Math.round(parsed.revenue_usd * parsed.exchange_rate * 100);
  } else {
    throw new Error("Provide either an INR revenue amount, or a USD amount with an exchange rate.");
  }

  const totalSalariesInrCents = toMinorUnits(parsed.total_salaries_inr);
  const distributableInrCents = revenueInrCents - totalSalariesInrCents;

  if (distributableInrCents < 0) {
    throw new Error("Total salaries exceed the revenue collected for this period.");
  }

  const supabase = await createClient();

  const { data: assignments, error: assignmentsError } = await supabase
    .from("founder_assignments")
    .select("employee_id, role")
    .eq("active", true);

  if (assignmentsError) throw new Error(assignmentsError.message);

  const byRole = (role: FounderRole) =>
    (assignments ?? []).filter((a) => a.role === role).map((a) => a.employee_id);
  const salesEmployeeIds = byRole("sales");

  // Attribute the period's client payments to whoever owns each client, so
  // the sales pool splits by whose clients actually generated the revenue —
  // not evenly. Payments on clients with no owner (or an owner who isn't a
  // current sales founder) are pooled and shared evenly across sales
  // founders, since no one person can claim credit for them.
  let salesWeights: number[] = [];
  if (salesEmployeeIds.length > 0) {
    const { data: periodPayments, error: paymentsError } = await supabase
      .from("payments")
      .select("amount_cents, clients(sales_owner_id)")
      .gte("payment_date", parsed.period_start)
      .lte("payment_date", parsed.period_end);

    if (paymentsError) throw new Error(paymentsError.message);

    const attributedByOwner = new Map<string, number>();
    let unattributedCents = 0;

    (periodPayments ?? []).forEach((p) => {
      const ownerId = (p.clients as unknown as { sales_owner_id: string | null } | null)
        ?.sales_owner_id;
      if (ownerId && salesEmployeeIds.includes(ownerId)) {
        attributedByOwner.set(ownerId, (attributedByOwner.get(ownerId) ?? 0) + p.amount_cents);
      } else {
        unattributedCents += p.amount_cents;
      }
    });

    const unattributedShare = unattributedCents / salesEmployeeIds.length;
    salesWeights = salesEmployeeIds.map(
      (id) => (attributedByOwner.get(id) ?? 0) + unattributedShare
    );
  }

  const salesPoolCents = Math.round(distributableInrCents * 0.1);
  const opsPoolCents = Math.round(distributableInrCents * 0.5);
  const partnerPoolCents = Math.round(distributableInrCents * 0.32);

  let companyRetainedInrCents = distributableInrCents - salesPoolCents - opsPoolCents - partnerPoolCents;

  const shares: {
    employee_id: string;
    role: FounderRole;
    percent_of_pool: number;
    amount_inr_cents: number;
  }[] = [];

  function allocate(
    role: FounderRole,
    poolCents: number,
    employeeIds: string[],
    weights?: number[]
  ) {
    if (employeeIds.length === 0) {
      companyRetainedInrCents += poolCents;
      return;
    }
    const parts = weights ? splitProportional(poolCents, weights) : splitEven(poolCents, employeeIds.length);
    employeeIds.forEach((employeeId, i) => {
      shares.push({
        employee_id: employeeId,
        role,
        percent_of_pool: Number(((parts[i] / distributableInrCents) * 100).toFixed(3)),
        amount_inr_cents: parts[i],
      });
    });
  }

  allocate("sales", salesPoolCents, salesEmployeeIds, salesWeights);
  allocate("operations", opsPoolCents, byRole("operations"));
  allocate("partner", partnerPoolCents, byRole("partner"));

  const { data: run, error: runError } = await supabase
    .from("distribution_runs")
    .insert({
      period_start: parsed.period_start,
      period_end: parsed.period_end,
      revenue_usd_cents: parsed.revenue_usd !== undefined ? toMinorUnits(parsed.revenue_usd) : null,
      exchange_rate: parsed.exchange_rate ?? null,
      revenue_inr_cents: revenueInrCents,
      total_salaries_inr_cents: totalSalariesInrCents,
      distributable_inr_cents: distributableInrCents,
      company_retained_inr_cents: companyRetainedInrCents,
      notes: parsed.notes || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (runError) throw new Error(runError.message);

  if (shares.length > 0) {
    const { error: sharesError } = await supabase
      .from("distribution_shares")
      .insert(shares.map((s) => ({ ...s, run_id: run.id })));
    if (sharesError) throw new Error(sharesError.message);
  }

  await logActivity(supabase, user.id, "processed", "distribution_run", run.id, {
    distributable_inr_cents: distributableInrCents,
  });

  revalidatePath("/founders");
}

export async function deleteDistributionRun(runId: string) {
  const { user } = await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase.from("distribution_runs").delete().eq("id", runId);
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "deleted", "distribution_run", runId);

  revalidatePath("/founders");
}
