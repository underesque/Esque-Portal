"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function signupEmployee(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();

  const { data: isEmployee, error: checkError } = await supabase.rpc("is_employee_email", {
    check_email: email,
  });

  if (checkError) {
    redirect(`/signup?error=${encodeURIComponent("Something went wrong checking that email. Try again.")}`);
  }

  if (!isEmployee) {
    redirect(
      `/signup?error=${encodeURIComponent("No employee record found for this email — ask an admin to add you as an employee first.")}`
    );
  }

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });

  if (signUpError) {
    redirect(`/signup?error=${encodeURIComponent(signUpError.message)}`);
  }

  // If the Supabase project requires email confirmation, signUp doesn't
  // establish a session yet — send them to sign in normally once confirmed.
  if (!signUpData.session) {
    redirect(`/login?error=${encodeURIComponent("Account created — check your email to confirm it, then sign in.")}`);
  }

  redirect("/dashboard");
}
