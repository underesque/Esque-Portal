import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Badge, Button, Input, Select, Textarea, Label, EmptyState } from "@/components/ui";
import { formatINR, formatDate, titleCase } from "@/lib/format";
import { updateEmployee } from "@/lib/actions/employees";
import { addCommissionEntry, updateCommissionStatus } from "@/lib/actions/payroll";
import { saveMonthlyScorecard } from "@/lib/actions/scorecards";
import { SCORECARD_CATEGORIES, calculateMonthlyScore, incrementPercentForYearlyScore } from "@/lib/scorecard";
import type { CommissionEntry, Employee, MonthlyScorecard, PayrollRun } from "@/lib/types";

function monthBounds(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export default async function EmployeeDetailPage({ params }: PageProps<"/employees/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: employee }, { data: commissionEntries }, { data: payrollRuns }, { data: scorecards }] = await Promise.all([
    supabase.from("employees").select("*").eq("id", id).single<Employee>(),
    supabase
      .from("commission_entries")
      .select("*")
      .eq("employee_id", id)
      .order("created_at", { ascending: false })
      .returns<CommissionEntry[]>(),
    supabase
      .from("payroll_runs")
      .select("*")
      .eq("employee_id", id)
      .order("period_start", { ascending: false })
      .returns<PayrollRun[]>(),
    supabase
      .from("monthly_scorecards")
      .select("*")
      .eq("employee_id", id)
      .order("period_start", { ascending: false })
      .returns<MonthlyScorecard[]>(),
  ]);

  if (!employee) notFound();

  const pendingCommissionCents = (commissionEntries ?? [])
    .filter((e) => e.status !== "paid")
    .reduce((sum, e) => sum + e.commission_amount_cents, 0);

  const scorecardRows = scorecards ?? [];
  const { start: defaultMonthStart, end: defaultMonthEnd } = monthBounds(new Date());
  const existingForThisMonth = scorecardRows.find((s) => s.period_start === defaultMonthStart);
  const currentYear = new Date().getFullYear();
  const thisYearScores = scorecardRows.filter((s) => new Date(s.period_start).getFullYear() === currentYear);
  const yearlyScore =
    thisYearScores.length > 0 ? thisYearScores.reduce((sum, s) => sum + calculateMonthlyScore(s), 0) / thisYearScores.length : null;

  return (
    <div>
      <Link
        href="/employees"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft size={14} /> Back to employees
      </Link>

      <PageHeader
        title={employee.full_name}
        description={titleCase(employee.employment_type)}
        action={<Badge status={employee.status} />}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1 space-y-6">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3">Edit employee</h2>
            <form action={updateEmployee.bind(null, employee.id)} className="space-y-3">
              <div>
                <Label>Full name</Label>
                <Input name="full_name" defaultValue={employee.full_name} required />
              </div>
              <div>
                <Label>Email</Label>
                <Input name="email" type="email" defaultValue={employee.email ?? ""} />
              </div>
              <div>
                <Label>Phone</Label>
                <Input name="phone" defaultValue={employee.phone ?? ""} />
              </div>
              <div>
                <Label>Start date</Label>
                <Input name="start_date" type="date" defaultValue={employee.start_date} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Employment type</Label>
                  <Select name="employment_type" defaultValue={employee.employment_type}>
                    <option value="full_time">Full-time</option>
                    <option value="part_time">Part-time</option>
                    <option value="contractor">Contractor</option>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select name="status" defaultValue={employee.status}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Pay structure</Label>
                <Select name="pay_type" defaultValue={employee.pay_type}>
                  <option value="fixed">Fixed salary</option>
                  <option value="commission">Commission only</option>
                  <option value="hybrid">Fixed + commission</option>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Base salary (INR / yr)</Label>
                  <Input
                    name="base_salary"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={(employee.base_salary_cents / 100).toFixed(2)}
                  />
                </div>
                <div>
                  <Label>Commission rate (%)</Label>
                  <Input
                    name="commission_rate_percent"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    defaultValue={employee.commission_rate_percent}
                  />
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea name="notes" rows={2} defaultValue={employee.notes ?? ""} />
              </div>
              <Button type="submit" className="w-full">
                Save changes
              </Button>
            </form>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3">Earnings summary</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Base salary</dt>
                <dd className="font-medium text-foreground">{formatINR(employee.base_salary_cents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Commission rate</dt>
                <dd className="font-medium text-foreground">{employee.commission_rate_percent}%</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-2">
                <dt className="text-muted">Unpaid commission</dt>
                <dd className="font-semibold text-brand-red">{formatINR(pendingCommissionCents)}</dd>
              </div>
            </dl>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3">Commission entries</h2>
            <form action={addCommissionEntry} className="mb-5 space-y-3 rounded-lg border border-border p-4">
              <input type="hidden" name="employee_id" value={employee.id} />
              <div>
                <Label>Description</Label>
                <Input name="description" placeholder="e.g. Acme Co. deal closed" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Base amount (INR)</Label>
                  <Input name="base_amount" type="number" step="0.01" min="0" required />
                </div>
                <div>
                  <Label>Rate (%)</Label>
                  <Input
                    name="rate_percent"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    defaultValue={employee.commission_rate_percent}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Period start</Label>
                  <Input name="period_start" type="date" required />
                </div>
                <div>
                  <Label>Period end</Label>
                  <Input name="period_end" type="date" required />
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" variant="secondary">
                  Add commission entry
                </Button>
              </div>
            </form>

            {commissionEntries && commissionEntries.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium uppercase text-muted">
                    <th className="py-2">Description</th>
                    <th className="py-2">Base</th>
                    <th className="py-2">Rate</th>
                    <th className="py-2">Commission</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {commissionEntries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="py-2 text-foreground">{entry.description}</td>
                      <td className="py-2 text-muted">{formatINR(entry.base_amount_cents)}</td>
                      <td className="py-2 text-muted">{entry.rate_percent}%</td>
                      <td className="py-2 font-medium text-foreground">
                        {formatINR(entry.commission_amount_cents)}
                      </td>
                      <td className="py-2">
                        <form
                          action={async (formData: FormData) => {
                            "use server";
                            await updateCommissionStatus(
                              employee.id,
                              entry.id,
                              String(formData.get("status")) as "pending" | "approved" | "paid"
                            );
                          }}
                        >
                          <select
                            name="status"
                            defaultValue={entry.status}
                            className="rounded-md border border-border bg-white px-2 py-1 text-xs"
                            onChange={(e) => e.currentTarget.form?.requestSubmit()}
                          >
                            <option value="pending">Pending</option>
                            <option value="approved">Approved</option>
                            <option value="paid">Paid</option>
                          </select>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState message="No commission entries yet." />
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3">Payroll history</h2>
            {payrollRuns && payrollRuns.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium uppercase text-muted">
                    <th className="py-2">Period</th>
                    <th className="py-2">Base</th>
                    <th className="py-2">Commission</th>
                    <th className="py-2">Total</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {payrollRuns.map((run) => (
                    <tr key={run.id}>
                      <td className="py-2 text-muted">
                        {formatDate(run.period_start)} – {formatDate(run.period_end)}
                      </td>
                      <td className="py-2 text-muted">{formatINR(run.base_amount_cents)}</td>
                      <td className="py-2 text-muted">{formatINR(run.commission_amount_cents)}</td>
                      <td className="py-2 font-medium text-foreground">{formatINR(run.total_amount_cents)}</td>
                      <td className="py-2">
                        <Badge status={run.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState message="No payroll runs processed yet." />
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground">Performance scorecard</h2>
              {yearlyScore !== null && (
                <span className="text-xs text-muted">
                  {currentYear} avg {yearlyScore.toFixed(1)}% · {incrementPercentForYearlyScore(yearlyScore)}% increment tier
                </span>
              )}
            </div>
            <form
              action={saveMonthlyScorecard.bind(null, employee.id)}
              className="mb-5 space-y-3 rounded-lg border border-border p-4"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Period start</Label>
                  <Input name="period_start" type="date" required defaultValue={defaultMonthStart} />
                </div>
                <div>
                  <Label>Period end</Label>
                  <Input name="period_end" type="date" required defaultValue={defaultMonthEnd} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {SCORECARD_CATEGORIES.map((c) => (
                  <div key={c.key}>
                    <Label>
                      {c.label} ({Math.round(c.weight * 100)}%)
                    </Label>
                    <Input
                      name={c.key}
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      defaultValue={existingForThisMonth ? existingForThisMonth[c.key] : 100}
                      required
                    />
                  </div>
                ))}
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea name="notes" rows={2} defaultValue={existingForThisMonth?.notes ?? ""} />
              </div>
              <div className="flex justify-end">
                <Button type="submit" variant="secondary">
                  Save this month&apos;s scorecard
                </Button>
              </div>
            </form>

            {scorecardRows.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium uppercase text-muted">
                    <th className="py-2">Month</th>
                    <th className="py-2">Overall score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {scorecardRows.map((s) => (
                    <tr key={s.id}>
                      <td className="py-2 text-foreground">{formatDate(s.period_start)}</td>
                      <td className="py-2 font-medium text-foreground">{calculateMonthlyScore(s).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState message="No scorecards entered yet." />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
