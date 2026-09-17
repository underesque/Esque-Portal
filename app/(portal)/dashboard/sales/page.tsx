import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, StatCard, EmptyState } from "@/components/ui";
import { TrendChart, BreakdownChart } from "@/components/charts";
import { lastNMonths, sumByMonth } from "@/lib/dashboard";

export default async function SalesDashboardPage() {
  await requireAdmin();
  const supabase = await createClient();
  const months = lastNMonths(6);
  const rangeStart = months[0].key + "-01";
  const monthStart = new Date().toISOString().slice(0, 7) + "-01";

  const [{ data: recentClients }, { count: newClientsThisMonth }, { data: clientStatuses }, { count: totalClients }] =
    await Promise.all([
      supabase.from("clients").select("created_at").gte("created_at", rangeStart),
      supabase.from("clients").select("id", { count: "exact", head: true }).gte("created_at", monthStart),
      supabase.from("clients").select("status"),
      supabase.from("clients").select("id", { count: "exact", head: true }),
    ]);

  const clientsByMonth = sumByMonth(
    recentClients ?? [],
    months,
    (c) => c.created_at,
    () => 1
  );
  const newClientsTrendData = months.map((m) => ({ label: m.label, value: clientsByMonth.get(m.key) ?? 0 }));

  const statusCounts = { active: 0, prospect: 0, inactive: 0 };
  (clientStatuses ?? []).forEach((c) => {
    if (c.status in statusCounts) statusCounts[c.status as keyof typeof statusCounts] += 1;
  });
  const funnelBreakdown = [
    { label: "Prospect", value: statusCounts.prospect },
    { label: "Active", value: statusCounts.active },
    { label: "Inactive", value: statusCounts.inactive },
  ];

  return (
    <div>
      <PageHeader title="Sales & Marketing Dashboard" description="The client acquisition funnel — outreach through conversion." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-8">
        <StatCard label="New clients (this month)" value={String(newClientsThisMonth ?? 0)} />
        <StatCard label="Total clients" value={String(totalClients ?? 0)} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 mb-10">
        <div className="lg:col-span-2">
          <TrendChart title="New clients acquired — last 6 months" data={newClientsTrendData} />
        </div>
        <BreakdownChart title="Clients by funnel stage" data={funnelBreakdown} />
      </div>

      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">Funnel activity</h2>
        <Card className="p-5">
          <EmptyState message="Coming soon — daily/weekly email touch points, text (SMS) marketing, and partnership outreach all need a data source this portal doesn't have yet. Once that's tracked, this section will show outreach volume and cadence feeding the funnel above." />
        </Card>
      </div>
    </div>
  );
}
