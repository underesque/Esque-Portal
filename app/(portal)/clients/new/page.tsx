import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader, Card, Button, Input, Select, Textarea, Label } from "@/components/ui";
import { createClientRecord } from "@/lib/actions/clients";
import { createClient } from "@/lib/supabase/server";
import type { Employee } from "@/lib/types";

export default async function NewClientPage() {
  const supabase = await createClient();
  const { data: employees } = await supabase
    .from("employees")
    .select("id, full_name")
    .eq("status", "active")
    .order("full_name")
    .returns<Pick<Employee, "id" | "full_name">[]>();

  return (
    <div>
      <Link
        href="/clients"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft size={14} /> Back to clients
      </Link>
      <PageHeader title="Add client" />

      <Card className="p-6 max-w-2xl">
        <form action={createClientRecord} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>Client name</Label>
              <Input name="name" required />
            </div>
            <div>
              <Label>Email</Label>
              <Input name="email" type="email" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>Business name</Label>
              <Input name="business_name" />
            </div>
            <div>
              <Label>Business website</Label>
              <Input name="business_website" placeholder="https://" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>Phone</Label>
              <Input name="phone" />
            </div>
            <div>
              <Label>Status</Label>
              <Select name="status" defaultValue="active">
                <option value="active">Active</option>
                <option value="prospect">Prospect</option>
                <option value="inactive">Inactive</option>
              </Select>
            </div>
          </div>
          <div>
            <Label>Sales owner</Label>
            <Select name="sales_owner_id" defaultValue="">
              <option value="">Unassigned</option>
              {(employees ?? []).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-muted">
              Whoever brought in this client — used to split founder sales payouts by whose clients
              generated the revenue.
            </p>
          </div>
          <div>
            <Label>Address</Label>
            <Input name="address" />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea name="notes" rows={3} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Link href="/clients">
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </Link>
            <Button type="submit">Save client</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
