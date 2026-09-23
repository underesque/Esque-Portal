import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { PageHeader, StatCard } from "@/components/ui";
import { TrendChart, BreakdownChart } from "@/components/charts";
import { formatUSD, formatINR } from "@/lib/format";
import { lastNMonths, sumByMonth } from "@/lib/dashboard";

export default async function DashboardPage() {
  const { profile } = await requireAdmin();
  const supabase = await createClient();
  const months = lastNMonths(6);
  const rangeStart = months[0].key + "-01";
  const monthStart = new Date().toISOString().slice(0, 7) + "-01";

  const [
    { count: clientCount },
    { count: prospectCount },
    { data: clientStatuses },
    { data: paidInvoices },
    { data: recentPaidInvoices },
    { data: openInvoices },
    { count: activeEmployees },
    { count: urgentTickets },
    { count: activeProjects },
    { data: payrollThisMonth },
  ] = await Promise.all([
    supabase.from("clients").select("id", { count: "exact", head: true }),
    supabase.from("clients").select("id", { count: "exact", head: true }).eq("status", "prospect"),
    supabase.from("clients").select("status"),
    supabase.from("invoices").select("amount_cents").eq("status", "paid"),
    supabase.from("invoices").select("amount_cents, paid_at").eq("status", "paid").gte("paid_at", rangeStart),
    supabase.from("invoices").select("amount_cents").in("status", ["sent", "overdue"]),
    supabase.from("employees").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .in("status", ["open", "in_progress"])
      .eq("priority", "urgent"),
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("status", "ongoing"),
    supabase.from("payroll_runs").select("total_amount_cents").gte("period_start", monthStart),
  ]);

  // Revenue is tracked off paid invoices (always USD, what was actually
  // billed), not the payments table — payments record the real INR amount
  // credited to the bank after Skydo's FX conversion/fees, a different
  // currency entirely, so they can't be summed as USD revenue.
  const totalRevenueCents = (paidInvoices ?? []).reduce((sum, i) => sum + i.amount_cents, 0);
  const pendingInvoiceCents = (openInvoices ?? []).reduce((sum, i) => sum + i.amount_cents, 0);
  const payrollCents = (payrollThisMonth ?? []).reduce((sum, r) => sum + r.total_amount_cents, 0);

  const revenueByMonth = sumByMonth(
    recentPaidInvoices ?? [],
    months,
    (i) => i.paid_at ?? "",
    (i) => i.amount_cents
  );
  const revenueTrendData = months.map((m) => ({ label: m.label, value: revenueByMonth.get(m.key) ?? 0 }));

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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard label="Total Clients" value={String(clientCount ?? 0)} hint={`${prospectCount ?? 0} prospects`} />
        <StatCard label="Revenue Collected" value={formatUSD(totalRevenueCents)} />
        <StatCard
          label="Pending Invoices"
          value={formatUSD(pendingInvoiceCents)}
          hint={`${(openInvoices ?? []).length} open`}
        />
        <StatCard label="Payroll (this month)" value={formatINR(payrollCents)} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-8">
        <StatCard label="Active Employees" value={String(activeEmployees ?? 0)} />
        <StatCard label="Ongoing Projects" value={String(activeProjects ?? 0)} />
        <StatCard label="Urgent Open Tickets" value={String(urgentTickets ?? 0)} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 mb-8">
        <div className="lg:col-span-2">
          <TrendChart title="Revenue collected — last 6 months" data={revenueTrendData} format="usd" />
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
