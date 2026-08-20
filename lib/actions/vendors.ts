"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { logActivity } from "@/lib/actions/activityLog";
import { toMinorUnits } from "@/lib/format";
import type { BillingFrequency } from "@/lib/types";

const vendorSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.string().optional(),
  contact_name: z.string().optional(),
  contact_email: z.string().email().or(z.literal("")).optional(),
  contact_phone: z.string().optional(),
  billing_frequency: z.enum(["monthly", "quarterly", "biannual", "annual", "one_time"]),
  amount: z.coerce.number().min(0),
  next_due_date: z.string().optional(),
  status: z.enum(["active", "inactive"]),
  notes: z.string().optional(),
});

function readVendorForm(formData: FormData) {
  return vendorSchema.parse({
    name: formData.get("name"),
    category: formData.get("category") || "",
    contact_name: formData.get("contact_name") || "",
    contact_email: formData.get("contact_email") || "",
    contact_phone: formData.get("contact_phone") || "",
    billing_frequency: formData.get("billing_frequency") || "monthly",
    amount: formData.get("amount") || 0,
    next_due_date: formData.get("next_due_date") || "",
    status: formData.get("status") || "active",
    notes: formData.get("notes") || "",
  });
}

export async function createVendor(formData: FormData) {
  const { user } = await requireAdmin();
  const data = readVendorForm(formData);
  const supabase = await createClient();

  const { data: created, error } = await supabase
    .from("vendors")
    .insert({
      name: data.name,
      category: data.category || null,
      contact_name: data.contact_name || null,
      contact_email: data.contact_email || null,
      contact_phone: data.contact_phone || null,
      billing_frequency: data.billing_frequency,
      amount_cents: toMinorUnits(data.amount),
      next_due_date: data.next_due_date || null,
      status: data.status,
      notes: data.notes || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "created", "vendor", created.id, { name: data.name });

  revalidatePath("/vendors");
  redirect("/vendors");
}

export async function updateVendor(vendorId: string, formData: FormData) {
  const { user } = await requireAdmin();
  const data = readVendorForm(formData);
  const supabase = await createClient();

  const { error } = await supabase
    .from("vendors")
    .update({
      name: data.name,
      category: data.category || null,
      contact_name: data.contact_name || null,
      contact_email: data.contact_email || null,
      contact_phone: data.contact_phone || null,
      billing_frequency: data.billing_frequency,
      amount_cents: toMinorUnits(data.amount),
      next_due_date: data.next_due_date || null,
      status: data.status,
      notes: data.notes || null,
    })
    .eq("id", vendorId);

  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "updated", "vendor", vendorId, { name: data.name });

  revalidatePath("/vendors");
  redirect("/vendors");
}

export async function deleteVendor(vendorId: string) {
  const { user } = await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase.from("vendors").delete().eq("id", vendorId);
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "deleted", "vendor", vendorId);

  revalidatePath("/vendors");
}

const FREQUENCY_MONTHS: Record<BillingFrequency, number> = {
  monthly: 1,
  quarterly: 3,
  biannual: 6,
  annual: 12,
  one_time: 0,
};

export async function markVendorPaid(vendorId: string) {
  const { user } = await requireAdmin();
  const supabase = await createClient();

  const { data: vendor, error: fetchError } = await supabase
    .from("vendors")
    .select("billing_frequency, next_due_date")
    .eq("id", vendorId)
    .single();

  if (fetchError || !vendor) throw new Error("Vendor not found");

  const months = FREQUENCY_MONTHS[vendor.billing_frequency as BillingFrequency];
  let nextDueDate: string | null = null;

  if (months > 0) {
    const base = vendor.next_due_date ? new Date(vendor.next_due_date) : new Date();
    base.setMonth(base.getMonth() + months);
    nextDueDate = base.toISOString().slice(0, 10);
  }

  const { error } = await supabase
    .from("vendors")
    .update({ next_due_date: nextDueDate })
    .eq("id", vendorId);

  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "paid", "vendor", vendorId, { next_due_date: nextDueDate });

  revalidatePath("/vendors");
  revalidatePath("/notifications");
}
