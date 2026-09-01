import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { calculateMonthlyScore, incrementPercentForYearlyScore, monthBounds } from "@/lib/scorecard";
import type { Employee, MonthlyScorecard } from "@/lib/types";

export default async function ScorecardsPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: employees }, { data: scorecards }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name, employment_type")
      .eq("status", "active")
      .order("full_name")
      .returns<Pick<Employee, "id" | "full_name" | "employment_type">[]>(),
    supabase.from("monthly_scorecards").select("*").returns<MonthlyScorecard[]>(),
  ]);

  const { start: currentMonthStart } = monthBounds(new Date());
  const currentYear = new Date().getFullYear();

  const rows = (employees ?? []).map((employee) => {
    const employeeScores = (scorecards ?? []).filter((s) => s.employee_id === employee.id);
    const thisMonth = employeeScores.find((s) => s.period_start === currentMonthStart);
    const thisYearScores = employeeScores.filter((s) => Number(s.period_start.slice(0, 4)) === currentYear);
    const yearlyScore =
      thisYearScores.length > 0
        ? thisYearScores.reduce((sum, s) => sum + calculateMonthlyScore(s), 0) / thisYearScores.length
        : null;
    return {
      employee,
      thisMonthScore: thisMonth ? calculateMonthlyScore(thisMonth) : null,
      yearlyScore,
      monthsEntered: employeeScores.length,
    };
  });

  return (
    <div>
      <PageHeader title="Scorecard" description="Monthly performance scores across the team." />

      <Card>
        {rows.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase text-muted">
                <th className="px-5 py-3">Employee</th>
                <th className="px-5 py-3">This month</th>
                <th className="px-5 py-3">{currentYear} average</th>
                <th className="px-5 py-3">Increment tier</th>
                <th className="px-5 py-3">Months entered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(({ employee, thisMonthScore, yearlyScore, monthsEntered }) => (
                <tr key={employee.id} className="hover:bg-black/[0.02]">
                  <td className="px-5 py-3">
                    <Link href={`/employees/${employee.id}`} className="font-medium text-foreground hover:underline">
                      {employee.full_name}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-muted">
                    {thisMonthScore !== null ? `${thisMonthScore.toFixed(1)}%` : "Not entered"}
                  </td>
                  <td className="px-5 py-3 text-muted">{yearlyScore !== null ? `${yearlyScore.toFixed(1)}%` : "—"}</td>
                  <td className="px-5 py-3 text-muted">
                    {yearlyScore !== null ? `${incrementPercentForYearlyScore(yearlyScore)}%` : "—"}
                  </td>
                  <td className="px-5 py-3 text-muted">{monthsEntered}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState message="No active employees yet." />
        )}
      </Card>
    </div>
  );
}
