"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/actions/activityLog";
import { toMinorUnits } from "@/lib/format";

const projectSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  status: z.enum(["not_started", "ongoing", "completed", "blocked_by_client"]),
  project_type: z.enum(["monthly", "one_time"]),
});

export async function createProject(clientId: string, formData: FormData) {
  const { user } = await requireUser();
  const data = projectSchema.parse({
    name: formData.get("name"),
    description: formData.get("description") || "",
    status: formData.get("status") || "not_started",
    project_type: formData.get("project_type") || "one_time",
  });
  const supabase = await createClient();

  const { data: created, error } = await supabase
    .from("projects")
    .insert({
      client_id: clientId,
      name: data.name,
      description: data.description || null,
      status: data.status,
      project_type: data.project_type,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "created", "project", created.id, { name: data.name });

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/projects");
}

export async function updateProjectStatus(projectId: string, status: string) {
  const { user } = await requireUser();
  const supabase = await createClient();

  const { data: project, error } = await supabase
    .from("projects")
    .update({ status })
    .eq("id", projectId)
    .select("client_id")
    .single();

  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "status_changed", "project", projectId, { status });

  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/clients/${project.client_id}`);
}

const assignmentSchema = z.object({
  employee_id: z.string().uuid(),
  billing_type: z.enum(["hourly", "fixed_contract"]).or(z.literal("")).optional(),
  hourly_rate: z.coerce.number().min(0).optional(),
  hours: z.coerce.number().min(0).optional(),
  fixed_contract_amount: z.coerce.number().min(0).optional(),
});

// Admin-only — billing details here are compensation data, same protection
// tier as commission_entries/payroll_runs. Non-contractual staffing (no
// billing_type) is just as admin-gated for simplicity, matching the RLS
// split on project_assignments (authenticated read, admin write).
export async function addProjectAssignment(projectId: string, formData: FormData) {
  const { user } = await requireAdmin();
  const data = assignmentSchema.parse({
    employee_id: formData.get("employee_id"),
    billing_type: formData.get("billing_type") || "",
    hourly_rate: formData.get("hourly_rate") || undefined,
    hours: formData.get("hours") || undefined,
    fixed_contract_amount: formData.get("fixed_contract_amount") || undefined,
  });
  const supabase = await createClient();

  const { data: project, error } = await supabase
    .from("projects")
    .select("client_id")
    .eq("id", projectId)
    .single();
  if (error) throw new Error(error.message);

  const billingType = data.billing_type || null;
  const { error: insertError } = await supabase.from("project_assignments").insert({
    project_id: projectId,
    employee_id: data.employee_id,
    billing_type: billingType,
    hourly_rate_cents: billingType === "hourly" && data.hourly_rate ? toMinorUnits(data.hourly_rate) : null,
    hours: billingType === "hourly" ? data.hours ?? null : null,
    fixed_contract_amount_cents:
      billingType === "fixed_contract" && data.fixed_contract_amount ? toMinorUnits(data.fixed_contract_amount) : null,
  });

  if (insertError) throw new Error(insertError.message);

  await logActivity(supabase, user.id, "assigned", "project", projectId, { employee_id: data.employee_id });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath(`/clients/${project.client_id}`);
  revalidatePath(`/employees/${data.employee_id}`);
}

export async function removeProjectAssignment(projectId: string, assignmentId: string) {
  const { user } = await requireAdmin();
  const supabase = await createClient();

  const { data: assignment, error: fetchError } = await supabase
    .from("project_assignments")
    .select("employee_id")
    .eq("id", assignmentId)
    .single();
  if (fetchError) throw new Error(fetchError.message);

  const { error } = await supabase.from("project_assignments").delete().eq("id", assignmentId);
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "unassigned", "project", projectId);

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath(`/employees/${assignment.employee_id}`);
}

const projectDetailsSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  project_type: z.enum(["monthly", "one_time"]),
});

export async function updateProjectDetails(projectId: string, clientId: string, formData: FormData) {
  const { user } = await requireUser();
  const data = projectDetailsSchema.parse({
    name: formData.get("name"),
    description: formData.get("description") || "",
    project_type: formData.get("project_type") || "one_time",
  });
  const supabase = await createClient();

  const { error } = await supabase
    .from("projects")
    .update({ name: data.name, description: data.description || null, project_type: data.project_type })
    .eq("id", projectId);

  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "updated", "project", projectId, { name: data.name });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath(`/clients/${clientId}`);
  redirect(`/projects/${projectId}`);
}
