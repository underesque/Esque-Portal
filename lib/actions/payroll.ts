"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { logActivity } from "@/lib/actions/activityLog";
import { toMinorUnits } from "@/lib/format";
import type { Employee } from "@/lib/types";

const commissionSchema = z.object({
  employee_id: z.string().uuid(),
  description: z.string().min(1),
  base_amount: z.coerce.number().positive(),
  rate_percent: z.coerce.number().min(0).max(100),
  period_start: z.string().min(1),
  period_end: z.string().min(1),
  client_id: z.string().uuid().optional(),
});

export async function addCommissionEntry(formData: FormData) {
  const { user } = await requireAdmin();
  const data = commissionSchema.parse({
    employee_id: formData.get("employee_id"),
    description: formData.get("description"),
    base_amount: formData.get("base_amount"),
    rate_percent: formData.get("rate_percent"),
    period_start: formData.get("period_start"),
    period_end: formData.get("period_end"),
    client_id: formData.get("client_id") || undefined,
  });

  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("commission_entries")
    .insert({
      employee_id: data.employee_id,
      client_id: data.client_id || null,
      description: data.description,
      base_amount_cents: toMinorUnits(data.base_amount),
      rate_percent: data.rate_percent,
      period_start: data.period_start,
      period_end: data.period_end,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "created", "commission_entry", created.id, {
    employee_id: data.employee_id,
  });

  revalidatePath("/payroll");
  revalidatePath(`/employees/${data.employee_id}`);
}

export async function updateCommissionStatus(
  employeeId: string,
  entryId: string,
  status: "pending" | "approved" | "paid"
) {
  const { user } = await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("commission_entries")
    .update({ status })
    .eq("id", entryId);

  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "status_changed", "commission_entry", entryId, {
    status,
  });

  revalidatePath("/payroll");
  revalidatePath(`/employees/${employeeId}`);
}

const payrollRunSchema = z.object({
  employee_id: z.string().uuid(),
  period_start: z.string().min(1),
  period_end: z.string().min(1),
});

export async function runPayroll(formData: FormData) {
  const { user } = await requireAdmin();
  const data = payrollRunSchema.parse({
    employee_id: formData.get("employee_id"),
    period_start: formData.get("period_start"),
    period_end: formData.get("period_end"),
  });

  const supabase = await createClient();

  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select("*")
    .eq("id", data.employee_id)
    .single<Employee>();

  if (employeeError || !employee) throw new Error("Employee not found");

  const { data: approvedCommissions, error: commissionError } = await supabase
    .from("commission_entries")
    .select("commission_amount_cents")
    .eq("employee_id", data.employee_id)
    .eq("status", "approved")
    .gte("period_start", data.period_start)
    .lte("period_end", data.period_end);

  if (commissionError) throw new Error(commissionError.message);

  const commissionTotal = (approvedCommissions ?? []).reduce(
    (sum, entry) => sum + entry.commission_amount_cents,
    0
  );

  const baseAmount =
    employee.pay_type === "commission" ? 0 : employee.base_salary_cents;

  const { data: created, error } = await supabase
    .from("payroll_runs")
    .insert({
      employee_id: data.employee_id,
      period_start: data.period_start,
      period_end: data.period_end,
      base_amount_cents: baseAmount,
      commission_amount_cents: commissionTotal,
      status: "processed",
      processed_at: new Date().toISOString(),
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  if ((approvedCommissions ?? []).length > 0) {
    await supabase
      .from("commission_entries")
      .update({ status: "paid" })
      .eq("employee_id", data.employee_id)
      .eq("status", "approved")
      .gte("period_start", data.period_start)
      .lte("period_end", data.period_end);
  }

  await logActivity(supabase, user.id, "processed", "payroll_run", created.id, {
    employee_id: data.employee_id,
    total_amount_cents: baseAmount + commissionTotal,
  });

  revalidatePath("/payroll");
  revalidatePath(`/employees/${data.employee_id}`);
}
