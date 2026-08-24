"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { logActivity } from "@/lib/actions/activityLog";

const scorecardSchema = z.object({
  period_start: z.string().min(1),
  period_end: z.string().min(1),
  attendance_score: z.coerce.number().min(0).max(100),
  punctuality_score: z.coerce.number().min(0).max(100),
  work_performance_score: z.coerce.number().min(0).max(100),
  manager_feedback_score: z.coerce.number().min(0).max(100),
  responsiveness_score: z.coerce.number().min(0).max(100),
  notes: z.string().optional(),
});

export async function saveMonthlyScorecard(employeeId: string, formData: FormData) {
  const { user } = await requireAdmin();
  const data = scorecardSchema.parse({
    period_start: formData.get("period_start"),
    period_end: formData.get("period_end"),
    attendance_score: formData.get("attendance_score"),
    punctuality_score: formData.get("punctuality_score"),
    work_performance_score: formData.get("work_performance_score"),
    manager_feedback_score: formData.get("manager_feedback_score"),
    responsiveness_score: formData.get("responsiveness_score"),
    notes: formData.get("notes") || "",
  });

  const supabase = await createClient();
  const { error } = await supabase.from("monthly_scorecards").upsert(
    {
      employee_id: employeeId,
      period_start: data.period_start,
      period_end: data.period_end,
      attendance_score: data.attendance_score,
      punctuality_score: data.punctuality_score,
      work_performance_score: data.work_performance_score,
      manager_feedback_score: data.manager_feedback_score,
      responsiveness_score: data.responsiveness_score,
      notes: data.notes || null,
      created_by: user.id,
    },
    { onConflict: "employee_id,period_start" }
  );

  if (error) throw new Error(error.message);

  await logActivity(supabase, user.id, "scored", "monthly_scorecard", employeeId, {
    period_start: data.period_start,
  });

  revalidatePath(`/employees/${employeeId}`);
  revalidatePath("/my-scorecard");
}
