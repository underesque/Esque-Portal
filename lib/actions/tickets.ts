"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/actions/activityLog";

const ticketSchema = z.object({
  type: z.enum(["internal", "client"]),
  subject: z.string().min(1, "Subject is required"),
  description: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  client_id: z.string().uuid().or(z.literal("")).optional(),
  about_employee_id: z.string().uuid().or(z.literal("")).optional(),
  assignee_id: z.string().uuid().or(z.literal("")).optional(),
});

export async function createTicket(formData: FormData) {
  const { user } = await requireUser();
  const data = ticketSchema.parse({
    type: formData.get("type"),
    subject: formData.get("subject"),
    description: formData.get("description") || "",
    priority: formData.get("priority") || "medium",
    client_id: formData.get("client_id") || "",
    about_employee_id: formData.get("about_employee_id") || "",
    assignee_id: formData.get("assignee_id") || "",
  });

  if (data.type === "client" && !data.client_id) {
    throw new Error("A client ticket needs a client.");
  }

  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("tickets")
    .insert({
      type: data.type,
      subject: data.subject,
      description: data.description || null,
      priority: data.priority,
      client_id: data.type === "client" ? data.client_id || null : null,
      about_employee_id: data.type === "internal" ? data.about_employee_id || null : null,
      assignee_id: data.assignee_id || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "created", "ticket", created.id, {
    subject: data.subject,
    type: data.type,
  });

  revalidatePath("/tickets");
  redirect(`/tickets/${created.id}`);
}

export async function updateTicketStatus(ticketId: string, status: string) {
  const { user } = await requireUser();
  const supabase = await createClient();

  const resolvedStatuses = ["resolved", "closed"];
  const resolvedAt = resolvedStatuses.includes(status) ? new Date().toISOString() : null;

  const { error } = await supabase
    .from("tickets")
    .update({ status, resolved_at: resolvedAt })
    .eq("id", ticketId);

  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "status_changed", "ticket", ticketId, { status });

  revalidatePath("/tickets");
  revalidatePath(`/tickets/${ticketId}`);
}

export async function updateTicketPriority(ticketId: string, priority: string) {
  const { user } = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase.from("tickets").update({ priority }).eq("id", ticketId);
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "priority_changed", "ticket", ticketId, { priority });

  revalidatePath("/tickets");
  revalidatePath(`/tickets/${ticketId}`);
}

export async function updateTicketAssignee(ticketId: string, assigneeId: string) {
  const { user } = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("tickets")
    .update({ assignee_id: assigneeId || null })
    .eq("id", ticketId);
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "assigned", "ticket", ticketId, {
    assignee_id: assigneeId || null,
  });

  revalidatePath("/tickets");
  revalidatePath(`/tickets/${ticketId}`);
}

export async function addTicketComment(ticketId: string, formData: FormData) {
  const { user } = await requireUser();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) throw new Error("Comment can't be empty.");

  const supabase = await createClient();
  const { error } = await supabase.from("ticket_comments").insert({
    ticket_id: ticketId,
    body,
    created_by: user.id,
  });

  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "commented", "ticket", ticketId);

  revalidatePath(`/tickets/${ticketId}`);
}

export async function deleteTicket(ticketId: string) {
  const { user } = await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase.from("tickets").delete().eq("id", ticketId);
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "deleted", "ticket", ticketId);

  revalidatePath("/tickets");
  redirect("/tickets");
}
