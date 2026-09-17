import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import clsx from "clsx";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AutoSubmitSelect } from "@/components/AutoSubmitSelect";
import { PageHeader, Card, Badge, Button, Input, Select, Textarea, Label, EmptyState } from "@/components/ui";
import { formatINR, formatDate, titleCase } from "@/lib/format";
import { updateEmployee } from "@/lib/actions/employees";
import { addCommissionEntry, updateCommissionStatus } from "@/lib/actions/payroll";
import { saveDailyScorecard, deleteDailyScorecard } from "@/lib/actions/scorecards";
import { linkEmployeeAccount, unlinkEmployeeAccount } from "@/lib/actions/profiles";
import {
  SCORECARD_CATEGORIES,
  calculateMonthlyScore,
  incrementPercentForYearlyScore,
  monthBounds,
  mostRecentWeekday,
} from "@/lib/scorecard";
import type { CommissionEntry, DailyScorecard, Employee, MonthlyScorecard, PayrollRun, ProjectAssignment } from "@/lib/types";

type StaffProfile = { id: string; full_name: string; employee_id: string | null };
type ProjectAssignmentRow = ProjectAssignment & {
  projects: { id: string; name: string; status: string; clients: { name: string } | null } | null;
};

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "scorecard", label: "Scorecard" },
  { key: "payroll", label: "Payroll" },
  { key: "projects", label: "Projects" },
  { key: "portal", label: "Portal Account" },
] as const;
type TabKey = (typeof TABS)[number]["key"] | "edit";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}

