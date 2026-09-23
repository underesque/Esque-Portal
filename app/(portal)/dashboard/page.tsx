import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { PageHeader, StatCard } from "@/components/ui";
import { TrendChart, BreakdownChart } from "@/components/charts";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { formatUSD, formatINR } from "@/lib/format";
import { resolveRange, bucketsForRange, sumByBucket, isRangeKey, DEFAULT_RANGE } from "@/lib/dashboard";

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const { profile } = await requireAdmin();
  const supabase = await createClient();
  const sp = await searchParams;
  const rangeParam = Array.isArray(sp.range) ? sp.range[0] : sp.range;
  const range = resolveRange(isRangeKey(rangeParam) ? rangeParam : DEFAULT_RANGE);
  const buckets = bucketsForRange(range);

  const [
    { count: clientCount },
    { count: prospectCount },
    { data: clientStatuses },
    { data: rangePaidInvoices },
    { data: openInvoices },
    { count: activeEmployees },
    { count: urgentTickets },
    { count: activeProjects },
    { data: rangePayroll },
  ] = await Promise.all([
    supabase.from("clients").select("id", { count: "exact", head: true }),
    supabase.from("clients").select("id", { count: "exact", head: true }).eq("status", "prospect"),
    supabase.from("clients").select("status"),
    supabase
      .from("invoices")
      .select("amount_cents, paid_at")
      .eq("status", "paid")
      .gte("paid_at", range.startISO)
      .lt("paid_at", range.endExclusiveISO),
    supabase.from("invoices").select("amount_cents").in("status", ["sent", "overdue"]),
    supabase.from("employees").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .in("status", ["open", "in_progress"])
      .eq("priority", "urgent"),
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("status", "ongoing"),
    supabase
      .from("payroll_runs")
      .select("total_amount_cents")
      .gte("period_start", range.startISO)
      .lt("period_start", range.endExclusiveISO),
  ]);

  // Revenue is tracked off paid invoices (always USD, what was actually
  // billed), not the payments table — payments record the real INR amount
  // credited to the bank after Skydo's FX conversion/fees, a different
  // currency entirely, so they can't be summed as USD revenue.
  const totalRevenueCents = (rangePaidInvoices ?? []).reduce((sum, i) => sum + i.amount_cents, 0);
  const pendingInvoiceCents = (openInvoices ?? []).reduce((sum, i) => sum + i.amount_cents, 0);
  const payrollCents = (rangePayroll ?? []).reduce((sum, r) => sum + r.total_amount_cents, 0);

  const revenueByBucket = sumByBucket(
    rangePaidInvoices ?? [],
    buckets,
    (i) => i.paid_at ?? "",
    (i) => i.amount_cents
  );
  const revenueTrendData = buckets.map((b) => ({ label: b.label, value: revenueByBucket.get(b.key) ?? 0 }));

  const statusCounts = { active: 0, prospect: 0, inactive: 0 };
  (clientStatuses ?? []).forEach((c) => {
    if (c.status in statusCounts) statusCounts[c.status as keyof typeof statusCounts] += 1;
  });
  const clientBreakdownData = [
    { label: "Active", value: statusCounts.active },
    { label: "Prospect", value: statusCounts.prospect },
    { label: "Inactive", value: statusCounts.inactive },
  ];

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${profile.full_name.split(" ")[0]}`}
        description="Company-wide snapshot across every account."
      />

      <DateRangeFilter />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard label="Total Clients" value={String(clientCount ?? 0)} hint={`${prospectCount ?? 0} prospects`} />
        <StatCard label={`Revenue (${range.label.toLowerCase()})`} value={formatUSD(totalRevenueCents)} />
        <StatCard
          label="Pending Invoices"
          value={formatUSD(pendingInvoiceCents)}
          hint={`${(openInvoices ?? []).length} open`}
        />
        <StatCard label={`Payroll (${range.label.toLowerCase()})`} value={formatINR(payrollCents)} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-8">
        <StatCard label="Active Employees" value={String(activeEmployees ?? 0)} />
        <StatCard label="Ongoing Projects" value={String(activeProjects ?? 0)} />
        <StatCard label="Urgent Open Tickets" value={String(urgentTickets ?? 0)} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 mb-8">
        <div className="lg:col-span-2">
          <TrendChart title={`Revenue collected — ${range.label.toLowerCase()}`} data={revenueTrendData} format="usd" />
        </div>
        <BreakdownChart title="Clients by status" data={clientBreakdownData} />
      </div>

      <div className="flex gap-3">
        <Link href="/clients" className="text-sm font-medium text-foreground hover:underline">
          View all clients →
        </Link>
        <Link href="/payroll" className="text-sm font-medium text-foreground hover:underline">
          Go to payroll →
        </Link>
      </div>
    </div>
  );
}
