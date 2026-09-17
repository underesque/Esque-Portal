import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, StatCard, EmptyState } from "@/components/ui";
import { TrendChart, BreakdownChart } from "@/components/charts";
import { formatUSD, formatINR, formatDate } from "@/lib/format";
import { lastNMonths, sumByMonth } from "@/lib/dashboard";
import type { PayoutShareCategory, Vendor } from "@/lib/types";

const CATEGORY_LABELS: Record<PayoutShareCategory, string> = {
  sales: "Sales",
  ops: "Operations",
  partner: "Partners",
  salary: "Salary",
  bonus: "Bonus",
  foundation_excess: "Foundation excess",
  client_excess: "Client excess",
};

export default async function FinancialDashboardPage() {
  await requireAdmin();
  const supabase = await createClient();
  const months = lastNMonths(6);
  const rangeStart = months[0].key + "-01";
  const today = new Date();
  const monthStart = today.toISOString().slice(0, 7) + "-01";
  const soonStr = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);

  const [
    { data: recentPayments },
    { data: monthPayments },
    { data: openInvoices },
    { data: clientPayments },
    { data: clients },
    { data: payrollRuns },
    { data: payoutRuns },
    { data: currentMonthRun },
    { data: vendors },
  ] = await Promise.all([
    supabase.from("payments").select("amount_cents, payment_date").gte("payment_date", rangeStart),
    supabase.from("payments").select("amount_cents").gte("payment_date", monthStart),
    supabase.from("invoices").select("amount_cents").in("status", ["sent", "overdue"]),
    supabase.from("payments").select("amount_cents, client_id"),
    supabase.from("clients").select("id, name, sales_owner_id, employees!sales_owner_id(full_name)"),
    supabase.from("payroll_runs").select("period_start, total_amount_cents").gte("period_start", rangeStart),
    supabase.from("payout_runs").select("id, period_start").gte("period_start", rangeStart),
    supabase.from("payout_runs").select("id").eq("period_start", monthStart).maybeSingle(),
    supabase
      .from("vendors")
      .select("*")
      .eq("status", "active")
      .not("next_due_date", "is", null)
      .lte("next_due_date", soonStr)
      .order("next_due_date", { ascending: true })
      .returns<Vendor[]>(),
  ]);

  // --- Revenue ---------------------------------------------------------
  const revenueThisMonthCents = (monthPayments ?? []).reduce((sum, p) => sum + p.amount_cents, 0);
  const outstandingCents = (openInvoices ?? []).reduce((sum, i) => sum + i.amount_cents, 0);

  const revenueByMonth = sumByMonth(
    recentPayments ?? [],
    months,
    (p) => p.payment_date,
    (p) => p.amount_cents
  );
  const revenueTrendData = months.map((m) => ({ label: m.label, value: revenueByMonth.get(m.key) ?? 0 }));

  const clientById = new Map((clients ?? []).map((c) => [c.id, c]));
  const revenueByClient = new Map<string, number>();
  (clientPayments ?? []).forEach((p) => {
    revenueByClient.set(p.client_id, (revenueByClient.get(p.client_id) ?? 0) + p.amount_cents);
  });
  const topClients = Array.from(revenueByClient.entries())
    .map(([clientId, cents]) => ({ client: clientById.get(clientId), cents }))
    .filter((row) => row.client)
    .sort((a, b) => b.cents - a.cents)
    .slice(0, 8);

  const revenueBySalesOwner = new Map<string, number>();
  (clientPayments ?? []).forEach((p) => {
    const client = clientById.get(p.client_id);
    const ownerName = (client?.employees as unknown as { full_name: string } | null)?.full_name ?? "Unattributed";
    revenueBySalesOwner.set(ownerName, (revenueBySalesOwner.get(ownerName) ?? 0) + p.amount_cents);
  });
  const salesOwnerBreakdown = Array.from(revenueBySalesOwner.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, cents]) => ({ label, value: Math.round(cents / 100) }));

  // --- Payroll & founder payouts ----------------------------------------
  const payoutRunIds = (payoutRuns ?? []).map((r) => r.id);
  const { data: allShares } =
    payoutRunIds.length > 0
      ? await supabase.from("payout_shares").select("run_id, category, amount_inr_cents").in("run_id", payoutRunIds)
      : { data: [] as { run_id: string; category: PayoutShareCategory; amount_inr_cents: number }[] };

  const runPeriodById = new Map((payoutRuns ?? []).map((r) => [r.id, r.period_start]));
  const payoutByMonth = sumByMonth(
    allShares ?? [],
    months,
    (s) => runPeriodById.get(s.run_id) ?? "",
    (s) => s.amount_inr_cents
  );
  const payrollByMonth = sumByMonth(
    payrollRuns ?? [],
    months,
    (r) => r.period_start,
    (r) => r.total_amount_cents
  );

  const payrollThisMonthCents = payrollByMonth.get(months[months.length - 1].key) ?? 0;
  const payoutThisMonthCents = currentMonthRun
    ? (allShares ?? []).filter((s) => s.run_id === currentMonthRun.id).reduce((sum, s) => sum + s.amount_inr_cents, 0)
    : 0;
  const vendorDueCents = (vendors ?? []).reduce((sum, v) => sum + v.amount_cents, 0);

  const combinedTrendData = months.map((m) => ({
    label: m.label,
    value: (payrollByMonth.get(m.key) ?? 0) + (payoutByMonth.get(m.key) ?? 0),
  }));

  const categoryBreakdown = currentMonthRun
    ? (Object.keys(CATEGORY_LABELS) as PayoutShareCategory[])
        .map((category) => ({
          label: CATEGORY_LABELS[category],
          value: (allShares ?? [])
            .filter((s) => s.run_id === currentMonthRun.id && s.category === category)
            .reduce((sum, s) => sum + s.amount_inr_cents, 0),
        }))
        .filter((c) => c.value > 0)
    : [];

  return (
    <div>
      <PageHeader title="Financial Dashboard" description="Revenue, payroll, founder payouts, and vendor obligations." />

      <div className="mb-10">
        <h2 className="text-sm font-semibold text-foreground mb-3">Revenue</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-6">
          <StatCard label="Revenue (this month)" value={formatUSD(revenueThisMonthCents)} />
          <StatCard label="Outstanding invoices" value={formatUSD(outstandingCents)} hint={`${(openInvoices ?? []).length} open`} />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 mb-6">
          <div className="lg:col-span-2">
            <TrendChart title="Revenue collected — last 6 months" data={revenueTrendData} format="usd" />
          </div>
          <BreakdownChart title="Revenue by sales owner" data={salesOwnerBreakdown} />
        </div>

        <Card>
          {topClients.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase text-muted">
                  <th className="px-5 py-3">Client</th>
                  <th className="px-5 py-3">Sales owner</th>
                  <th className="px-5 py-3">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {topClients.map(({ client, cents }) => (
                  <tr key={client!.id} className="hover:bg-black/[0.02]">
                    <td className="px-5 py-3">
                      <Link href={`/clients/${client!.id}`} className="font-medium text-foreground hover:underline">
                        {client!.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-muted">
                      {(client!.employees as unknown as { full_name: string } | null)?.full_name ?? "—"}
                    </td>
                    <td className="px-5 py-3 font-medium text-foreground">{formatUSD(cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState message="No revenue recorded yet." />
          )}
        </Card>
      </div>

      <div className="mb-10">
        <h2 className="text-sm font-semibold text-foreground mb-3">Payroll & founder payouts</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-6">
          <StatCard label="Payroll (this month)" value={formatINR(payrollThisMonthCents)} />
          <StatCard label="Founder payout (this month)" value={formatINR(payoutThisMonthCents)} />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <TrendChart title="Payroll + founder payout — last 6 months" data={combinedTrendData} format="inr" variant="bar" />
          </div>
          <BreakdownChart title="This month's payout by category" data={categoryBreakdown} format="inr" />
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Vendor bills due within 7 days</h2>
          <span className="text-xs text-muted">
            <span className="font-semibold text-foreground">{formatINR(vendorDueCents)}</span> due · {(vendors ?? []).length} upcoming
          </span>
        </div>
        <Card>
          {vendors && vendors.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase text-muted">
                  <th className="px-5 py-3">Vendor</th>
                  <th className="px-5 py-3">Amount</th>
                  <th className="px-5 py-3">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {vendors.map((v) => (
                  <tr key={v.id} className={v.next_due_date! < todayStr ? "bg-brand-red/5" : undefined}>
                    <td className="px-5 py-3">
                      <Link href={`/vendors/${v.id}`} className="font-medium text-foreground hover:underline">
                        {v.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-muted">{formatINR(v.amount_cents)}</td>
                    <td className="px-5 py-3 text-muted">{formatDate(v.next_due_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState message="No vendor bills due in the next 7 days." />
          )}
        </Card>
      </div>
    </div>
  );
}
