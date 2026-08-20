import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Phone, Globe, Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Badge, Button, Input, Select, Textarea, Label, EmptyState } from "@/components/ui";
import { formatUSD, formatDate, formatDateTime, titleCase } from "@/lib/format";
import { addCommunication, updateClientSalesOwner } from "@/lib/actions/clients";
import { createInvoice, recordPayment, updateInvoiceStatus } from "@/lib/actions/billing";
import type { Client, ClientCommunication, Employee, Invoice, Payment } from "@/lib/types";

export default async function ClientDetailPage({ params }: PageProps<"/clients/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: client }, { data: communications }, { data: invoices }, { data: payments }, { data: employees }] =
    await Promise.all([
      supabase.from("clients").select("*").eq("id", id).single<Client>(),
      supabase
        .from("client_communications")
        .select("*")
        .eq("client_id", id)
        .order("occurred_at", { ascending: false })
        .returns<ClientCommunication[]>(),
      supabase
        .from("invoices")
        .select("*")
        .eq("client_id", id)
        .order("issued_date", { ascending: false })
        .returns<Invoice[]>(),
      supabase
        .from("payments")
        .select("*")
        .eq("client_id", id)
        .order("payment_date", { ascending: false })
        .returns<Payment[]>(),
      supabase
        .from("employees")
        .select("id, full_name")
        .eq("status", "active")
        .order("full_name")
        .returns<Pick<Employee, "id" | "full_name">[]>(),
    ]);

  if (!client) notFound();

  const totalInvoicedCents = (invoices ?? []).reduce((sum, i) => sum + i.amount_cents, 0);
  const totalPaidCents = (payments ?? []).reduce((sum, p) => sum + p.amount_cents, 0);
  const outstandingCents = totalInvoicedCents - totalPaidCents;

  return (
    <div>
      <Link
        href="/clients"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft size={14} /> Back to clients
      </Link>

      <PageHeader
        title={client.name}
        description={client.business_name ?? undefined}
        action={<Badge status={client.status} />}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1 space-y-6">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3">Client details</h2>
            <dl className="space-y-2.5 text-sm">
              {client.email && (
                <div className="flex items-center gap-2 text-muted">
                  <Mail size={14} /> <span className="text-foreground">{client.email}</span>
                </div>
              )}
              {client.phone && (
                <div className="flex items-center gap-2 text-muted">
                  <Phone size={14} /> <span className="text-foreground">{client.phone}</span>
                </div>
              )}
              {client.business_website && (
                <div className="flex items-center gap-2 text-muted">
                  <Globe size={14} />
                  <a
                    href={client.business_website}
                    target="_blank"
                    rel="noreferrer"
                    className="text-foreground underline"
                  >
                    {client.business_website}
                  </a>
                </div>
              )}
              {client.business_name && (
                <div className="flex items-center gap-2 text-muted">
                  <Building2 size={14} /> <span className="text-foreground">{client.business_name}</span>
                </div>
              )}
              {client.address && (
                <div className="text-muted">
                  <span className="text-foreground">{client.address}</span>
                </div>
              )}
            </dl>
            {client.notes && (
              <p className="mt-4 border-t border-border pt-3 text-sm text-muted whitespace-pre-wrap">
                {client.notes}
              </p>
            )}

            <form
              action={updateClientSalesOwner.bind(null, client.id)}
              className="mt-4 border-t border-border pt-3"
            >
              <Label>Sales owner</Label>
              <select
                name="sales_owner_id"
                defaultValue={client.sales_owner_id ?? ""}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
                onChange={(e) => e.currentTarget.form?.requestSubmit()}
              >
                <option value="">Unassigned</option>
                {(employees ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted">
                Used to split founder sales payouts by whose clients generated the revenue.
              </p>
            </form>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3">Billing summary</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Total invoiced</dt>
                <dd className="font-medium text-foreground">{formatUSD(totalInvoicedCents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Total paid</dt>
                <dd className="font-medium text-foreground">{formatUSD(totalPaidCents)}</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-2">
                <dt className="text-muted">Outstanding</dt>
                <dd className="font-semibold text-brand-red">{formatUSD(Math.max(outstandingCents, 0))}</dd>
              </div>
            </dl>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3">Communication timeline</h2>
            <form action={addCommunication.bind(null, client.id)} className="mb-5 space-y-3 rounded-lg border border-border p-4">
              <div className="grid grid-cols-[120px_1fr] gap-3">
                <Select name="type" defaultValue="note">
                  <option value="note">Note</option>
                  <option value="email">Email</option>
                  <option value="call">Call</option>
                  <option value="meeting">Meeting</option>
                </Select>
                <Input name="subject" placeholder="Subject" required />
              </div>
              <Textarea name="body" placeholder="Details (optional)" rows={2} />
              <div className="flex justify-end">
                <Button type="submit" variant="secondary">
                  Log update
                </Button>
              </div>
            </form>

            {communications && communications.length > 0 ? (
              <ul className="space-y-4">
                {communications.map((c) => (
                  <li key={c.id} className="border-l-2 border-border pl-4">
                    <div className="flex items-center gap-2 text-xs text-muted">
                      <span className="uppercase font-semibold tracking-wide">{c.type}</span>
                      <span>{formatDateTime(c.occurred_at)}</span>
                    </div>
                    <div className="text-sm font-medium text-foreground">{c.subject}</div>
                    {c.body && <div className="text-sm text-muted whitespace-pre-wrap">{c.body}</div>}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState message="No communications logged yet." />
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3">Invoices</h2>
            <form action={createInvoice.bind(null, client.id)} className="mb-5 space-y-3 rounded-lg border border-border p-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Invoice #</Label>
                  <Input name="invoice_number" required />
                </div>
                <div>
                  <Label>Amount (USD)</Label>
                  <Input name="amount" type="number" step="0.01" min="0" required />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select name="status" defaultValue="draft">
                    <option value="draft">Draft</option>
                    <option value="sent">Sent</option>
                    <option value="paid">Paid</option>
                    <option value="overdue">Overdue</option>
                    <option value="void">Void</option>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Issued date</Label>
                  <Input name="issued_date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
                </div>
                <div>
                  <Label>Due date</Label>
                  <Input name="due_date" type="date" />
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" variant="secondary">
                  Add invoice
                </Button>
              </div>
            </form>

            {invoices && invoices.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium uppercase text-muted">
                    <th className="py-2">Invoice</th>
                    <th className="py-2">Amount</th>
                    <th className="py-2">Issued</th>
                    <th className="py-2">Due</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {invoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td className="py-2 font-medium text-foreground">{invoice.invoice_number}</td>
                      <td className="py-2">{formatUSD(invoice.amount_cents)}</td>
                      <td className="py-2 text-muted">{formatDate(invoice.issued_date)}</td>
                      <td className="py-2 text-muted">{formatDate(invoice.due_date)}</td>
                      <td className="py-2">
                        <form
                          action={async (formData: FormData) => {
                            "use server";
                            await updateInvoiceStatus(
                              client.id,
                              invoice.id,
                              String(formData.get("status"))
                            );
                          }}
                        >
                          <select
                            name="status"
                            defaultValue={invoice.status}
                            className="rounded-md border border-border bg-white px-2 py-1 text-xs"
                            onChange={(e) => e.currentTarget.form?.requestSubmit()}
                          >
                            <option value="draft">Draft</option>
                            <option value="sent">Sent</option>
                            <option value="paid">Paid</option>
                            <option value="overdue">Overdue</option>
                            <option value="void">Void</option>
                          </select>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState message="No invoices yet." />
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3">Payment history</h2>
            <form
              action={recordPayment.bind(null, client.id, null)}
              className="mb-5 space-y-3 rounded-lg border border-border p-4"
            >
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Amount (USD)</Label>
                  <Input name="amount" type="number" step="0.01" min="0" required />
                </div>
                <div>
                  <Label>Payment date</Label>
                  <Input name="payment_date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
                </div>
                <div>
                  <Label>Method</Label>
                  <Input name="method" placeholder="Bank transfer, card…" />
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" variant="secondary">
                  Record payment
                </Button>
              </div>
            </form>

            {payments && payments.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium uppercase text-muted">
                    <th className="py-2">Amount</th>
                    <th className="py-2">Date</th>
                    <th className="py-2">Method</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {payments.map((payment) => (
                    <tr key={payment.id}>
                      <td className="py-2 font-medium text-foreground">{formatUSD(payment.amount_cents)}</td>
                      <td className="py-2 text-muted">{formatDate(payment.payment_date)}</td>
                      <td className="py-2 text-muted">{payment.method ? titleCase(payment.method) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState message="No payments recorded yet." />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
