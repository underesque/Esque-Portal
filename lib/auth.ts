import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  if (!profile) redirect("/login");

  return { user, profile };
}

export async function requireAdmin() {
  const { user, profile } = await requireUser();
  // /dashboard is admin-only now, so bounce through /login and let the proxy's
  // own role-based redirect send a non-admin to their actual home instead.
  if (profile.role !== "admin") redirect("/login");
  return { user, profile };
}

export async function requireStaff() {
  const { user, profile } = await requireUser();
  if (profile.role !== "staff") redirect("/login");
  return { user, profile };
}

export async function requireEmployee() {
  const { user, profile } = await requireUser();
  if (profile.role !== "employee" || !profile.employee_id) redirect("/login");
  return { user, profile, employeeId: profile.employee_id };
}
