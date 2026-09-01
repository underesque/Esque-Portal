import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Button, Input, Select, Textarea, Label } from "@/components/ui";
import { createTicket } from "@/lib/actions/tickets";
import type { Client, Employee } from "@/lib/types";

export default async function NewTicketPage() {
  await requireUser();
  const supabase = await createClient();

  const [{ data: clients }, { data: employees }] = await Promise.all([
    supabase.from("clients").select("id, name").order("name").returns<Pick<Client, "id" | "name">[]>(),
    supabase
      .from("employees")
      .select("id, full_name")
      .eq("status", "active")
      .order("full_name")
      .returns<Pick<Employee, "id" | "full_name">[]>(),
  ]);

  return (
    <div>
      <Link href="/tickets" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft size={14} /> Back to tickets
      </Link>

      <PageHeader title="New ticket" description="Log an internal issue or a client-facing issue." />

      <Card className="p-6 max-w-2xl">
        <form action={createTicket} className="space-y-4">
          <div>
            <Label>Type</Label>
            <Select name="type" required defaultValue="internal">
              <option value="internal">Internal</option>
              <option value="client">Client</option>
            </Select>
          </div>

          <div>
            <Label>Client (required for Client type)</Label>
            <Select name="client_id" defaultValue="">
              <option value="">— None —</option>
              {(clients ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label>About employee (optional, Internal type)</Label>
            <Select name="about_employee_id" defaultValue="">
              <option value="">— None —</option>
              {(employees ?? []).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label>Subject</Label>
            <Input name="subject" required />
          </div>

          <div>
            <Label>Description</Label>
            <Textarea name="description" rows={4} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>Priority</Label>
              <Select name="priority" defaultValue="medium">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </Select>
            </div>
            <div>
              <Label>Assignee</Label>
              <Select name="assignee_id" defaultValue="">
                <option value="">Unassigned</option>
                {(employees ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit">Create ticket</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
