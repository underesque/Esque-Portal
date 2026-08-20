"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/actions/activityLog";
import { toMinorUnits } from "@/lib/format";

const invoiceSchema = z.object({
  invoice_number: z.string().min(1),
  amount: z.coerce.number().positive(),
  status: z.enum(["draft", "sent", "paid", "overdue", "void"]),
  issued_date: z.string().min(1),
  due_date: z.string().optional(),
  notes: z.string().optional(),
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
  });

  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("invoices")
    .insert({
      client_id: clientId,
      invoice_number: data.invoice_number,
      amount_cents: toMinorUnits(data.amount),
      status: data.status,
      issued_date: data.issued_date,
      due_date: data.due_date || null,
      notes: data.notes || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "created", "invoice", created.id, {
    invoice_number: data.invoice_number,
  });

  revalidatePath(`/clients/${clientId}`);
}

export async function updateInvoiceStatus(
  clientId: string,
  invoiceId: string,
  status: string
) {
  const { user } = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("invoices")
    .update({ status })
    .eq("id", invoiceId);

  if (error) throw new Error(error.message);

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
    await supabase.from("invoices").update({ status: "paid" }).eq("id", invoiceId);
  }

  await logActivity(supabase, user.id, "recorded", "payment", created.id, {
    amount_cents: toMinorUnits(data.amount),
  });

  revalidatePath(`/clients/${clientId}`);
}
