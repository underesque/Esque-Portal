import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AutoSubmitSelect } from "@/components/AutoSubmitSelect";
import { PageHeader, Card, Badge, Button, Input, Select, Textarea, Label, EmptyState } from "@/components/ui";
import { formatINR, formatDate, titleCase } from "@/lib/format";
import { updateEmployee } from "@/lib/actions/employees";
import { addCommissionEntry, updateCommissionStatus } from "@/lib/actions/payroll";
import { saveDailyScorecard, deleteDailyScorecard } from "@/lib/actions/scorecards";
import {
  SCORECARD_CATEGORIES,
  calculateMonthlyScore,
  incrementPercentForYearlyScore,
  monthBounds,
  mostRecentWeekday,
} from "@/lib/scorecard";
import type { CommissionEntry, DailyScorecard, Employee, MonthlyScorecard, PayrollRun, ProjectAssignment } from "@/lib/types";

export default async function EmployeeDetailPage({ params }: PageProps<"/employees/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: employee },
    { data: commissionEntries },
    { data: payrollRuns },
    { data: scorecards },
    { data: dailyScorecards },
    { data: projectAssignments },
  ] = await Promise.all([
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
    supabase
      .from("daily_scorecards")
      .select("*")
      .eq("employee_id", id)
      .order("entry_date", { ascending: false })
      .returns<DailyScorecard[]>(),
    supabase
      .from("project_assignments")
      .select("*, projects(id, name, status, clients(name))")
      .eq("employee_id", id)
      .returns<(ProjectAssignment & { projects: { id: string; name: string; status: string; clients: { name: string } | null } | null })[]>(),
  ]);

  if (!employee) notFound();

  const pendingCommissionCents = (commissionEntries ?? [])
    .filter((e) => e.status !== "paid")
    .reduce((sum, e) => sum + e.commission_amount_cents, 0);

  const scorecardRows = scorecards ?? [];
  const { start: defaultMonthStart } = monthBounds(new Date());
  const existingForThisMonth = scorecardRows.find((s) => s.period_start === defaultMonthStart);
  const currentYear = new Date().getFullYear();
  const thisYearScores = scorecardRows.filter((s) => Number(s.period_start.slice(0, 4)) === currentYear);
  const yearlyScore =
    thisYearScores.length > 0 ? thisYearScores.reduce((sum, s) => sum + calculateMonthlyScore(s), 0) / thisYearScores.length : null;

  const dailyRows = dailyScorecards ?? [];
  const defaultEntryDate = mostRecentWeekday(new Date());
  const existingForDefaultDate = dailyRows.find((d) => d.entry_date === defaultEntryDate);

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
                <Label>Employee ID</Label>
                <Input name="employee_code" placeholder="Assign later" defaultValue={employee.employee_code ?? ""} />
              </div>
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label>Employment type</Label>
                  <Select name="employment_type" defaultValue={employee.employment_type}>
                    <option value="full_time">Full-time</option>
                    <option value="part_time">Part-time</option>
                    <option value="contractual">Contractual</option>
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              <div className="rounded-lg border border-border p-3">
                <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <input type="checkbox" name="is_founder" defaultChecked={employee.is_founder} />
                  Is a founder
                </label>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Salary basis</Label>
                    <Select name="salary_basis" defaultValue={employee.salary_basis}>
                      <option value="full_time">Full-time (₹75,000 cap)</option>
                      <option value="half_time">Half-time (₹40,000 cap)</option>
                      <option value="hourly_director">Director hourly (₹500/hr)</option>
                      <option value="custom">Custom</option>
                    </Select>
                  </div>
                  <div>
                    <Label>Hours (if hourly)</Label>
                    <Input
                      name="salary_basis_hours"
                      type="number"
                      step="0.5"
                      min="0"
                      defaultValue={employee.salary_basis_hours}
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <Label>Custom monthly salary (INR, if basis is Custom)</Label>
                  <Input
                    name="salary_basis_custom"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={(employee.salary_basis_custom_cents / 100).toFixed(2)}
                  />
                </div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <Label>T-shirt size</Label>
                <Select name="t_shirt_size" defaultValue={employee.t_shirt_size ?? ""}>
                  <option value="">— Not set —</option>
                  <option value="XS">XS</option>
                  <option value="S">S</option>
                  <option value="M">M</option>
                  <option value="L">L</option>
                  <option value="XL">XL</option>
                  <option value="XXL">XXL</option>
                </Select>
                <div className="mt-3 text-xs font-medium text-muted">Bank details</div>
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Account holder</Label>
                    <Input name="bank_account_holder" defaultValue={employee.bank_account_holder ?? ""} />
                  </div>
                  <div>
                    <Label>Bank name</Label>
                    <Input name="bank_name" defaultValue={employee.bank_name ?? ""} />
                  </div>
                  <div>
                    <Label>Account number</Label>
                    <Input name="bank_account_number" defaultValue={employee.bank_account_number ?? ""} />
                  </div>
                  <div>
                    <Label>IFSC</Label>
                    <Input name="bank_ifsc" defaultValue={employee.bank_ifsc ?? ""} />
                  </div>
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                          <AutoSubmitSelect
                            name="status"
                            defaultValue={entry.status}
                            className="rounded-md border border-border bg-white px-2 py-1 text-xs"
                          >
                            <option value="pending">Pending</option>
                            <option value="approved">Approved</option>
                            <option value="paid">Paid</option>
                          </AutoSubmitSelect>
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
            <h2 className="text-sm font-semibold text-foreground mb-3">Projects</h2>
            {projectAssignments && projectAssignments.length > 0 ? (
              <ul className="divide-y divide-border">
                {projectAssignments.map((a) => {
                  const amount =
                    a.billing_type === "hourly" && a.hourly_rate_cents && a.hours
                      ? Math.round(a.hourly_rate_cents * a.hours)
                      : a.billing_type === "fixed_contract"
                        ? a.fixed_contract_amount_cents
                        : null;
                  return (
                    <li key={a.id} className="flex items-center justify-between py-2.5 text-sm">
                      <span>
                        {a.projects ? (
                          <Link href={`/projects/${a.projects.id}`} className="font-medium text-foreground hover:underline">
                            {a.projects.name}
                          </Link>
                        ) : (
                          "—"
                        )}{" "}
                        <span className="text-muted">({a.projects?.clients?.name ?? "—"})</span>
                        {amount !== null && <span className="ml-2 text-xs text-muted">{formatINR(amount)}</span>}
                      </span>
                      {a.projects && <Badge status={a.projects.status} />}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState message="Not assigned to any projects yet." />
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

            {existingForThisMonth && (
              <p className="mb-4 text-xs text-muted">
                This month&apos;s rollup (auto-computed): {calculateMonthlyScore(existingForThisMonth).toFixed(1)}%
                {existingForThisMonth.notes ? ` — ${existingForThisMonth.notes}` : ""}
              </p>
            )}

            <p className="mb-2 text-xs font-medium text-foreground">Daily entry (weekdays only)</p>
            <form
              action={saveDailyScorecard.bind(null, employee.id)}
              className="mb-5 space-y-3 rounded-lg border border-border p-4"
            >
              <div>
                <Label>Date</Label>
                <Input name="entry_date" type="date" required defaultValue={defaultEntryDate} />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                      defaultValue={existingForDefaultDate ? existingForDefaultDate[c.key] : 100}
                      required
                    />
                  </div>
                ))}
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea name="notes" rows={2} defaultValue={existingForDefaultDate?.notes ?? ""} />
              </div>
              <div className="flex justify-end">
                <Button type="submit" variant="secondary">
                  Save this day&apos;s scorecard
                </Button>
              </div>
            </form>

            {dailyRows.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium uppercase text-muted">
                    <th className="py-2">Date</th>
                    <th className="py-2">Overall score</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {dailyRows.map((d) => (
                    <tr key={d.id}>
                      <td className="py-2 text-foreground">{formatDate(d.entry_date)}</td>
                      <td className="py-2 font-medium text-foreground">{calculateMonthlyScore(d).toFixed(1)}%</td>
                      <td className="py-2 text-right">
                        <form action={deleteDailyScorecard.bind(null, employee.id, d.id)}>
                          <button type="submit" className="text-xs text-brand-red hover:underline">
                            Delete
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState message="No daily entries yet." />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
