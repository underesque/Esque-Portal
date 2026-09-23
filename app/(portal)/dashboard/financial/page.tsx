import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, StatCard, EmptyState } from "@/components/ui";
import { TrendChart, BreakdownChart } from "@/components/charts";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { SectionTabs } from "@/components/SectionTabs";
import { formatUSD, formatINR, formatDate } from "@/lib/format";
import { resolveRange, bucketsForRange, sumByBucket, isRangeKey, DEFAULT_RANGE } from "@/lib/dashboard";
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

const SECTIONS = [
  { key: "revenue", label: "Revenue" },
  { key: "payroll", label: "Payroll & Payouts" },
  { key: "vendors", label: "Vendor Bills" },
] as const;
type SectionKey = (typeof SECTIONS)[number]["key"];

export default async function FinancialDashboardPage({ searchParams }: PageProps<"/dashboard/financial">) {
  await requireAdmin();
  const supabase = await createClient();
  const sp = await searchParams;
  const rangeParam = Array.isArray(sp.range) ? sp.range[0] : sp.range;
  const range = resolveRange(isRangeKey(rangeParam) ? rangeParam : DEFAULT_RANGE);
  const buckets = bucketsForRange(range);
  const sectionParam = Array.isArray(sp.section) ? sp.section[0] : sp.section;
  const section: SectionKey = SECTIONS.some((s) => s.key === sectionParam) ? (sectionParam as SectionKey) : "revenue";

  return (
    <div>
      <PageHeader title="Financial Dashboard" description="Revenue, payroll, founder payouts, and vendor obligations." />
      <DateRangeFilter />
      <SectionTabs options={SECTIONS as unknown as { key: string; label: string }[]} defaultValue="revenue" />

      {section === "revenue" && <RevenueSection supabase={supabase} range={range} buckets={buckets} />}
      {section === "payroll" && <PayrollSection supabase={supabase} range={range} buckets={buckets} />}
      {section === "vendors" && <VendorsSection supabase={supabase} />}
    </div>
  );
}

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Range = ReturnType<typeof resolveRange>;
type Buckets = ReturnType<typeof bucketsForRange>;

async function RevenueSection({ supabase, range, buckets }: { supabase: Supabase; range: Range; buckets: Buckets }) {
  const [{ data: rangePaidInvoices }, { data: openInvoices }, { data: clients }, { data: rangeCash }] = await Promise.all([
    supabase
      .from("invoices")
      .select("amount_cents, client_id, paid_at")
      .eq("status", "paid")
      .gte("paid_at", range.startISO)
      .lt("paid_at", range.endExclusiveISO),
    supabase.from("invoices").select("amount_cents").in("status", ["sent", "overdue"]),
    supabase.from("clients").select("id, name, sales_owner_id, employees!sales_owner_id(full_name)"),
    supabase.from("payments").select("amount_cents").gte("payment_date", range.startISO).lt("payment_date", range.endExclusiveISO),
  ]);

  // Revenue is tracked off paid invoices (always USD, what was actually
  // billed), not the payments table — payments record the real INR amount
  // credited to the bank after Skydo's FX conversion/fees, a different
  // currency entirely from the invoice, so they can't be summed as USD
  // revenue. "Cash collected" below is the payments-table figure instead,
  // on purpose.
  const revenueInRangeCents = (rangePaidInvoices ?? []).reduce((sum, i) => sum + i.amount_cents, 0);
  const outstandingCents = (openInvoices ?? []).reduce((sum, i) => sum + i.amount_cents, 0);
  const cashCollectedInrCents = (rangeCash ?? []).reduce((sum, p) => sum + p.amount_cents, 0);

  const revenueByBucket = sumByBucket(
    rangePaidInvoices ?? [],
    buckets,
    (i) => i.paid_at ?? "",
    (i) => i.amount_cents
  );
  const revenueTrendData = buckets.map((b) => ({ label: b.label, value: revenueByBucket.get(b.key) ?? 0 }));

  const clientById = new Map((clients ?? []).map((c) => [c.id, c]));
  const revenueByClient = new Map<string, number>();
  (rangePaidInvoices ?? []).forEach((i) => {
    revenueByClient.set(i.client_id, (revenueByClient.get(i.client_id) ?? 0) + i.amount_cents);
  });
  const topClients = Array.from(revenueByClient.entries())
    .map(([clientId, cents]) => ({ client: clientById.get(clientId), cents }))
    .filter((row) => row.client)
    .sort((a, b) => b.cents - a.cents)
    .slice(0, 8);

  const revenueBySalesOwner = new Map<string, number>();
  (rangePaidInvoices ?? []).forEach((i) => {
    const client = clientById.get(i.client_id);
    const ownerName = (client?.employees as unknown as { full_name: string } | null)?.full_name ?? "Unattributed";
    revenueBySalesOwner.set(ownerName, (revenueBySalesOwner.get(ownerName) ?? 0) + i.amount_cents);
  });
  const salesOwnerBreakdown = Array.from(revenueBySalesOwner.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, cents]) => ({ label, value: Math.round(cents / 100) }));

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-6">
        <StatCard label={`Revenue (${range.label.toLowerCase()})`} value={formatUSD(revenueInRangeCents)} />
        <StatCard label="Outstanding invoices" value={formatUSD(outstandingCents)} hint={`${(openInvoices ?? []).length} open`} />
        <StatCard
          label={`Cash collected (${range.label.toLowerCase()})`}
          value={formatINR(cashCollectedInrCents)}
          hint="Net of Skydo FX + fees"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 mb-6">
        <div className="lg:col-span-2">
          <TrendChart title={`Revenue collected — ${range.label.toLowerCase()}`} data={revenueTrendData} format="usd" />
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
          <EmptyState message="No revenue recorded in this range." />
        )}
      </Card>
    </div>
  );
}

