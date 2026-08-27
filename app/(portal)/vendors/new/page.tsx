import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { PageHeader, Card, Button, Input, Select, Textarea, Label } from "@/components/ui";
import { createVendor } from "@/lib/actions/vendors";

export default async function NewVendorPage() {
  await requireAdmin();

  return (
    <div>
      <Link
        href="/vendors"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft size={14} /> Back to vendors
      </Link>
      <PageHeader title="Add vendor" />

      <Card className="p-6 max-w-2xl">
        <form action={createVendor} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>Vendor name</Label>
              <Input name="name" required />
            </div>
            <div>
              <Label>Category</Label>
              <Input name="category" placeholder="Software, utilities, rent…" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Contact name</Label>
              <Input name="contact_name" />
            </div>
            <div>
              <Label>Contact email</Label>
              <Input name="contact_email" type="email" />
            </div>
            <div>
              <Label>Contact phone</Label>
              <Input name="contact_phone" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>Billing frequency</Label>
              <Select name="billing_frequency" defaultValue="monthly">
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="biannual">Biannual</option>
                <option value="annual">Annual</option>
                <option value="one_time">One-time</option>
              </Select>
            </div>
            <div>
              <Label>Amount (INR)</Label>
              <Input name="amount" type="number" step="0.01" min="0" required />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>Next due date</Label>
              <Input name="next_due_date" type="date" />
            </div>
            <div>
              <Label>Status</Label>
              <Select name="status" defaultValue="active">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea name="notes" rows={3} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Link href="/vendors">
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </Link>
            <Button type="submit">Save vendor</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
