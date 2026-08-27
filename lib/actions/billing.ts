"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/actions/activityLog";
import { toMinorUnits } from "@/lib/format";
import { recomputeFounderPayoutForMonth } from "@/lib/actions/payout";

const invoiceSchema = z.object({
  invoice_number: z.string().min(1),
  amount: z.coerce.number().positive(),
  status: z.enum(["draft", "sent", "paid", "overdue", "void"]),
  issued_date: z.string().min(1),
  due_date: z.string().optional(),
  notes: z.string().optional(),
  conversion_rate: z.coerce.number().positive().optional(),
  payout_type: z.enum(["normal", "hourly", "bonus"]).default("normal"),
  project_id: z.string().uuid().or(z.literal("")).optional(),
});

export async function createInvoice(clientId: string, formData: FormData) {
  const { user } = await requireUser();
  const data = invoiceSchema.parse({
    invoice_number: formData.get("invoice_number"),
    amount: formData.get("amount"),
    status: formData.get("status") || "draft",
    issued_date: formData.get("issued_date"),
    due_date: formData.get("due_date") || "",
    notes: formData.get("notes") || "",
    conversion_rate: formData.get("conversion_rate") || undefined,
    payout_type: formData.get("payout_type") || "normal",
    project_id: formData.get("project_id") || "",
  });

  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("invoices")
    .insert({
      client_id: clientId,
      project_id: data.project_id || null,
      invoice_number: data.invoice_number,
      amount_cents: toMinorUnits(data.amount),
      status: "draft",
      issued_date: data.issued_date,
      due_date: data.due_date || null,
      notes: data.notes || null,
      conversion_rate: data.conversion_rate ?? null,
      payout_type: data.payout_type,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "created", "invoice", created.id, {
    invoice_number: data.invoice_number,
  });

  // Always insert as draft, then transition to the requested status through
  // the same path status changes use. Inserting directly with the final
  // status (e.g. "paid") doesn't work here: syncInvoicePayout re-fetches
  // the row to detect a transition, and a row inserted already-"paid" looks
  // like no transition happened, so paid_at never gets set.
  if (data.status !== "draft") {
    await syncInvoicePayout(supabase, created.id, data.status);
  }

  revalidatePath(`/clients/${clientId}`);
}

// Keeps an invoice's paid_at timestamp and the founder payout for its month
// in sync with its status. Shared by updateInvoiceStatus and recordPayment
// — the two places invoices.status can become "paid" — so an admin marking
// an invoice paid always triggers the same automatic recomputation,
// wherever they do it from.
async function syncInvoicePayout(supabase: SupabaseClient, invoiceId: string, newStatus: string) {
  const { data: current, error: fetchError } = await supabase
    .from("invoices")
    .select("status, paid_at, conversion_rate")
    .eq("id", invoiceId)
    .single();
  if (fetchError) throw new Error(fetchError.message);

  const becomingPaid = newStatus === "paid" && current.status !== "paid";
  const leavingPaid = newStatus !== "paid" && current.status === "paid";

  if (becomingPaid && !current.conversion_rate) {
    throw new Error("Set a conversion rate on this invoice before marking it paid.");
  }

  const paidAt = becomingPaid ? new Date().toISOString() : leavingPaid ? null : current.paid_at;

  const { error } = await supabase
    .from("invoices")
    .update({ status: newStatus, paid_at: paidAt })
    .eq("id", invoiceId);

  if (error) throw new Error(error.message);

  if (becomingPaid) {
    await recomputeFounderPayoutForMonth(supabase, paidAt!);
  } else if (leavingPaid && current.paid_at) {
    await recomputeFounderPayoutForMonth(supabase, current.paid_at);
  }
}

export async function updateInvoiceStatus(
  clientId: string,
  invoiceId: string,
  status: string
) {
  const { user } = await requireUser();
  const supabase = await createClient();

  await syncInvoicePayout(supabase, invoiceId, status);

  await logActivity(supabase, user.id, "status_changed", "invoice", invoiceId, {
    status,
  });

  revalidatePath(`/clients/${clientId}`);
}

const paymentSchema = z.object({
  amount: z.coerce.number().positive(),
  payment_date: z.string().min(1),
  method: z.string().optional(),
  notes: z.string().optional(),
});

export async function recordPayment(
  clientId: string,
  invoiceId: string | null,
  formData: FormData
) {
  const { user } = await requireUser();
  const data = paymentSchema.parse({
    amount: formData.get("amount"),
    payment_date: formData.get("payment_date"),
    method: formData.get("method") || "",
    notes: formData.get("notes") || "",
  });

  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("payments")
    .insert({
      client_id: clientId,
      invoice_id: invoiceId,
      amount_cents: toMinorUnits(data.amount),
      payment_date: data.payment_date,
      method: data.method || null,
      notes: data.notes || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  if (invoiceId) {
    await syncInvoicePayout(supabase, invoiceId, "paid");
  }

  await logActivity(supabase, user.id, "recorded", "payment", created.id, {
    amount_cents: toMinorUnits(data.amount),
  });

  revalidatePath(`/clients/${clientId}`);
}
