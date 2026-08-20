import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Badge, Button, EmptyState } from "@/components/ui";
import { formatINR, formatDate, titleCase } from "@/lib/format";
import { markVendorPaid, deleteVendor } from "@/lib/actions/vendors";
import type { Vendor } from "@/lib/types";

function dueStatus(dueDate: string | null): "overdue" | "due-soon" | "ok" | null {
  if (!dueDate) return null;
  const days = (new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (days < 0) return "overdue";
  if (days <= 7) return "due-soon";
  return "ok";
}

export default async function VendorsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: vendors } = await supabase
    .from("vendors")
    .select("*")
    .order("next_due_date", { ascending: true, nullsFirst: false })
    .returns<Vendor[]>();

  return (
    <div>
      <PageHeader
        title="Vendors"
        description="Recurring and one-off vendor bills ESQUE pays."
        action={
          <Link href="/vendors/new">
            <Button>Add vendor</Button>
          </Link>
        }
      />

      <Card>
        {vendors && vendors.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase text-muted">
                <th className="px-5 py-3">Vendor</th>
                <th className="px-5 py-3">Billing</th>
                <th className="px-5 py-3">Amount</th>
                <th className="px-5 py-3">Next due</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {vendors.map((vendor) => {
                const due = dueStatus(vendor.next_due_date);
                return (
                  <tr key={vendor.id} className="hover:bg-black/[0.02]">
                    <td className="px-5 py-3">
                      <Link
                        href={`/vendors/${vendor.id}`}
                        className="font-medium text-foreground hover:underline"
                      >
                        {vendor.name}
                      </Link>
                      {vendor.category && <div className="text-xs text-muted">{vendor.category}</div>}
                    </td>
                    <td className="px-5 py-3 text-muted">{titleCase(vendor.billing_frequency)}</td>
                    <td className="px-5 py-3 text-muted">{formatINR(vendor.amount_cents)}</td>
                    <td className="px-5 py-3 text-muted">
                      {vendor.next_due_date ? (
                        <span className={due === "overdue" ? "text-brand-red font-medium" : undefined}>
                          {formatDate(vendor.next_due_date)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <Badge status={vendor.status} />
                      {due === "overdue" && <span className="ml-2 text-xs font-medium text-brand-red">Overdue</span>}
                      {due === "due-soon" && <span className="ml-2 text-xs font-medium text-amber-700">Due soon</span>}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-3">
                        {vendor.next_due_date && vendor.billing_frequency !== "one_time" && (
                          <form action={markVendorPaid.bind(null, vendor.id)}>
                            <button type="submit" className="text-xs font-medium text-foreground hover:underline">
                              Mark paid
                            </button>
                          </form>
                        )}
                        <form action={deleteVendor.bind(null, vendor.id)}>
                          <button type="submit" className="text-xs font-medium text-brand-red hover:underline">
                            Remove
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <EmptyState message="No vendors yet. Add your first vendor to start tracking bills." />
        )}
      </Card>
    </div>
  );
}
