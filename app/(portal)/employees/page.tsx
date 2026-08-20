import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { PageHeader, Card, Badge, EmptyState, Button, StatCard } from "@/components/ui";
import { formatINR, formatDate, titleCase } from "@/lib/format";
import type { Employee } from "@/lib/types";

export default async function EmployeesPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: employees } = await supabase
    .from("employees")
    .select("*")
    .order("full_name")
    .returns<Employee[]>();

  const active = (employees ?? []).filter((e) => e.status === "active").length;
  const inactive = (employees ?? []).length - active;

  return (
    <div>
      <PageHeader
        title="Employees"
        description="Headcount, roles, and compensation structure."
        action={
          <Link href="/employees/new">
            <Button>Add employee</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-6">
        <StatCard label="Total employees" value={String((employees ?? []).length)} />
        <StatCard label="Active" value={String(active)} />
        <StatCard label="Inactive" value={String(inactive)} />
      </div>

      <Card>
        {employees && employees.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase text-muted">
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Pay structure</th>
                <th className="px-5 py-3">Start date</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {employees.map((employee) => (
                <tr key={employee.id} className="hover:bg-black/[0.02]">
                  <td className="px-5 py-3">
                    <Link
                      href={`/employees/${employee.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {employee.full_name}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-muted">{titleCase(employee.employment_type)}</td>
                  <td className="px-5 py-3 text-muted">
                    {employee.pay_type === "fixed" && formatINR(employee.base_salary_cents)}
                    {employee.pay_type === "commission" && `${employee.commission_rate_percent}% commission`}
                    {employee.pay_type === "hybrid" &&
                      `${formatINR(employee.base_salary_cents)} + ${employee.commission_rate_percent}%`}
                  </td>
                  <td className="px-5 py-3 text-muted">{formatDate(employee.start_date)}</td>
                  <td className="px-5 py-3">
                    <Badge status={employee.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState message="No employees yet. Add your first team member." />
        )}
      </Card>
    </div>
  );
}
