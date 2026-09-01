"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { logActivity } from "@/lib/actions/activityLog";
import { SCORECARD_CATEGORIES, isWeekday, monthBoundsForDateString, type ScorecardCategoryKey } from "@/lib/scorecard";

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
  revalidatePath("/scorecards");
}

async function recomputeMonthlyScorecardFromDaily(
  supabase: SupabaseClient,
  employeeId: string,
  entryDate: string,
  actorId: string
) {
  const { start, end } = monthBoundsForDateString(entryDate);
  const { data: dailyRows } = await supabase
    .from("daily_scorecards")
    .select("*")
    .eq("employee_id", employeeId)
    .gte("entry_date", start)
    .lte("entry_date", end);

  if (!dailyRows || dailyRows.length === 0) {
    // No daily entries left for this month (e.g. the last one was just
    // deleted) — leave any existing monthly_scorecards row as-is rather than
    // guessing at a value with no data behind it.
    return;
  }

  const avg = (key: ScorecardCategoryKey) =>
    dailyRows.reduce((sum, row) => sum + Number(row[key]), 0) / dailyRows.length;

  const values = Object.fromEntries(SCORECARD_CATEGORIES.map((c) => [c.key, avg(c.key)]));

  const { error } = await supabase.from("monthly_scorecards").upsert(
    {
      employee_id: employeeId,
      period_start: start,
      period_end: end,
      ...values,
      notes: `Auto-computed from ${dailyRows.length} daily ${dailyRows.length === 1 ? "entry" : "entries"}.`,
      created_by: actorId,
    },
    { onConflict: "employee_id,period_start" }
  );

  if (error) throw new Error(error.message);
}

const dailyScorecardSchema = z.object({
  entry_date: z.string().min(1).refine(isWeekday, "Entry date must be a weekday (Mon–Fri)"),
  attendance_score: z.coerce.number().min(0).max(100),
  punctuality_score: z.coerce.number().min(0).max(100),
  work_performance_score: z.coerce.number().min(0).max(100),
  manager_feedback_score: z.coerce.number().min(0).max(100),
  responsiveness_score: z.coerce.number().min(0).max(100),
  notes: z.string().optional(),
});

export async function saveDailyScorecard(employeeId: string, formData: FormData) {
  const { user } = await requireAdmin();
  const data = dailyScorecardSchema.parse({
    entry_date: formData.get("entry_date"),
    attendance_score: formData.get("attendance_score"),
    punctuality_score: formData.get("punctuality_score"),
    work_performance_score: formData.get("work_performance_score"),
    manager_feedback_score: formData.get("manager_feedback_score"),
    responsiveness_score: formData.get("responsiveness_score"),
    notes: formData.get("notes") || "",
  });

  const supabase = await createClient();
  const { error } = await supabase.from("daily_scorecards").upsert(
    {
      employee_id: employeeId,
      entry_date: data.entry_date,
      attendance_score: data.attendance_score,
      punctuality_score: data.punctuality_score,
      work_performance_score: data.work_performance_score,
      manager_feedback_score: data.manager_feedback_score,
      responsiveness_score: data.responsiveness_score,
      notes: data.notes || null,
      created_by: user.id,
    },
    { onConflict: "employee_id,entry_date" }
  );

  if (error) throw new Error(error.message);

  await recomputeMonthlyScorecardFromDaily(supabase, employeeId, data.entry_date, user.id);

  await logActivity(supabase, user.id, "scored_day", "daily_scorecard", employeeId, {
    entry_date: data.entry_date,
  });

  revalidatePath(`/employees/${employeeId}`);
  revalidatePath("/my-scorecard");
  revalidatePath("/scorecards");
}

export async function deleteDailyScorecard(employeeId: string, dailyScorecardId: string) {
  const { user } = await requireAdmin();
  const supabase = await createClient();

  const { data: row, error: fetchError } = await supabase
    .from("daily_scorecards")
    .select("entry_date")
    .eq("id", dailyScorecardId)
    .single();
  if (fetchError) throw new Error(fetchError.message);

  const { error } = await supabase.from("daily_scorecards").delete().eq("id", dailyScorecardId);
  if (error) throw new Error(error.message);

  await recomputeMonthlyScorecardFromDaily(supabase, employeeId, row.entry_date, user.id);

  await logActivity(supabase, user.id, "deleted", "daily_scorecard", employeeId, {
    entry_date: row.entry_date,
  });

  revalidatePath(`/employees/${employeeId}`);
  revalidatePath("/my-scorecard");
  revalidatePath("/scorecards");
}
