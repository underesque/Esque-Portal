import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AutoSubmitSelect } from "@/components/AutoSubmitSelect";
import { PageHeader, Card, Badge, Button, Input, Select, Textarea, Label, EmptyState } from "@/components/ui";
import { formatINR, titleCase } from "@/lib/format";
import { updateProjectStatus, updateProjectDetails, addProjectAssignment, removeProjectAssignment } from "@/lib/actions/projects";
import type { Employee, Project, ProjectAssignment } from "@/lib/types";

type AssignmentRow = ProjectAssignment & { employees: Pick<Employee, "full_name" | "employment_type"> | null };

function contractAmountCents(a: ProjectAssignment): number | null {
  if (a.billing_type === "hourly" && a.hourly_rate_cents && a.hours) {
    return Math.round(a.hourly_rate_cents * a.hours);
  }
  if (a.billing_type === "fixed_contract") {
    return a.fixed_contract_amount_cents;
  }
  return null;
}

export default async function ProjectDetailPage({ params }: PageProps<"/projects/[id]">) {
  const { profile } = await requireUser();
  const { id } = await params;
  const supabase = await createClient();
  const isAdmin = profile.role === "admin";

  const [{ data: project }, { data: assignments }, { data: employees }] = await Promise.all([
    supabase.from("projects").select("*, clients(id, name)").eq("id", id).single<Project & { clients: { id: string; name: string } | null }>(),
    supabase
      .from("project_assignments")
      .select("*, employees(full_name, employment_type)")
      .eq("project_id", id)
      .returns<AssignmentRow[]>(),
    supabase
      .from("employees")
      .select("id, full_name, employment_type")
      .eq("status", "active")
      .order("full_name")
      .returns<Pick<Employee, "id" | "full_name" | "employment_type">[]>(),
  ]);

  if (!project) notFound();

  const assignedIds = new Set((assignments ?? []).map((a) => a.employee_id));
  const availableEmployees = (employees ?? []).filter((e) => !assignedIds.has(e.id));

  return (
    <div>
      <Link href="/projects" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft size={14} /> Back to projects
      </Link>

      <PageHeader
        title={project.name}
        description={
          project.clients ? (
            <>
              <Link href={`/clients/${project.clients.id}`} className="hover:underline">
                {project.clients.name}
              </Link>
              <span className="text-muted"> · {project.project_type === "monthly" ? "Monthly" : "Special (one-time)"}</span>
            </>
          ) : undefined
        }
        action={
          <form
            action={async (formData: FormData) => {
              "use server";
              await updateProjectStatus(project.id, String(formData.get("status")));
            }}
          >
            <AutoSubmitSelect
              name="status"
              defaultValue={project.status}
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
            >
              <option value="not_started">Not started</option>
              <option value="ongoing">Ongoing</option>
              <option value="completed">Completed</option>
              <option value="blocked_by_client">Blocked by client</option>
            </AutoSubmitSelect>
          </form>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3">Details</h2>
            <form action={updateProjectDetails.bind(null, project.id, project.client_id)} className="space-y-3">
              <div>
                <Label>Name</Label>
                <Input name="name" defaultValue={project.name} required />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea name="description" rows={4} defaultValue={project.description ?? ""} />
              </div>
              <div>
                <Label>Type</Label>
                <Select name="project_type" defaultValue={project.project_type}>
                  <option value="one_time">Special (one-time)</option>
                  <option value="monthly">Monthly (recurring)</option>
                </Select>
              </div>
              <Button type="submit" variant="secondary" className="w-full">
                Save
              </Button>
            </form>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3">Assigned team</h2>
            {assignments && assignments.length > 0 ? (
              <ul className="mb-4 divide-y divide-border">
                {assignments.map((a) => {
                  const amount = contractAmountCents(a);
                  return (
                    <li key={a.id} className="flex items-center justify-between py-2.5 text-sm">
                      <span>
                        <span className="font-medium text-foreground">{a.employees?.full_name ?? "—"}</span>{" "}
                        <span className="text-muted">
                          ({a.employees?.employment_type ? titleCase(a.employees.employment_type) : "—"})
                        </span>
                        {amount !== null && (
                          <span className="ml-2 text-xs text-muted">
                            {a.billing_type === "hourly"
                              ? `${formatINR(a.hourly_rate_cents ?? 0)}/hr × ${a.hours}h = ${formatINR(amount)}`
                              : `Fixed: ${formatINR(amount)}`}
                          </span>
                        )}
                      </span>
                      {isAdmin && (
                        <form action={removeProjectAssignment.bind(null, project.id, a.id)}>
                          <button type="submit" className="text-xs text-brand-red hover:underline">
                            Remove
                          </button>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState message="No one is assigned to this project yet." />
            )}

            {isAdmin && availableEmployees.length > 0 && (
              <form
                action={addProjectAssignment.bind(null, project.id)}
                className="space-y-3 rounded-lg border border-border p-4"
              >
                <div>
                  <Label>Employee</Label>
                  <Select name="employee_id" required>
                    {availableEmployees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.full_name} ({titleCase(e.employment_type)})
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Billing type (contractual employees only)</Label>
                  <Select name="billing_type" defaultValue="">
                    <option value="">Not applicable — staffing only</option>
                    <option value="hourly">Hourly</option>
                    <option value="fixed_contract">Fixed contract amount</option>
                  </Select>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Hourly rate (INR)</Label>
                    <Input name="hourly_rate" type="number" step="0.01" min="0" placeholder="If billing type is Hourly" />
                  </div>
                  <div>
                    <Label>Hours</Label>
                    <Input name="hours" type="number" step="0.5" min="0" placeholder="If billing type is Hourly" />
                  </div>
                </div>
                <div>
                  <Label>Fixed contract amount (INR)</Label>
                  <Input
                    name="fixed_contract_amount"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="If billing type is Fixed contract"
                  />
                </div>
                <Button type="submit" variant="secondary" className="w-full">
                  Assign to project
                </Button>
              </form>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
