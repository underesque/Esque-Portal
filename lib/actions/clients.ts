"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/actions/activityLog";
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
  const data = readClientForm(formData);
  const supabase = await createClient();

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
