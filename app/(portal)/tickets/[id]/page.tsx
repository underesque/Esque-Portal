import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AutoSubmitSelect } from "@/components/AutoSubmitSelect";
import { PageHeader, Card, Badge, Button, Textarea, Label, EmptyState } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import {
  updateTicketStatus,
  updateTicketPriority,
  updateTicketAssignee,
  addTicketComment,
  deleteTicket,
} from "@/lib/actions/tickets";
import type { Employee, Ticket, TicketComment } from "@/lib/types";

type TicketDetail = Ticket & {
  clients: { id: string; name: string } | null;
  about: { full_name: string } | null;
};

export default async function TicketDetailPage({ params }: PageProps<"/tickets/[id]">) {
  const { profile } = await requireUser();
  const { id } = await params;
  const isAdmin = profile.role === "admin";
  const supabase = await createClient();

  const [{ data: ticket }, { data: comments }, { data: employees }] = await Promise.all([
    supabase
      .from("tickets")
      .select("*, clients(id, name), about:employees!about_employee_id(full_name)")
      .eq("id", id)
      .single<TicketDetail>(),
    supabase
      .from("ticket_comments")
      .select("*")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true })
      .returns<TicketComment[]>(),
    supabase
      .from("employees")
      .select("id, full_name")
      .eq("status", "active")
      .order("full_name")
      .returns<Pick<Employee, "id" | "full_name">[]>(),
  ]);

  if (!ticket) notFound();

  const selectClass =
    "rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20";

  return (
    <div>
      <Link href="/tickets" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft size={14} /> Back to tickets
      </Link>

      <PageHeader
        title={ticket.subject}
        description={
          <span className="inline-flex items-center gap-2">
            <Badge status={ticket.type} />
            <Badge status={ticket.priority} />
            <Badge status={ticket.status} />
          </span>
        }
        action={
          isAdmin && (
            <form action={deleteTicket.bind(null, ticket.id)}>
              <button type="submit" className="text-xs text-brand-red hover:underline">
                Delete ticket
              </button>
            </form>
          )
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1 space-y-6">
          <Card className="p-5 space-y-4">
            <h2 className="text-sm font-semibold text-foreground">Details</h2>

            <div>
              <Label>Status</Label>
              <form
                action={async (formData: FormData) => {
                  "use server";
                  await updateTicketStatus(ticket.id, String(formData.get("status")));
                }}
              >
                <AutoSubmitSelect name="status" defaultValue={ticket.status} className={selectClass + " w-full"}>
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </AutoSubmitSelect>
              </form>
            </div>

            <div>
              <Label>Priority</Label>
              <form
                action={async (formData: FormData) => {
                  "use server";
                  await updateTicketPriority(ticket.id, String(formData.get("priority")));
                }}
              >
                <AutoSubmitSelect name="priority" defaultValue={ticket.priority} className={selectClass + " w-full"}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </AutoSubmitSelect>
              </form>
            </div>

            <div>
              <Label>Assignee</Label>
              <form
                action={async (formData: FormData) => {
                  "use server";
                  await updateTicketAssignee(ticket.id, String(formData.get("assignee_id")));
                }}
              >
                <AutoSubmitSelect name="assignee_id" defaultValue={ticket.assignee_id ?? ""} className={selectClass + " w-full"}>
                  <option value="">Unassigned</option>
                  {(employees ?? []).map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.full_name}
                    </option>
                  ))}
                </AutoSubmitSelect>
              </form>
            </div>

            {ticket.clients && (
              <div>
                <Label>Client</Label>
                <Link href={`/clients/${ticket.clients.id}`} className="text-sm text-foreground hover:underline">
                  {ticket.clients.name}
                </Link>
              </div>
            )}

            {ticket.about && (
              <div>
                <Label>About employee</Label>
                <p className="text-sm text-foreground">{ticket.about.full_name}</p>
              </div>
            )}

            <div>
              <Label>Description</Label>
              <p className="text-sm text-foreground whitespace-pre-wrap">{ticket.description || "—"}</p>
            </div>

            <div className="text-xs text-muted">Created {formatDateTime(ticket.created_at)}</div>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3">Comments</h2>

            {comments && comments.length > 0 ? (
              <ul className="mb-5 space-y-3">
                {comments.map((c) => (
                  <li key={c.id} className="rounded-lg border border-border p-3 text-sm">
                    <p className="text-foreground whitespace-pre-wrap">{c.body}</p>
                    <p className="mt-1 text-xs text-muted">{formatDateTime(c.created_at)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState message="No comments yet." />
            )}

            <form action={addTicketComment.bind(null, ticket.id)} className="space-y-3">
              <Textarea name="body" rows={3} placeholder="Add an update…" required />
              <div className="flex justify-end">
                <Button type="submit" variant="secondary">
                  Add comment
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
