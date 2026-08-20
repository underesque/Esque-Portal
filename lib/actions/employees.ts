"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { logActivity } from "@/lib/actions/activityLog";
import { toMinorUnits } from "@/lib/format";

const employeeSchema = z.object({
  full_name: z.string().min(1, "Name is required"),
  email: z.string().email().or(z.literal("")).optional(),
  phone: z.string().optional(),
  start_date: z.string().min(1),
  employment_type: z.enum(["full_time", "part_time", "contractor"]),
  status: z.enum(["active", "inactive"]),
  pay_type: z.enum(["fixed", "commission", "hybrid"]),
  base_salary: z.coerce.number().min(0),
  commission_rate_percent: z.coerce.number().min(0),
  notes: z.string().optional(),
});

function readEmployeeForm(formData: FormData) {
  return employeeSchema.parse({
    full_name: formData.get("full_name"),
    email: formData.get("email") || "",
    phone: formData.get("phone") || "",
    start_date: formData.get("start_date"),
    employment_type: formData.get("employment_type") || "full_time",
    status: formData.get("status") || "active",
    pay_type: formData.get("pay_type") || "fixed",
    base_salary: formData.get("base_salary") || 0,
    commission_rate_percent: formData.get("commission_rate_percent") || 0,
    notes: formData.get("notes") || "",
  });
}

export async function createEmployee(formData: FormData) {
  const { user } = await requireAdmin();
  const data = readEmployeeForm(formData);
  const supabase = await createClient();

  const { data: created, error } = await supabase
    .from("employees")
    .insert({
      full_name: data.full_name,
      email: data.email || null,
      phone: data.phone || null,
      start_date: data.start_date,
      employment_type: data.employment_type,
      status: data.status,
      pay_type: data.pay_type,
      base_salary_cents: toMinorUnits(data.base_salary),
      commission_rate_percent: data.commission_rate_percent,
      notes: data.notes || null,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "created", "employee", created.id, {
    full_name: data.full_name,
  });

  revalidatePath("/employees");
  redirect(`/employees/${created.id}`);
}

export async function updateEmployee(employeeId: string, formData: FormData) {
  const { user } = await requireAdmin();
  const data = readEmployeeForm(formData);
  const supabase = await createClient();

  const { error } = await supabase
    .from("employees")
    .update({
      full_name: data.full_name,
      email: data.email || null,
      phone: data.phone || null,
      start_date: data.start_date,
      employment_type: data.employment_type,
      status: data.status,
      pay_type: data.pay_type,
      base_salary_cents: toMinorUnits(data.base_salary),
      commission_rate_percent: data.commission_rate_percent,
      notes: data.notes || null,
    })
    .eq("id", employeeId);

  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "updated", "employee", employeeId, {
    full_name: data.full_name,
  });

  revalidatePath("/employees");
  revalidatePath(`/employees/${employeeId}`);
  redirect(`/employees/${employeeId}`);
}
