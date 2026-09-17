import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Badge, Button, Input, Select, Textarea, Label, EmptyState } from "@/components/ui";
import { formatINR, formatDate, titleCase } from "@/lib/format";
import { calculateMonthlyScore, incrementPercentForYearlyScore, monthBounds } from "@/lib/scorecard";
import { createTicket } from "@/lib/actions/tickets";
import type {
  ClientAssignment,
  Employee,
  Holiday,
  MonthlyScorecard,
  PayrollRun,
  ProjectAssignment,
  Ticket,
} from "@/lib/types";

export default async function MyDashboardPage() {
  const { profile } = await requireStaff();
  const supabase = await createClient();
  const employeeId = profile.employee_id;

  if (!employeeId) {
    return (
      <div>
        <PageHeader title={`Welcome, ${profile.full_name.split(" ")[0]}`} description="Your personal dashboard." />
        <Card className="p-5 mb-6">
          <EmptyState message="Your login isn't linked to an employee record yet — ask an admin to link it from your employee profile to see your score, projects, and payslips here." />
        </Card>
        <RaiseTicketCard aboutEmployeeId={null} />
      </div>
    );
  }

  const { start: currentMonthStart } = monthBounds(new Date());
  const currentYear = new Date().getFullYear();
  const todayStr = new Date().toISOString().slice(0, 10);

  const [
    { data: employee },
    { data: scorecards },
    { data: clientAssignments },
    { data: projectAssignments },
    { data: tickets },
    { data: payrollRuns },
    { data: holidays },
  ] = await Promise.all([
    supabase.from("employees").select("*").eq("id", employeeId).single<Employee>(),
    supabase
      .from("monthly_scorecards")
      .select("*")
      .eq("employee_id", employeeId)
      .order("period_start", { ascending: false })
      .returns<MonthlyScorecard[]>(),
    supabase
      .from("client_assignments")
      .select("*, clients(id, name)")
      .eq("employee_id", employeeId)
      .returns<(ClientAssignment & { clients: { id: string; name: string } | null })[]>(),
    supabase
      .from("project_assignments")
      .select("*, projects(id, name, status, clients(name))")
      .eq("employee_id", employeeId)
      .returns<(ProjectAssignment & { projects: { id: string; name: string; status: string; clients: { name: string } | null } | null })[]>(),
    supabase
      .from("tickets")
      .select("*")
      .eq("assignee_id", employeeId)
      .order("created_at", { ascending: false })
      .returns<Ticket[]>(),
    supabase
      .from("payroll_runs")
      .select("*")
      .eq("employee_id", employeeId)
      .order("period_start", { ascending: false })
      .returns<PayrollRun[]>(),
    supabase.from("holidays").select("*").gte("date", todayStr).order("date", { ascending: true }).limit(5).returns<Holiday[]>(),
  ]);

  const scorecardRows = scorecards ?? [];
  const thisMonth = scorecardRows.find((s) => s.period_start === currentMonthStart);
  const thisYearRows = scorecardRows.filter((s) => Number(s.period_start.slice(0, 4)) === currentYear);
  const yearlyScore =
    thisYearRows.length > 0 ? thisYearRows.reduce((sum, s) => sum + calculateMonthlyScore(s), 0) / thisYearRows.length : null;

  const openTickets = (tickets ?? []).filter((t) => t.status === "open" || t.status === "in_progress");

  return (
    <div>
      <PageHeader
        title={`Welcome, ${employee?.full_name.split(" ")[0] ?? profile.full_name.split(" ")[0]}`}
        description="Your score, assignments, and account info."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card className="p-5">
          <div className="text-sm text-muted">This month&apos;s score</div>
          <div className="mt-2 text-3xl font-semibold text-foreground font-display">
            {thisMonth ? `${calculateMonthlyScore(thisMonth).toFixed(1)}%` : "—"}
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted">{currentYear} average</div>
          <div className="mt-2 text-3xl font-semibold text-foreground font-display">
            {yearlyScore !== null ? `${yearlyScore.toFixed(1)}%` : "—"}
          </div>
          {yearlyScore !== null && (
            <div className="mt-1 text-xs text-muted">{incrementPercentForYearlyScore(yearlyScore)}% increment tier</div>
          )}
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted">Start date</div>
          <div className="mt-2 text-lg font-semibold text-foreground font-display">
            {employee ? formatDate(employee.start_date) : "—"}
          </div>
          <div className="mt-1 text-xs text-muted">{employee ? titleCase(employee.employment_type) : ""}</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted">My open tickets</div>
          <div className="mt-2 text-3xl font-semibold text-foreground font-display">{openTickets.length}</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 mb-6">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3">My clients</h2>
          {clientAssignments && clientAssignments.length > 0 ? (
            <ul className="divide-y divide-border">
              {clientAssignments.map((a) => (
                <li key={a.id} className="py-2.5 text-sm">
                  {a.clients ? (
                    <Link href={`/clients/${a.clients.id}`} className="font-medium text-foreground hover:underline">
                      {a.clients.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                  {a.role && <span className="ml-2 text-xs text-muted">({a.role})</span>}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState message="Not assigned to any clients yet." />
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3">My projects</h2>
          {projectAssignments && projectAssignments.length > 0 ? (
            <ul className="divide-y divide-border">
              {projectAssignments.map((a) => (
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
                  </span>
                  {a.projects && <Badge status={a.projects.status} />}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState message="Not assigned to any projects yet." />
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 mb-6">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">Tickets assigned to me</h2>
            <Link href="/tickets" className="text-xs text-muted hover:text-foreground hover:underline">
              View all →
            </Link>
          </div>
          {tickets && tickets.length > 0 ? (
            <ul className="divide-y divide-border">
              {tickets.map((t) => (
                <li key={t.id} className="flex items-center justify-between py-2.5 text-sm">
                  <Link href={`/tickets/${t.id}`} className="font-medium text-foreground hover:underline">
                    {t.subject}
                  </Link>
                  <Badge status={t.status} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState message="No tickets assigned to you." />
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">Upcoming holidays</h2>
            <Link href="/holidays" className="text-xs text-muted hover:text-foreground hover:underline">
              View calendar →
            </Link>
          </div>
          {holidays && holidays.length > 0 ? (
            <ul className="divide-y divide-border">
              {holidays.map((h) => (
                <li key={h.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="font-medium text-foreground">{h.name}</span>
                  <span className="text-muted">{formatDate(h.date)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState message="No upcoming holidays listed." />
          )}
        </Card>
      </div>

      <div className="mb-6">
        <h2 className="text-sm font-semibold text-foreground mb-3">Salary slips</h2>
        <Card>
          {payrollRuns && payrollRuns.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase text-muted">
                  <th className="px-5 py-3">Period</th>
                  <th className="px-5 py-3">Total</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payrollRuns.map((run) => (
                  <tr key={run.id}>
                    <td className="px-5 py-3 text-muted">
                      {formatDate(run.period_start)} – {formatDate(run.period_end)}
                    </td>
                    <td className="px-5 py-3 font-medium text-foreground">{formatINR(run.total_amount_cents)}</td>
                    <td className="px-5 py-3">
                      <Badge status={run.status} />
                    </td>
                    <td className="px-5 py-3 text-right">
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

      <RaiseTicketCard aboutEmployeeId={employeeId} />
    </div>
  );
}

function RaiseTicketCard({ aboutEmployeeId }: { aboutEmployeeId: string | null }) {
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-foreground mb-3">Raise a ticket</h2>
      <form action={createTicket} className="space-y-3">
        <input type="hidden" name="type" value="internal" />
        {aboutEmployeeId && <input type="hidden" name="about_employee_id" value={aboutEmployeeId} />}
        <div>
          <Label>Subject</Label>
          <Input name="subject" required />
        </div>
        <div>
          <Label>Description</Label>
          <Textarea name="description" rows={3} />
        </div>
        <div>
          <Label>Priority</Label>
          <Select name="priority" defaultValue="medium">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </Select>
        </div>
        <Button type="submit" className="w-full">
          Submit ticket
        </Button>
      </form>
    </Card>
  );
}
