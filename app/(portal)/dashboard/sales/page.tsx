import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, StatCard, EmptyState } from "@/components/ui";
import { TrendChart, BreakdownChart } from "@/components/charts";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { resolveRange, bucketsForRange, sumByBucket, isRangeKey, DEFAULT_RANGE } from "@/lib/dashboard";

export default async function SalesDashboardPage({ searchParams }: PageProps<"/dashboard/sales">) {
  await requireAdmin();
  const supabase = await createClient();
  const sp = await searchParams;
  const rangeParam = Array.isArray(sp.range) ? sp.range[0] : sp.range;
  const range = resolveRange(isRangeKey(rangeParam) ? rangeParam : DEFAULT_RANGE);
  const buckets = bucketsForRange(range);

  const [{ data: rangeClients }, { data: clientStatuses }, { count: totalClients }] = await Promise.all([
    supabase.from("clients").select("created_at").gte("created_at", range.startISO).lt("created_at", range.endExclusiveISO),
    supabase.from("clients").select("status"),
    supabase.from("clients").select("id", { count: "exact", head: true }),
  ]);

  const clientsByBucket = sumByBucket(
    rangeClients ?? [],
    buckets,
    (c) => c.created_at,
    () => 1
  );
  const newClientsTrendData = buckets.map((b) => ({ label: b.label, value: clientsByBucket.get(b.key) ?? 0 }));

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

      <DateRangeFilter />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-8">
        <StatCard label={`New clients (${range.label.toLowerCase()})`} value={String((rangeClients ?? []).length)} />
        <StatCard label="Total clients" value={String(totalClients ?? 0)} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 mb-10">
        <div className="lg:col-span-2">
          <TrendChart title={`New clients acquired — ${range.label.toLowerCase()}`} data={newClientsTrendData} />
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
