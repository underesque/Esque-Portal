import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import type { Project, ProjectType } from "@/lib/types";

type ProjectRow = Project & {
  clients: { name: string } | null;
  project_assignments: { employees: { full_name: string } | null }[];
};

function ProjectsTable({ rows }: { rows: ProjectRow[] }) {
  if (rows.length === 0) {
    return <EmptyState message="None yet." />;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-xs font-medium uppercase text-muted">
          <th className="px-5 py-3">Project</th>
          <th className="px-5 py-3">Client</th>
          <th className="px-5 py-3">Status</th>
          <th className="px-5 py-3">Team</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.map((p) => (
          <tr key={p.id}>
            <td className="px-5 py-3">
              <Link href={`/projects/${p.id}`} className="font-medium text-foreground hover:underline">
                {p.name}
              </Link>
            </td>
            <td className="px-5 py-3">
              <Link href={`/clients/${p.client_id}`} className="text-muted hover:text-foreground hover:underline">
                {p.clients?.name ?? "—"}
              </Link>
            </td>
            <td className="px-5 py-3">
              <Badge status={p.status} />
            </td>
            <td className="px-5 py-3 text-muted">
              {p.project_assignments.length > 0
                ? p.project_assignments.map((a) => a.employees?.full_name).filter(Boolean).join(", ")
                : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function ProjectsPage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data: projects } = await supabase
    .from("projects")
    .select("*, clients(name), project_assignments(employees(full_name))")
    .order("created_at", { ascending: false })
    .returns<ProjectRow[]>();

  const byType = (type: ProjectType) => (projects ?? []).filter((p) => p.project_type === type);

  return (
    <div>
      <PageHeader title="Projects" description="Every project across every client, company-wide." />

      <div className="space-y-8">
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">Monthly projects</h2>
          <Card>
            <ProjectsTable rows={byType("monthly")} />
          </Card>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">Special projects</h2>
          <Card>
            <ProjectsTable rows={byType("one_time")} />
          </Card>
        </div>
      </div>
    </div>
  );
}
