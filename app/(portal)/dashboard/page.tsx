import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { PageHeader, StatCard } from "@/components/ui";
import { formatUSD, formatINR } from "@/lib/format";

export default async function DashboardPage() {
  const { profile } = await requireUser();
  const supabase = await createClient();
  const isAdmin = profile.role === "admin";

  const [
    { count: clientCount },
    { count: prospectCount },
    { data: payments },
    { data: openInvoices },
    { count: activeEmployees },
  ] = await Promise.all([
    supabase.from("clients").select("id", { count: "exact", head: true }),
    supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("status", "prospect"),
    supabase.from("payments").select("amount_cents"),
    supabase
      .from("invoices")
      .select("amount_cents")
      .in("status", ["sent", "overdue"]),
    supabase
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
  ]);

  const totalRevenueCents = (payments ?? []).reduce((sum, p) => sum + p.amount_cents, 0);
  const pendingInvoiceCents = (openInvoices ?? []).reduce(
    (sum, i) => sum + i.amount_cents,
    0
  );

  let payrollSummary: string | null = null;
  if (isAdmin) {
    const { data: payrollRuns } = await supabase
      .from("payroll_runs")
      .select("total_amount_cents")
      .gte(
        "period_start",
        new Date(new Date().setDate(1)).toISOString().slice(0, 10)
      );
    const total = (payrollRuns ?? []).reduce((sum, r) => sum + r.total_amount_cents, 0);
    payrollSummary = formatINR(total);
  }

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${profile.full_name.split(" ")[0]}`}
        description="Here's what's happening across ESQUE right now."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Clients"
          value={String(clientCount ?? 0)}
          hint={`${prospectCount ?? 0} prospects`}
        />
        <StatCard label="Revenue Collected" value={formatUSD(totalRevenueCents)} />
        <StatCard
          label="Pending Invoices"
          value={formatUSD(pendingInvoiceCents)}
          hint={`${(openInvoices ?? []).length} open`}
        />
        {isAdmin ? (
          <StatCard
            label="Payroll (this month)"
            value={payrollSummary ?? formatINR(0)}
          />
        ) : (
          <StatCard label="Employees" value={String(activeEmployees ?? 0)} />
        )}
      </div>

      {isAdmin && (
        <div className="mt-6 max-w-xs">
          <StatCard label="Active Employees" value={String(activeEmployees ?? 0)} />
        </div>
      )}

      <div className="mt-8 flex gap-3">
        <Link href="/clients" className="text-sm font-medium text-foreground hover:underline">
          View all clients →
        </Link>
        {isAdmin && (
          <Link href="/payroll" className="text-sm font-medium text-foreground hover:underline">
            Go to payroll →
          </Link>
        )}
      </div>
    </div>
  );
}
