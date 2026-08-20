import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, StatCard, EmptyState, Button, Select } from "@/components/ui";
import { formatINR } from "@/lib/format";

function currentFyStartYear(): number {
  const now = new Date();
  return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
}

function fyBounds(startYear: number) {
  return {
    start: `${startYear}-04-01`,
    end: `${startYear + 1}-03-31`,
    label: `FY ${startYear}–${String(startYear + 1).slice(2)}`,
  };
}

export default async function AnnualSalarySummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const currentFy = currentFyStartYear();
  const selectedFy = params.fy ? Number(params.fy) : currentFy;
  const { start, end, label } = fyBounds(selectedFy);

  const supabase = await createClient();

  const [{ data: employees }, { data: payrollRuns }, { data: distributionRuns }] = await Promise.all([
    supabase.from("employees").select("id, full_name"),
    supabase
      .from("payroll_runs")
      .select("employee_id, base_amount_cents, commission_amount_cents, total_amount_cents")
      .gte("period_start", start)
      .lte("period_start", end),
    supabase.from("distribution_runs").select("id").gte("period_start", start).lte("period_start", end),
  ]);

  const runIds = (distributionRuns ?? []).map((r) => r.id);
  const { data: distributionShares } = runIds.length
    ? await supabase
        .from("distribution_shares")
        .select("employee_id, amount_inr_cents")
        .in("run_id", runIds)
    : { data: [] };

  const nameById = new Map((employees ?? []).map((e) => [e.id, e.full_name]));

  type Row = { employeeId: string; payrollCents: number; distributionCents: number };
  const rows = new Map<string, Row>();

  function getRow(employeeId: string): Row {
    let row = rows.get(employeeId);
    if (!row) {
      row = { employeeId, payrollCents: 0, distributionCents: 0 };
      rows.set(employeeId, row);
    }
    return row;
  }

  (payrollRuns ?? []).forEach((r) => {
    getRow(r.employee_id).payrollCents += r.total_amount_cents;
  });
  (distributionShares ?? []).forEach((s) => {
    getRow(s.employee_id).distributionCents += s.amount_inr_cents;
  });

  const sortedRows = Array.from(rows.values())
    .map((r) => ({ ...r, grandTotalCents: r.payrollCents + r.distributionCents }))
    .sort((a, b) => b.grandTotalCents - a.grandTotalCents);

  const totalPayrollCents = sortedRows.reduce((sum, r) => sum + r.payrollCents, 0);
  const totalDistributionCents = sortedRows.reduce((sum, r) => sum + r.distributionCents, 0);
  const grandTotalCents = totalPayrollCents + totalDistributionCents;

  const fyOptions = Array.from({ length: 5 }, (_, i) => currentFy - i);

  return (
    <div>
      <Link
        href="/payroll"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft size={14} /> Back to payroll
      </Link>

      <PageHeader
        title="Annual Salary Summary"
        description="Total payroll and founder distributions processed per person, by financial year."
        action={
          <form method="get" className="flex items-center gap-2">
            <Select name="fy" defaultValue={String(selectedFy)} className="w-auto">
              {fyOptions.map((y) => (
                <option key={y} value={y}>
                  {fyBounds(y).label}
                </option>
              ))}
            </Select>
            <Button type="submit" variant="secondary">
              View
            </Button>
          </form>
        }
      />

      <p className="text-xs text-muted -mt-4 mb-6">
        {label}: {start} to {end}
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-6">
        <StatCard label="Payroll processed" value={formatINR(totalPayrollCents)} />
        <StatCard label="Founder distributions" value={formatINR(totalDistributionCents)} />
        <StatCard label="Grand total" value={formatINR(grandTotalCents)} />
      </div>

      <Card>
        {sortedRows.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase text-muted">
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Payroll (salary + commission)</th>
                <th className="px-5 py-3">Founder distribution</th>
                <th className="px-5 py-3">Total for {label}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedRows.map((row) => (
                <tr key={row.employeeId}>
                  <td className="px-5 py-3 font-medium text-foreground">
                    {nameById.get(row.employeeId) ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-muted">{formatINR(row.payrollCents)}</td>
                  <td className="px-5 py-3 text-muted">{formatINR(row.distributionCents)}</td>
                  <td className="px-5 py-3 font-semibold text-foreground">{formatINR(row.grandTotalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState message="No payroll or distributions processed for this financial year yet." />
        )}
      </Card>
    </div>
  );
}
