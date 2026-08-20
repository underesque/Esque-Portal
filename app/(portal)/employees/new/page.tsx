import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { PageHeader, Card, Button, Input, Select, Textarea, Label } from "@/components/ui";
import { createEmployee } from "@/lib/actions/employees";

export default async function NewEmployeePage() {
  await requireAdmin();

  return (
    <div>
      <Link
        href="/employees"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft size={14} /> Back to employees
      </Link>
      <PageHeader title="Add employee" />

      <Card className="p-6 max-w-2xl">
        <form action={createEmployee} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Full name</Label>
              <Input name="full_name" required />
            </div>
            <div>
              <Label>Email</Label>
              <Input name="email" type="email" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Phone</Label>
              <Input name="phone" />
            </div>
            <div>
              <Label>Start date</Label>
              <Input
                name="start_date"
                type="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Employment type</Label>
              <Select name="employment_type" defaultValue="full_time">
                <option value="full_time">Full-time</option>
                <option value="part_time">Part-time</option>
                <option value="contractor">Contractor</option>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select name="status" defaultValue="active">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </div>
          </div>

          <div className="rounded-lg border border-border p-4">
            <Label>Pay structure</Label>
            <Select name="pay_type" defaultValue="fixed">
              <option value="fixed">Fixed salary</option>
              <option value="commission">Commission only</option>
              <option value="hybrid">Fixed + commission</option>
            </Select>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <div>
                <Label>Base salary (INR / year)</Label>
                <Input name="base_salary" type="number" step="0.01" min="0" defaultValue="0" />
              </div>
              <div>
                <Label>Commission rate (%)</Label>
                <Input name="commission_rate_percent" type="number" step="0.01" min="0" max="100" defaultValue="0" />
              </div>
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea name="notes" rows={3} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Link href="/employees">
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </Link>
            <Button type="submit">Save employee</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
