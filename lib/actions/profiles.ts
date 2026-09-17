"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { logActivity } from "@/lib/actions/activityLog";

export async function linkEmployeeAccount(employeeId: string, formData: FormData) {
  const { user } = await requireAdmin();
  const profileId = String(formData.get("profile_id") ?? "");
  if (!profileId) return;

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ employee_id: employeeId }).eq("id", profileId);
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "linked_account", "employee", employeeId, { profile_id: profileId });

  revalidatePath(`/employees/${employeeId}`);
}

export async function unlinkEmployeeAccount(employeeId: string, profileId: string) {
  const { user } = await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase.from("profiles").update({ employee_id: null }).eq("id", profileId);
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "unlinked_account", "employee", employeeId, { profile_id: profileId });

  revalidatePath(`/employees/${employeeId}`);
}
