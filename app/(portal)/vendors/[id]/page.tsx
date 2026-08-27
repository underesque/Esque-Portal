import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Button, Input, Select, Textarea, Label } from "@/components/ui";
import { updateVendor, deleteVendor } from "@/lib/actions/vendors";
import type { Vendor } from "@/lib/types";

export default async function VendorDetailPage({ params }: PageProps<"/vendors/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createClient();

  const { data: vendor } = await supabase.from("vendors").select("*").eq("id", id).single<Vendor>();
  if (!vendor) notFound();

  return (
    <div>
      <Link
        href="/vendors"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft size={14} /> Back to vendors
      </Link>
      <PageHeader title={vendor.name} description={vendor.category ?? undefined} />

      <Card className="p-6 max-w-2xl">
        <form action={updateVendor.bind(null, vendor.id)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>Vendor name</Label>
              <Input name="name" defaultValue={vendor.name} required />
            </div>
            <div>
              <Label>Category</Label>
              <Input name="category" defaultValue={vendor.category ?? ""} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Contact name</Label>
              <Input name="contact_name" defaultValue={vendor.contact_name ?? ""} />
            </div>
            <div>
              <Label>Contact email</Label>
              <Input name="contact_email" type="email" defaultValue={vendor.contact_email ?? ""} />
            </div>
            <div>
              <Label>Contact phone</Label>
              <Input name="contact_phone" defaultValue={vendor.contact_phone ?? ""} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>Billing frequency</Label>
              <Select name="billing_frequency" defaultValue={vendor.billing_frequency}>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="biannual">Biannual</option>
                <option value="annual">Annual</option>
                <option value="one_time">One-time</option>
              </Select>
            </div>
            <div>
              <Label>Amount (INR)</Label>
              <Input
                name="amount"
                type="number"
                step="0.01"
                min="0"
                defaultValue={(vendor.amount_cents / 100).toFixed(2)}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>Next due date</Label>
              <Input name="next_due_date" type="date" defaultValue={vendor.next_due_date ?? ""} />
            </div>
            <div>
              <Label>Status</Label>
              <Select name="status" defaultValue={vendor.status}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea name="notes" rows={3} defaultValue={vendor.notes ?? ""} />
          </div>
          <div className="flex justify-end pt-2">
            <Button type="submit">Save changes</Button>
          </div>
        </form>

        <form action={deleteVendor.bind(null, vendor.id)} className="mt-4 border-t border-border pt-4">
          <Button type="submit" variant="ghost" className="text-brand-red">
            Remove vendor
          </Button>
        </form>
      </Card>
    </div>
  );
}
