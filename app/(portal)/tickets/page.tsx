import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Badge, Button, StatCard, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/format";
import type { Ticket } from "@/lib/types";

type TicketRow = Ticket & {
  clients: { name: string } | null;
  employees: { full_name: string } | null;
};

const STATUS_ORDER: Record<string, number> = { open: 0, in_progress: 1, resolved: 2, closed: 3 };

export default async function TicketsPage() {
  await requireUser();
  const supabase = await createClient();

  const { data: tickets } = await supabase
    .from("tickets")
    .select("*, clients(name), employees!assignee_id(full_name)")
    .order("created_at", { ascending: false })
    .returns<TicketRow[]>();

  const rows = (tickets ?? []).slice().sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);

  const open = rows.filter((t) => t.status === "open").length;
  const inProgress = rows.filter((t) => t.status === "in_progress").length;
  const urgentOpen = rows.filter((t) => t.priority === "urgent" && (t.status === "open" || t.status === "in_progress")).length;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const resolvedThisMonth = rows.filter(
    (t) => t.resolved_at && t.resolved_at.slice(0, 10) >= monthStart
  ).length;

  return (
    <div>
      <PageHeader
        title="Tickets"
        description="Internal and client-facing issues, tracked to resolution."
        action={
          <Link href="/tickets/new">
            <Button>New ticket</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard label="Open" value={String(open)} />
        <StatCard label="In progress" value={String(inProgress)} />
        <StatCard label="Urgent open" value={String(urgentOpen)} />
        <StatCard label="Resolved this month" value={String(resolvedThisMonth)} />
      </div>

      <Card>
        {rows.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase text-muted">
                <th className="px-5 py-3">Subject</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Priority</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Assignee</th>
                <th className="px-5 py-3">Client</th>
                <th className="px-5 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((t) => (
                <tr key={t.id} className="hover:bg-black/[0.02]">
                  <td className="px-5 py-3">
                    <Link href={`/tickets/${t.id}`} className="font-medium text-foreground hover:underline">
                      {t.subject}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-muted capitalize">{t.type}</td>
                  <td className="px-5 py-3">
                    <Badge status={t.priority} />
                  </td>
                  <td className="px-5 py-3">
                    <Badge status={t.status} />
                  </td>
                  <td className="px-5 py-3 text-muted">{t.employees?.full_name ?? "Unassigned"}</td>
                  <td className="px-5 py-3 text-muted">{t.clients?.name ?? "—"}</td>
                  <td className="px-5 py-3 text-muted">{formatDate(t.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState message="No tickets yet." />
        )}
      </Card>
    </div>
  );
}
