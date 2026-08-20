import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Badge, Button, Input, Select, Label, EmptyState, StatCard } from "@/components/ui";
import { formatINR, formatDate } from "@/lib/format";
import { runPayroll } from "@/lib/actions/payroll";
import type { Employee, PayrollRun } from "@/lib/types";

export default async function PayrollPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: employees }, { data: payrollRuns }, { data: pendingCommissions }] = await Promise.all([
    supabase.from("employees").select("*").eq("status", "active").order("full_name").returns<Employee[]>(),
    supabase
      .from("payroll_runs")
      .select("*, employees(full_name)")
      .order("period_start", { ascending: false })
      .limit(25),
    supabase.from("commission_entries").select("commission_amount_cents").eq("status", "approved"),
  ]);

  const totalPendingCommission = (pendingCommissions ?? []).reduce(
    (sum, e) => sum + e.commission_amount_cents,
    0
  );
  const totalProcessed = (payrollRuns ?? []).reduce((sum, r) => sum + r.total_amount_cents, 0);

  return (
    <div>
      <PageHeader
        title="Payroll"
        description="Run payroll and track salary & commission payouts."
        action={
          <div className="flex gap-2">
            <Link href="/payroll/annual">
              <Button variant="secondary">Annual summary</Button>
            </Link>
            <Link href="/founders">
              <Button variant="secondary">Founder payouts</Button>
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-6">
        <StatCard label="Active employees" value={String((employees ?? []).length)} />
        <StatCard label="Approved commission (unpaid)" value={formatINR(totalPendingCommission)} />
        <StatCard label="Total processed (recent runs)" value={formatINR(totalProcessed)} />
      </div>

      <Card className="p-5 mb-6">
        <h2 className="text-sm font-semibold text-foreground mb-3">Run payroll</h2>
        <form action={runPayroll} className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end">
          <div className="sm:col-span-2">
            <Label>Employee</Label>
            <Select name="employee_id" required>
              {(employees ?? []).map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name} ({employee.pay_type})
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Period start</Label>
            <Input name="period_start" type="date" required />
          </div>
          <div>
            <Label>Period end</Label>
            <Input name="period_end" type="date" required />
          </div>
          <div className="sm:col-span-4 flex justify-end">
            <Button type="submit">Process payroll</Button>
          </div>
        </form>
        <p className="mt-3 text-xs text-muted">
          Base salary is included automatically for fixed/hybrid employees. Approved commission entries
          within the period are paid out and marked paid.
        </p>
      </Card>

      <Card>
        <h2 className="px-5 pt-4 text-sm font-semibold text-foreground">Recent payroll runs</h2>
        {payrollRuns && payrollRuns.length > 0 ? (
          <table className="w-full text-sm mt-2">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase text-muted">
                <th className="px-5 py-3">Employee</th>
                <th className="px-5 py-3">Period</th>
                <th className="px-5 py-3">Base</th>
                <th className="px-5 py-3">Commission</th>
                <th className="px-5 py-3">Total</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(payrollRuns as (PayrollRun & { employees: { full_name: string } | null })[]).map((run) => (
                <tr key={run.id}>
                  <td className="px-5 py-3">
                    <Link href={`/employees/${run.employee_id}`} className="font-medium text-foreground hover:underline">
                      {run.employees?.full_name ?? "—"}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-muted">
                    {formatDate(run.period_start)} – {formatDate(run.period_end)}
                  </td>
                  <td className="px-5 py-3 text-muted">{formatINR(run.base_amount_cents)}</td>
                  <td className="px-5 py-3 text-muted">{formatINR(run.commission_amount_cents)}</td>
                  <td className="px-5 py-3 font-medium text-foreground">{formatINR(run.total_amount_cents)}</td>
                  <td className="px-5 py-3">
                    <Badge status={run.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState message="No payroll runs yet." />
        )}
      </Card>
    </div>
  );
}
