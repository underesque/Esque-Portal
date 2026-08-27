"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { logActivity } from "@/lib/actions/activityLog";
import { toMinorUnits } from "@/lib/format";

const employeeSchema = z.object({
  employee_code: z.string().optional(),
  full_name: z.string().min(1, "Name is required"),
  email: z.string().email().or(z.literal("")).optional(),
  phone: z.string().optional(),
  start_date: z.string().min(1),
  employment_type: z.enum(["full_time", "part_time", "contractual"]),
  status: z.enum(["active", "inactive"]),
  pay_type: z.enum(["fixed", "commission", "hybrid"]),
  base_salary: z.coerce.number().min(0),
  commission_rate_percent: z.coerce.number().min(0),
  is_founder: z.coerce.boolean(),
  salary_basis: z.enum(["full_time", "half_time", "hourly_director", "custom"]),
  salary_basis_hours: z.coerce.number().min(0),
  salary_basis_custom: z.coerce.number().min(0),
  bank_account_holder: z.string().optional(),
  bank_account_number: z.string().optional(),
  bank_ifsc: z.string().optional(),
  bank_name: z.string().optional(),
  t_shirt_size: z.enum(["XS", "S", "M", "L", "XL", "XXL"]).or(z.literal("")).optional(),
  notes: z.string().optional(),
});

function readEmployeeForm(formData: FormData) {
  return employeeSchema.parse({
    employee_code: formData.get("employee_code") || "",
    full_name: formData.get("full_name"),
    email: formData.get("email") || "",
    phone: formData.get("phone") || "",
    start_date: formData.get("start_date"),
    employment_type: formData.get("employment_type") || "full_time",
    status: formData.get("status") || "active",
    pay_type: formData.get("pay_type") || "fixed",
    base_salary: formData.get("base_salary") || 0,
    commission_rate_percent: formData.get("commission_rate_percent") || 0,
    is_founder: formData.get("is_founder") === "on",
    salary_basis: formData.get("salary_basis") || "full_time",
    salary_basis_hours: formData.get("salary_basis_hours") || 0,
    salary_basis_custom: formData.get("salary_basis_custom") || 0,
    bank_account_holder: formData.get("bank_account_holder") || "",
    bank_account_number: formData.get("bank_account_number") || "",
    bank_ifsc: formData.get("bank_ifsc") || "",
    bank_name: formData.get("bank_name") || "",
    t_shirt_size: formData.get("t_shirt_size") || "",
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
      employee_code: data.employee_code || null,
      full_name: data.full_name,
      email: data.email || null,
      phone: data.phone || null,
      start_date: data.start_date,
      employment_type: data.employment_type,
      status: data.status,
      pay_type: data.pay_type,
      base_salary_cents: toMinorUnits(data.base_salary),
      commission_rate_percent: data.commission_rate_percent,
      is_founder: data.is_founder,
      salary_basis: data.salary_basis,
      salary_basis_hours: data.salary_basis_hours,
      salary_basis_custom_cents: toMinorUnits(data.salary_basis_custom),
      bank_account_holder: data.bank_account_holder || null,
      bank_account_number: data.bank_account_number || null,
      bank_ifsc: data.bank_ifsc || null,
      bank_name: data.bank_name || null,
      t_shirt_size: data.t_shirt_size || null,
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
      employee_code: data.employee_code || null,
      full_name: data.full_name,
      email: data.email || null,
      phone: data.phone || null,
      start_date: data.start_date,
      employment_type: data.employment_type,
      status: data.status,
      pay_type: data.pay_type,
      base_salary_cents: toMinorUnits(data.base_salary),
      commission_rate_percent: data.commission_rate_percent,
      is_founder: data.is_founder,
      salary_basis: data.salary_basis,
      salary_basis_hours: data.salary_basis_hours,
      salary_basis_custom_cents: toMinorUnits(data.salary_basis_custom),
      bank_account_holder: data.bank_account_holder || null,
      bank_account_number: data.bank_account_number || null,
      bank_ifsc: data.bank_ifsc || null,
      bank_name: data.bank_name || null,
      t_shirt_size: data.t_shirt_size || null,
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
