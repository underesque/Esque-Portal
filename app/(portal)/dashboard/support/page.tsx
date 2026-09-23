import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, StatCard, EmptyState } from "@/components/ui";
import { BreakdownChart, TrendChart } from "@/components/charts";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { resolveRange, bucketsForRange, sumByBucket, isRangeKey, DEFAULT_RANGE } from "@/lib/dashboard";
import type { Ticket } from "@/lib/types";

type TicketRow = Ticket & { employees: { full_name: string } | null };

export default async function SupportDashboardPage({ searchParams }: PageProps<"/dashboard/support">) {
  await requireAdmin();
  const supabase = await createClient();
  const sp = await searchParams;
  const rangeParam = Array.isArray(sp.range) ? sp.range[0] : sp.range;
  const range = resolveRange(isRangeKey(rangeParam) ? rangeParam : DEFAULT_RANGE);
  const buckets = bucketsForRange(range);

  const { data: tickets } = await supabase
    .from("tickets")
    .select("*, employees!assignee_id(full_name)")
    .returns<TicketRow[]>();

  const rows = tickets ?? [];
  // Open/in-progress/urgent counts are current state, not time-scoped — the
  // range filter only affects things with a real "in this period" meaning
  // (resolved count, created trend), same convention as the other dashboards.
  const open = rows.filter((t) => t.status === "open").length;
  const inProgress = rows.filter((t) => t.status === "in_progress").length;
  const urgentOpen = rows.filter((t) => t.priority === "urgent" && (t.status === "open" || t.status === "in_progress")).length;
  const resolvedInRange = rows.filter(
    (t) => t.resolved_at && t.resolved_at.slice(0, 10) >= range.startISO && t.resolved_at.slice(0, 10) < range.endExclusiveISO
  ).length;

  const statusBreakdown = [
    { label: "Open", value: rows.filter((t) => t.status === "open").length },
    { label: "In progress", value: rows.filter((t) => t.status === "in_progress").length },
    { label: "Resolved", value: rows.filter((t) => t.status === "resolved").length },
    { label: "Closed", value: rows.filter((t) => t.status === "closed").length },
  ];
  const priorityBreakdown = [
    { label: "Low", value: rows.filter((t) => t.priority === "low").length },
    { label: "Medium", value: rows.filter((t) => t.priority === "medium").length },
    { label: "High", value: rows.filter((t) => t.priority === "high").length },
    { label: "Urgent", value: rows.filter((t) => t.priority === "urgent").length },
  ];

  const createdInRange = rows.filter(
    (t) => t.created_at.slice(0, 10) >= range.startISO && t.created_at.slice(0, 10) < range.endExclusiveISO
  );
  const createdByBucket = sumByBucket(
    createdInRange,
    buckets,
    (t) => t.created_at,
    () => 1
  );
  const createdTrendData = buckets.map((b) => ({ label: b.label, value: createdByBucket.get(b.key) ?? 0 }));

  const openTickets = rows.filter((t) => t.status === "open" || t.status === "in_progress");
  const workloadByAssignee = new Map<string, number>();
  openTickets.forEach((t) => {
    const name = t.employees?.full_name ?? "Unassigned";
    workloadByAssignee.set(name, (workloadByAssignee.get(name) ?? 0) + 1);
  });
  const workloadRows = Array.from(workloadByAssignee.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <div>
      <PageHeader title="Support Dashboard" description="Ticket volume, priority mix, and team workload." />

      <DateRangeFilter />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <StatCard label="Open" value={String(open)} />
        <StatCard label="In progress" value={String(inProgress)} />
        <StatCard label="Urgent open" value={String(urgentOpen)} />
        <StatCard label={`Resolved (${range.label.toLowerCase()})`} value={String(resolvedInRange)} />
      </div>

      <div className="mb-8">
        <TrendChart title={`Tickets created — ${range.label.toLowerCase()}`} data={createdTrendData} />
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 mb-8">
        <BreakdownChart title="Tickets by status" data={statusBreakdown} />
        <BreakdownChart title="Tickets by priority" data={priorityBreakdown} />
      </div>

      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">Open workload by assignee</h2>
        <Card>
          {workloadRows.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase text-muted">
                  <th className="px-5 py-3">Assignee</th>
                  <th className="px-5 py-3">Open tickets</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {workloadRows.map(([name, count]) => (
                  <tr key={name}>
                    <td className="px-5 py-3 font-medium text-foreground">{name}</td>
                    <td className="px-5 py-3 text-muted">{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState message="No open tickets right now." />
          )}
        </Card>
      </div>
    </div>
  );
}