async function PayrollSection({ supabase, range, buckets }: { supabase: Supabase; range: Range; buckets: Buckets }) {
  const [{ data: rangePayroll }, { data: rangePayoutRuns }] = await Promise.all([
    supabase
      .from("payroll_runs")
      .select("period_start, total_amount_cents")
      .gte("period_start", range.startISO)
      .lt("period_start", range.endExclusiveISO),
    supabase
      .from("payout_runs")
      .select("id, period_start")
      .gte("period_start", range.startISO)
      .lt("period_start", range.endExclusiveISO),
  ]);

  // Founder payouts are inherently monthly (one payout_run per calendar
  // month), so instead of adaptive day/week bucketing, everything here sums
  // across whichever whole months the selected range touches.
  const payoutRunIds = (rangePayoutRuns ?? []).map((r) => r.id);
  const { data: rangeShares } =
    payoutRunIds.length > 0
      ? await supabase.from("payout_shares").select("run_id, category, amount_inr_cents").in("run_id", payoutRunIds)
      : { data: [] as { run_id: string; category: PayoutShareCategory; amount_inr_cents: number }[] };

  const runPeriodById = new Map((rangePayoutRuns ?? []).map((r) => [r.id, r.period_start]));
  const payoutByBucket = sumByBucket(
    rangeShares ?? [],
    buckets,
    (s) => runPeriodById.get(s.run_id) ?? "",
    (s) => s.amount_inr_cents
  );
  const payrollByBucket = sumByBucket(
    rangePayroll ?? [],
    buckets,
    (r) => r.period_start,
    (r) => r.total_amount_cents
  );

  const payrollInRangeCents = (rangePayroll ?? []).reduce((sum, r) => sum + r.total_amount_cents, 0);
  const payoutInRangeCents = (rangeShares ?? []).reduce((sum, s) => sum + s.amount_inr_cents, 0);

  const combinedTrendData = buckets.map((b) => ({
    label: b.label,
    value: (payrollByBucket.get(b.key) ?? 0) + (payoutByBucket.get(b.key) ?? 0),
  }));

  const categoryBreakdown = (Object.keys(CATEGORY_LABELS) as PayoutShareCategory[])
    .map((category) => ({
      label: CATEGORY_LABELS[category],
      value: (rangeShares ?? []).filter((s) => s.category === category).reduce((sum, s) => sum + s.amount_inr_cents, 0),
    }))
    .filter((c) => c.value > 0);

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-6">
        <StatCard label={`Payroll (${range.label.toLowerCase()})`} value={formatINR(payrollInRangeCents)} />
        <StatCard label={`Founder payout (${range.label.toLowerCase()})`} value={formatINR(payoutInRangeCents)} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TrendChart
            title={`Payroll + founder payout — ${range.label.toLowerCase()}`}
            data={combinedTrendData}
            format="inr"
            variant="bar"
          />
        </div>
        <BreakdownChart title={`Payout by category (${range.label.toLowerCase()})`} data={categoryBreakdown} format="inr" />
      </div>
    </div>
  );
}

async function VendorsSection({ supabase }: { supabase: Supabase }) {
  // Always relative to today (a forward-looking alert), not the selected
  // viewing window — there's no DateRangeFilter shown on this section.
  const today = new Date();
  const soonStr = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);

  const { data: vendors } = await supabase
    .from("vendors")
    .select("*")
    .eq("status", "active")
    .not("next_due_date", "is", null)
    .lte("next_due_date", soonStr)
    .order("next_due_date", { ascending: true })
    .returns<Vendor[]>();

  const vendorDueCents = (vendors ?? []).reduce((sum, v) => sum + v.amount_cents, 0);

  return (
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
  );
}