export default async function EmployeeDetailPage({ params, searchParams }: PageProps<"/employees/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const tabParam = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab: TabKey = TABS.some((t) => t.key === tabParam) || tabParam === "edit" ? (tabParam as TabKey) : "overview";
  const supabase = await createClient();

  const { data: employee } = await supabase.from("employees").select("*").eq("id", id).single<Employee>();
  if (!employee) notFound();

  let commissionEntries: CommissionEntry[] = [];
  let payrollRuns: PayrollRun[] = [];
  let scorecardRows: MonthlyScorecard[] = [];
  let dailyRows: DailyScorecard[] = [];
  let projectAssignments: ProjectAssignmentRow[] = [];
  let staffProfiles: StaffProfile[] = [];

  if (tab === "payroll") {
    const [{ data: ce }, { data: pr }] = await Promise.all([
      supabase.from("commission_entries").select("*").eq("employee_id", id).order("created_at", { ascending: false }).returns<CommissionEntry[]>(),
      supabase.from("payroll_runs").select("*").eq("employee_id", id).order("period_start", { ascending: false }).returns<PayrollRun[]>(),
    ]);
    commissionEntries = ce ?? [];
    payrollRuns = pr ?? [];
  } else if (tab === "scorecard") {
    const [{ data: sc }, { data: dc }] = await Promise.all([
      supabase.from("monthly_scorecards").select("*").eq("employee_id", id).order("period_start", { ascending: false }).returns<MonthlyScorecard[]>(),
      supabase.from("daily_scorecards").select("*").eq("employee_id", id).order("entry_date", { ascending: false }).returns<DailyScorecard[]>(),
    ]);
    scorecardRows = sc ?? [];
    dailyRows = dc ?? [];
  } else if (tab === "projects") {
    const { data: pa } = await supabase
      .from("project_assignments")
      .select("*, projects(id, name, status, clients(name))")
      .eq("employee_id", id)
      .returns<ProjectAssignmentRow[]>();
    projectAssignments = pa ?? [];
  } else if (tab === "portal") {
    const { data: sp2 } = await supabase.from("profiles").select("id, full_name, employee_id").eq("role", "staff").returns<StaffProfile[]>();
    staffProfiles = sp2 ?? [];
  }

  const pendingCommissionCents = commissionEntries.filter((e) => e.status !== "paid").reduce((sum, e) => sum + e.commission_amount_cents, 0);

  const { start: defaultMonthStart } = monthBounds(new Date());
  const existingForThisMonth = scorecardRows.find((s) => s.period_start === defaultMonthStart);
  const currentYear = new Date().getFullYear();
  const thisYearScores = scorecardRows.filter((s) => Number(s.period_start.slice(0, 4)) === currentYear);
  const yearlyScore =
    thisYearScores.length > 0 ? thisYearScores.reduce((sum, s) => sum + calculateMonthlyScore(s), 0) / thisYearScores.length : null;

  const defaultEntryDate = mostRecentWeekday(new Date());
  const existingForDefaultDate = dailyRows.find((d) => d.entry_date === defaultEntryDate);

  const linkedProfile = staffProfiles.find((p) => p.employee_id === id);
  const unlinkedStaffProfiles = staffProfiles.filter((p) => !p.employee_id);

  return (
    <div>
      <Link href="/employees" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft size={14} /> Back to employees
      </Link>

      <PageHeader
        title={employee.full_name}
        description={titleCase(employee.employment_type)}
        action={
          <div className="flex items-center gap-3">
            <Badge status={employee.status} />
            {tab === "edit" ? (
              <Link href={`/employees/${id}`}>
                <Button variant="secondary">Cancel</Button>
              </Link>
            ) : (
              <Link href={`/employees/${id}?tab=edit`}>
                <Button variant="secondary">Edit profile</Button>
              </Link>
            )}
          </div>
        }
      />

      {tab !== "edit" && (
        <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/employees/${id}?tab=${t.key}`}
              className={clsx(
                "shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                tab === t.key ? "border-brand-red text-foreground" : "border-transparent text-muted hover:text-foreground"
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>
      )}

      {tab === "edit" && (
        <div className="max-w-xl">
          <Card className="p-5">
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
                    <Input name="salary_basis_hours" type="number" step="0.5" min="0" defaultValue={employee.salary_basis_hours} />
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
        </div>
      )}

      {tab === "overview" && (
        <div className="max-w-xl">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3">Overview</h2>
            <dl className="space-y-2 text-sm">
              <Row label="Employee ID" value={employee.employee_code ?? "—"} />
              <Row label="Email" value={employee.email ?? "—"} />
              <Row label="Phone" value={employee.phone ?? "—"} />
              <Row label="Start date" value={formatDate(employee.start_date)} />
              <Row label="Employment type" value={titleCase(employee.employment_type)} />
              <Row label="Pay structure" value={titleCase(employee.pay_type)} />
              <Row label="Base salary" value={formatINR(employee.base_salary_cents)} />
              <Row label="Commission rate" value={`${employee.commission_rate_percent}%`} />
              {employee.t_shirt_size && <Row label="T-shirt size" value={employee.t_shirt_size} />}
              {employee.is_founder && <Row label="Founder" value="Yes" />}
            </dl>
            {(employee.bank_account_holder || employee.bank_name || employee.bank_account_number || employee.bank_ifsc) && (
              <>
                <div className="mt-4 text-xs font-medium uppercase tracking-wide text-muted">Bank details</div>
                <dl className="mt-2 space-y-2 text-sm">
                  <Row label="Account holder" value={employee.bank_account_holder ?? "—"} />
                  <Row label="Bank name" value={employee.bank_name ?? "—"} />
                  <Row label="Account number" value={employee.bank_account_number ?? "—"} />
                  <Row label="IFSC" value={employee.bank_ifsc ?? "—"} />
                </dl>
              </>
            )}
            {employee.notes && <p className="mt-4 whitespace-pre-wrap border-t border-border pt-3 text-sm text-muted">{employee.notes}</p>}
          </Card>
        </div>
      )}

      {tab === "payroll" && (
        <div className="space-y-6">
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Commission entries</h2>
              <span className="text-xs text-muted">
                Unpaid: <span className="font-semibold text-brand-red">{formatINR(pendingCommissionCents)}</span>
              </span>
            </div>
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

            {commissionEntries.length > 0 ? (
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
                      <td className="py-2 font-medium text-foreground">{formatINR(entry.commission_amount_cents)}</td>
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
            {payrollRuns.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium uppercase text-muted">
                    <th className="py-2">Period</th>
                    <th className="py-2">Base</th>
                    <th className="py-2">Commission</th>
                    <th className="py-2">Total</th>
                    <th className="py-2">Status</th>
                    <th className="py-2" />
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
                      <td className="py-2 text-right">
                        <a href={`/api/payslip/${run.id}`} className="text-xs text-foreground hover:underline">
                          Download
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState message="No payroll runs processed yet." />
            )}
          </Card>
        </div>
      )}

      {tab === "projects" && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3">Projects</h2>
          {projectAssignments.length > 0 ? (
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
      )}

      {tab === "portal" && (
        <Card className="p-5 max-w-md">
          <h2 className="text-sm font-semibold text-foreground mb-3">Portal account</h2>
          {linkedProfile ? (
            <div className="space-y-3">
              <p className="text-sm text-foreground">
                Linked to <span className="font-medium">{linkedProfile.full_name}</span>&apos;s staff login — their
                dashboard shows this employee&apos;s score, projects, clients, and payslips.
              </p>
              <form action={unlinkEmployeeAccount.bind(null, employee.id, linkedProfile.id)}>
                <Button type="submit" variant="secondary" className="w-full">
                  Unlink
                </Button>
              </form>
            </div>
          ) : unlinkedStaffProfiles.length > 0 ? (
            <form action={linkEmployeeAccount.bind(null, employee.id)} className="space-y-3">
              <div>
                <Label>Link to a staff login</Label>
                <Select name="profile_id" defaultValue="" required>
                  <option value="" disabled>
                    — Select —
                  </option>
                  {unlinkedStaffProfiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </Select>
              </div>
              <Button type="submit" variant="secondary" className="w-full">
                Link account
              </Button>
            </form>
          ) : (
            <EmptyState message="No unlinked staff logins available." />
          )}
        </Card>
      )}

      {tab === "scorecard" && (
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
          <form action={saveDailyScorecard.bind(null, employee.id)} className="mb-5 space-y-3 rounded-lg border border-border p-4">
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
      )}
    </div>
  );
}
