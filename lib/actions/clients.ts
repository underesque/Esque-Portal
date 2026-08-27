"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/actions/activityLog";
import { toMinorUnits } from "@/lib/format";
import type { ClientStatus, CommunicationType } from "@/lib/types";

const clientSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email().or(z.literal("")).optional(),
  business_name: z.string().optional(),
  business_website: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  status: z.enum(["active", "inactive", "prospect"]),
  notes: z.string().optional(),
  sales_owner_id: z.string().uuid().or(z.literal("")).optional(),
});

function readClientForm(formData: FormData) {
  const parsed = clientSchema.parse({
    name: formData.get("name"),
    email: formData.get("email") || "",
    business_name: formData.get("business_name") || "",
    business_website: formData.get("business_website") || "",
    phone: formData.get("phone") || "",
    address: formData.get("address") || "",
    status: formData.get("status") || "active",
    notes: formData.get("notes") || "",
    sales_owner_id: formData.get("sales_owner_id") || "",
  });
  return { ...parsed, sales_owner_id: parsed.sales_owner_id || null };
}

export async function createClientRecord(formData: FormData) {
  const { user } = await requireUser();
  const data = readClientForm(formData);
  const supabase = await createClient();

  const { data: created, error } = await supabase
    .from("clients")
    .insert({ ...data, created_by: user.id })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "created", "client", created.id, {
    name: data.name,
  });

  revalidatePath("/clients");
  redirect(`/clients/${created.id}`);
}

export async function updateClientRecord(clientId: string, formData: FormData) {
  const { user } = await requireUser();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { sales_owner_id, ...data } = readClientForm(formData);
  const supabase = await createClient();

  // sales_owner_id is intentionally excluded — it has its own dedicated
  // control (updateClientSalesOwner) elsewhere on the client page, and this
  // form doesn't carry that field, so including it here would null it out.
  const { error } = await supabase.from("clients").update(data).eq("id", clientId);
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "updated", "client", clientId, {
    name: data.name,
  });

  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}`);
}

export async function updateClientStatus(clientId: string, status: ClientStatus) {
  const { user } = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase.from("clients").update({ status }).eq("id", clientId);
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "status_changed", "client", clientId, { status });

  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
}

export async function updateClientSalesOwner(clientId: string, formData: FormData) {
  const { user } = await requireUser();
  const salesOwnerId = String(formData.get("sales_owner_id") ?? "") || null;
  const supabase = await createClient();

  const { error } = await supabase
    .from("clients")
    .update({ sales_owner_id: salesOwnerId })
    .eq("id", clientId);

  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "updated", "client", clientId, {
    sales_owner_id: salesOwnerId,
  });

  revalidatePath(`/clients/${clientId}`);
}

const payoutSettingsSchema = z.object({
  ops_owner_id: z.string().uuid().or(z.literal("")).optional(),
  is_foundation_account: z.coerce.boolean(),
  default_payout_type: z.enum(["normal", "hourly", "bonus"]),
  fixed_payout_base_usd: z.coerce.number().min(0).optional(),
});

// One-time-per-client founder payout settings — replaces the per-row fields
// the old FounderPayoutCalculator required every month (ops owner, whether
// this is a Foundation Account, the default payout type new invoices for
// this client should use, and an optional fixed monthly payout base for
// clients whose founder payout is calculated off a fixed figure rather than
// the real invoiced total).
export async function updateClientPayoutSettings(clientId: string, formData: FormData) {
  const { user } = await requireUser();
  const data = payoutSettingsSchema.parse({
    ops_owner_id: formData.get("ops_owner_id") || "",
    is_foundation_account: formData.get("is_foundation_account") === "on",
    default_payout_type: formData.get("default_payout_type") || "normal",
    fixed_payout_base_usd: formData.get("fixed_payout_base_usd") || undefined,
  });
  const supabase = await createClient();

  const { error } = await supabase
    .from("clients")
    .update({
      ops_owner_id: data.ops_owner_id || null,
      is_foundation_account: data.is_foundation_account,
      default_payout_type: data.default_payout_type,
      fixed_payout_base_usd_cents:
        data.fixed_payout_base_usd !== undefined ? toMinorUnits(data.fixed_payout_base_usd) : null,
    })
    .eq("id", clientId);

  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "updated", "client", clientId, {
    payout_settings: data,
  });

  revalidatePath(`/clients/${clientId}`);
}

const payoutSplitSchema = z.object({
  project_id: z.string().uuid().or(z.literal("")).optional(),
  split_type: z.enum(["sales", "ops"]),
  employee_id: z.string().uuid(),
  share_percent: z.coerce.number().positive().max(100),
});

// Only needed for the rare client whose sales/ops credit isn't 100% to one
// person — most clients never touch this. Optionally scoped to one project
// (a "seat" under this client billed/attributed separately) rather than
// the whole client; omit project_id for the client-wide default.
export async function addClientPayoutSplit(clientId: string, formData: FormData) {
  const { user } = await requireUser();
  const data = payoutSplitSchema.parse({
    project_id: formData.get("project_id") || "",
    split_type: formData.get("split_type"),
    employee_id: formData.get("employee_id"),
    share_percent: formData.get("share_percent"),
  });
  const supabase = await createClient();

  const { error } = await supabase.from("client_payout_splits").insert({
    client_id: clientId,
    project_id: data.project_id || null,
    split_type: data.split_type,
    employee_id: data.employee_id,
    share_percent: data.share_percent,
  });

  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "added", "client_payout_split", clientId, data);

  revalidatePath(`/clients/${clientId}`);
}

export async function removeClientPayoutSplit(clientId: string, splitId: string) {
  const { user } = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase.from("client_payout_splits").delete().eq("id", splitId);
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "removed", "client_payout_split", clientId);

  revalidatePath(`/clients/${clientId}`);
}

const clientAssignmentSchema = z.object({
  employee_id: z.string().uuid(),
  role: z.string().optional(),
});

// Staffing — which employees work on this client account. Distinct from
// sales_owner_id/ops_owner_id (founder payout attribution): this is purely
// "who's on the team," visible/manageable by any signed-in staff, same as
// the client record itself.
export async function addClientAssignment(clientId: string, formData: FormData) {
  const { user } = await requireUser();
  const data = clientAssignmentSchema.parse({
    employee_id: formData.get("employee_id"),
    role: formData.get("role") || "",
  });
  const supabase = await createClient();

  const { error } = await supabase.from("client_assignments").insert({
    client_id: clientId,
    employee_id: data.employee_id,
    role: data.role || null,
  });

  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "assigned", "client", clientId, {
    employee_id: data.employee_id,
  });

  revalidatePath(`/clients/${clientId}`);
}

export async function removeClientAssignment(clientId: string, assignmentId: string) {
  const { user } = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase.from("client_assignments").delete().eq("id", assignmentId);
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "unassigned", "client", clientId);

  revalidatePath(`/clients/${clientId}`);
}

export async function addCommunication(clientId: string, formData: FormData) {
  const { user } = await requireUser();
  const type = String(formData.get("type") ?? "note") as CommunicationType;
  const subject = String(formData.get("subject") ?? "");
  const body = String(formData.get("body") ?? "");

  if (!subject) throw new Error("Subject is required");

  const supabase = await createClient();
  const { error } = await supabase.from("client_communications").insert({
    client_id: clientId,
    type,
    subject,
    body: body || null,
    created_by: user.id,
  });

  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "logged_communication", "client", clientId, {
    type,
    subject,
  });

  revalidatePath(`/clients/${clientId}`);
}
