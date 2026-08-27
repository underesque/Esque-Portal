import { requireEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { SCORECARD_CATEGORIES, calculateMonthlyScore, incrementPercentForYearlyScore } from "@/lib/scorecard";
import type { MonthlyScorecard } from "@/lib/types";

export default async function MyScorecardPage() {
  const { profile, employeeId } = await requireEmployee();
  const supabase = await createClient();

  const { data: employee } = await supabase.from("employees").select("full_name, start_date").eq("id", employeeId).single();
  const { data: scorecards } = await supabase
    .from("monthly_scorecards")
    .select("*")
    .eq("employee_id", employeeId)
    .order("period_start", { ascending: false })
    .returns<MonthlyScorecard[]>();

  const rows = scorecards ?? [];
  const currentYear = new Date().getFullYear();
  const thisYearRows = rows.filter((r) => Number(r.period_start.slice(0, 4)) === currentYear);
  const yearlyScore = thisYearRows.length > 0 ? thisYearRows.reduce((s, r) => s + calculateMonthlyScore(r), 0) / thisYearRows.length : null;
  const incrementPercent = yearlyScore !== null ? incrementPercentForYearlyScore(yearlyScore) : null;

  const latest = rows[0];

  return (
    <div>
      <PageHeader
        title={`Welcome, ${(employee?.full_name ?? profile.full_name).split(" ")[0]}`}
        description="Your monthly performance scorecard and yearly growth standing."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-8">
        <Card className="p-5">
          <div className="text-sm text-muted">Latest month{latest ? ` — ${formatDate(latest.period_start)}` : ""}</div>
          <div className="mt-2 text-3xl font-semibold text-foreground font-display">
            {latest ? `${calculateMonthlyScore(latest).toFixed(1)}%` : "—"}
          </div>
          {!latest && <div className="mt-1 text-xs text-muted">No scorecard entered yet.</div>}
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted">{currentYear} average</div>
          <div className="mt-2 text-3xl font-semibold text-foreground font-display">
            {yearlyScore !== null ? `${yearlyScore.toFixed(1)}%` : "—"}
          </div>
          <div className="mt-1 text-xs text-muted">
            {incrementPercent !== null
              ? incrementPercent > 0
                ? `${incrementPercent}% increment tier`
                : "Below the 70% increment threshold"
              : "Not enough months scored yet"}
          </div>
        </Card>
      </div>

      {latest && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-foreground mb-3">This month&apos;s breakdown</h2>
          <Card className="p-5">
            <dl className="space-y-2 text-sm">
              {SCORECARD_CATEGORIES.map((c) => (
                <div key={c.key} className="flex items-center justify-between">
                  <dt className="text-muted">
                    {c.label} <span className="text-xs">({Math.round(c.weight * 100)}% of total)</span>
                  </dt>
                  <dd className="tabular-nums font-medium text-foreground">{Number(latest[c.key]).toFixed(1)}%</dd>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-border pt-2 font-semibold">
                <dt className="text-foreground">Overall score</dt>
                <dd className="tabular-nums text-foreground">{calculateMonthlyScore(latest).toFixed(1)}%</dd>
              </div>
            </dl>
            {latest.notes && <p className="mt-3 border-t border-border pt-3 text-sm text-muted whitespace-pre-wrap">{latest.notes}</p>}
          </Card>
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">History</h2>
        <Card>
          {rows.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase text-muted">
                  <th className="px-5 py-3">Month</th>
                  <th className="px-5 py-3">Overall score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-3 font-medium text-foreground">{formatDate(r.period_start)}</td>
                    <td className="px-5 py-3 tabular-nums">{calculateMonthlyScore(r).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState message="No scorecards recorded yet. Check back after your first monthly review." />
          )}
        </Card>
      </div>
    </div>
  );
}
