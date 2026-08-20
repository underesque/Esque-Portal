"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { logActivity } from "@/lib/actions/activityLog";

const holidaySchema = z.object({
  name: z.string().min(1, "Name is required"),
  date: z.string().min(1),
  recurring_annually: z.boolean(),
  notes: z.string().optional(),
});

export async function addHoliday(formData: FormData) {
  const { user } = await requireAdmin();
  const data = holidaySchema.parse({
    name: formData.get("name"),
    date: formData.get("date"),
    recurring_annually: formData.get("recurring_annually") === "on",
    notes: formData.get("notes") || "",
  });

  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("holidays")
    .insert({
      name: data.name,
      date: data.date,
      recurring_annually: data.recurring_annually,
      notes: data.notes || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "created", "holiday", created.id, { name: data.name });

  revalidatePath("/holidays");
}

export async function deleteHoliday(holidayId: string) {
  const { user } = await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase.from("holidays").delete().eq("id", holidayId);
  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "deleted", "holiday", holidayId);

  revalidatePath("/holidays");
}
