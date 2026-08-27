import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AutoSubmitSelect } from "@/components/AutoSubmitSelect";
import { PageHeader, Card, Badge, Button, Input, Select, Textarea, Label, EmptyState } from "@/components/ui";
import { formatUSD, formatDate, titleCase } from "@/lib/format";
import {
  addClientAssignment,
  addClientPayoutSplit,
  removeClientAssignment,
  removeClientPayoutSplit,
  updateClientPayoutSettings,
  updateClientRecord,
  updateClientSalesOwner,
} from "@/lib/actions/clients";
import { createInvoice, recordPayment, updateInvoiceStatus } from "@/lib/actions/billing";
import { createProject, updateProjectStatus } from "@/lib/actions/projects";
import type { Client, ClientAssignment, ClientPayoutSplit, Employee, Invoice, Payment, Project } from "@/lib/types";

export default async function ClientDetailPage({ params }: PageProps<"/clients/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: client },
    { data: invoices },
    { data: payments },
    { data: employees },
    { data: payoutSplits },
    { data: assignments },
    { data: projects },
  ] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).single<Client>(),
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
      .select("id, full_name, employment_type")
      .eq("status", "active")
      .order("full_name")
      .returns<Pick<Employee, "id" | "full_name" | "employment_type">[]>(),
    supabase
      .from("client_payout_splits")
      .select("*, employees(full_name), projects(name)")
      .eq("client_id", id)
      .returns<(ClientPayoutSplit & { employees: { full_name: string } | null; projects: { name: string } | null })[]>(),
    supabase
      .from("client_assignments")
      .select("*, employees(full_name, employment_type)")
      .eq("client_id", id)
      .returns<(ClientAssignment & { employees: { full_name: string; employment_type: string } | null })[]>(),
    supabase
      .from("projects")
      .select("*")
      .eq("client_id", id)
      .order("created_at", { ascending: false })
      .returns<Project[]>(),
  ]);

  if (!client) notFound();

  const assignedEmployeeIds = new Set((assignments ?? []).map((a) => a.employee_id));
  const unassignedEmployees = (employees ?? []).filter((e) => !assignedEmployeeIds.has(e.id));
  const employmentBreakdown = (assignments ?? []).reduce<Record<string, number>>((acc, a) => {
    const type = a.employees?.employment_type ?? "unknown";
    acc[type] = (acc[type] ?? 0) + 1;
    return acc;
  }, {});

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
            <h2 className="text-sm font-semibold text-foreground mb-3">Edit client</h2>
            <form action={updateClientRecord.bind(null, client.id)} className="space-y-3">
              <div>
                <Label>Client name</Label>
                <Input name="name" defaultValue={client.name} required />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label>Email</Label>
                  <Input name="email" type="email" defaultValue={client.email ?? ""} />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input name="phone" defaultValue={client.phone ?? ""} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label>Business name</Label>
                  <Input name="business_name" defaultValue={client.business_name ?? ""} />
                </div>
                <div>
                  <Label>Business website</Label>
                  <Input name="business_website" placeholder="https://" defaultValue={client.business_website ?? ""} />
                </div>
              </div>
              <div>
                <Label>Address</Label>
                <Input name="address" defaultValue={client.address ?? ""} />
              </div>
              <div>
                <Label>Status</Label>
                <Select name="status" defaultValue={client.status}>
                  <option value="active">Active</option>
                  <option value="prospect">Prospect</option>
                  <option value="inactive">Inactive</option>
                </Select>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea name="notes" rows={3} defaultValue={client.notes ?? ""} />
              </div>
              <Button type="submit" className="w-full">
                Save changes
              </Button>
            </form>

            <form
              action={updateClientSalesOwner.bind(null, client.id)}
              className="mt-4 border-t border-border pt-3"
            >
              <Label>Sales owner</Label>
              <AutoSubmitSelect
                name="sales_owner_id"
                defaultValue={client.sales_owner_id ?? ""}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
              >
                <option value="">Unassigned</option>
                {(employees ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name}
                  </option>
                ))}
              </AutoSubmitSelect>
              <p className="mt-1 text-xs text-muted">
                Used to split founder sales payouts by whose clients generated the revenue.
              </p>
            </form>

            <form
              action={updateClientPayoutSettings.bind(null, client.id)}
              className="mt-4 border-t border-border pt-3 space-y-3"
            >
              <div>
                <Label>Ops owner</Label>
                <select
                  name="ops_owner_id"
                  defaultValue={client.ops_owner_id ?? ""}
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
                >
                  <option value="">Unassigned</option>
                  {(employees ?? []).map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Default payout type for new invoices</Label>
                <select
                  name="default_payout_type"
                  defaultValue={client.default_payout_type}
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
                >
                  <option value="normal">Normal (10/50/32/8 split)</option>
                  <option value="hourly">Hourly / Contractor (100% retained)</option>
                  <option value="bonus">Bonus (70/30 split)</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" name="is_foundation_account" defaultChecked={client.is_foundation_account} />
                Foundation Account (Policy §5)
              </label>
              <div>
                <Label>Fixed monthly payout base (USD)</Label>
                <Input
                  name="fixed_payout_base_usd"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Leave blank to use the real invoiced total"
                  defaultValue={
                    client.fixed_payout_base_usd_cents !== null
                      ? (client.fixed_payout_base_usd_cents / 100).toFixed(2)
                      : ""
                  }
                />
                <p className="mt-1 text-xs text-muted">
                  When set, the founder payout split uses this fixed amount instead of the real invoiced
                  total for the month — whatever's actually billed above it goes 100% to the Sales owner.
                </p>
              </div>
              <Button type="submit" variant="secondary" className="w-full">
                Save payout settings
              </Button>
            </form>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-foreground mb-1">Team</h2>
            {Object.keys(employmentBreakdown).length > 0 && (
              <p className="text-xs text-muted mb-3">
                {Object.entries(employmentBreakdown)
                  .map(([type, count]) => `${count} ${titleCase(type)}`)
                  .join(" · ")}
              </p>
            )}
            {assignments && assignments.length > 0 ? (
              <ul className="mb-3 space-y-1.5">
                {assignments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between text-sm">
                    <span>
                      <span className="font-medium text-foreground">{a.employees?.full_name}</span>{" "}
                      <span className="text-muted">
                        ({a.employees?.employment_type ? titleCase(a.employees.employment_type) : "—"}
                        {a.role ? ` · ${a.role}` : ""})
                      </span>
                    </span>
                    <form action={removeClientAssignment.bind(null, client.id, a.id)}>
                      <button type="submit" className="text-xs text-brand-red hover:underline">
                        Remove
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-3 text-sm text-muted">No one assigned to this account yet.</p>
            )}
            {unassignedEmployees.length > 0 && (
              <form action={addClientAssignment.bind(null, client.id)} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Select name="employee_id" required>
                  {unassignedEmployees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.full_name}
                    </option>
                  ))}
                </Select>
                <Input name="role" placeholder="Role (optional)" />
                <Button type="submit" variant="secondary" className="col-span-2">
                  Assign to account
                </Button>
              </form>
            )}
          </Card>

          {(payoutSplits ?? []).length > 0 || (employees ?? []).length > 0 ? (
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-foreground mb-1">Custom payout splits</h2>
              <p className="text-xs text-muted mb-3">
                Only needed if this client&apos;s sales/ops credit isn&apos;t 100% to one owner above —
                e.g. split 50/50 between two founders. Scope a split to one project below for clients
                with multiple separately-billed seats (each project needs its own invoices tagged to it);
                leave the project blank for the client-wide default.
              </p>
              {payoutSplits && payoutSplits.length > 0 && (
                <ul className="mb-3 space-y-1.5">
                  {payoutSplits.map((s) => (
                    <li key={s.id} className="flex items-center justify-between text-sm">
                      <span>
                        <span className="uppercase text-xs text-muted">{s.split_type}</span>{" "}
                        <span className="font-medium text-foreground">{s.employees?.full_name}</span>{" "}
                        <span className="text-muted">{s.share_percent}%</span>{" "}
                        <span className="text-xs text-muted">
                          ({s.projects?.name ? `Project: ${s.projects.name}` : "client-wide default"})
                        </span>
                      </span>
                      <form action={removeClientPayoutSplit.bind(null, client.id, s.id)}>
                        <button type="submit" className="text-xs text-brand-red hover:underline">
                          Remove
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
              <form action={addClientPayoutSplit.bind(null, client.id)} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Select name="split_type" defaultValue="sales">
                  <option value="sales">Sales</option>
                  <option value="ops">Ops</option>
                </Select>
                <Select name="employee_id" required>
                  {(employees ?? []).map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.full_name}
                    </option>
                  ))}
                </Select>
                <Input name="share_percent" type="number" step="0.01" min="0" max="100" placeholder="%" required />
                {projects && projects.length > 0 && (
                  <Select name="project_id" defaultValue="" className="sm:col-span-2">
                    <option value="">Client-wide default (no project)</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                )}
                <Button type="submit" variant="secondary" className="sm:col-span-3">
                  Add split
                </Button>
              </form>
            </Card>
          ) : null}

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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label>Issued date</Label>
                  <Input name="issued_date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
                </div>
                <div>
                  <Label>Due date</Label>
                  <Input name="due_date" type="date" />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label>Conversion rate (USD→INR)</Label>
                  <Input name="conversion_rate" type="number" step="0.0001" min="0" placeholder="e.g. 83.25" />
                  <p className="mt-1 text-xs text-muted">Required before this invoice can be marked Paid.</p>
                </div>
                <div>
                  <Label>Payout type</Label>
                  <Select name="payout_type" defaultValue={client.default_payout_type}>
                    <option value="normal">Normal (10/50/32/8 split)</option>
                    <option value="hourly">Hourly / Contractor (100% retained)</option>
                    <option value="bonus">Bonus (70/30 split)</option>
                  </Select>
                </div>
              </div>
              {projects && projects.length > 0 && (
                <div>
                  <Label>Project / seat (optional)</Label>
                  <Select name="project_id" defaultValue="">
                    <option value="">Client-wide (no project)</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                  <p className="mt-1 text-xs text-muted">
                    Tag this invoice to a project if it belongs to one specific seat/engagement with its
                    own sales split.
                  </p>
                </div>
              )}
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
                    {projects && projects.length > 0 && <th className="py-2">Project</th>}
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
                      {projects && projects.length > 0 && (
                        <td className="py-2 text-muted">
                          {projects.find((p) => p.id === invoice.project_id)?.name ?? "—"}
                        </td>
                      )}
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
                          <AutoSubmitSelect
                            name="status"
                            defaultValue={invoice.status}
                            className="rounded-md border border-border bg-white px-2 py-1 text-xs"
                          >
                            <option value="draft">Draft</option>
                            <option value="sent">Sent</option>
                            <option value="paid">Paid</option>
                            <option value="overdue">Overdue</option>
                            <option value="void">Void</option>
                          </AutoSubmitSelect>
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

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3">Projects</h2>
            <form action={createProject.bind(null, client.id)} className="mb-5 space-y-3 rounded-lg border border-border p-4">
              <div>
                <Label>Name</Label>
                <Input name="name" required />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea name="description" rows={2} />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label>Status</Label>
                  <Select name="status" defaultValue="not_started">
                    <option value="not_started">Not started</option>
                    <option value="ongoing">Ongoing</option>
                    <option value="completed">Completed</option>
                    <option value="blocked_by_client">Blocked by client</option>
                  </Select>
                </div>
                <div>
                  <Label>Type</Label>
                  <Select name="project_type" defaultValue="one_time">
                    <option value="one_time">Special (one-time)</option>
                    <option value="monthly">Monthly (recurring)</option>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" variant="secondary">
                  Create project
                </Button>
              </div>
            </form>

            {(["monthly", "one_time"] as const).map((type) => {
              const rows = (projects ?? []).filter((p) => p.project_type === type);
              return (
                <div key={type} className="mb-5 last:mb-0">
                  <h3 className="text-xs font-semibold uppercase text-muted mb-2">
                    {type === "monthly" ? "Monthly projects" : "Special projects"}
                  </h3>
                  {rows.length > 0 ? (
                    <ul className="divide-y divide-border">
                      {rows.map((p) => (
                        <li key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                          <Link href={`/projects/${p.id}`} className="font-medium text-foreground hover:underline">
                            {p.name}
                          </Link>
                          <form
                            action={async (formData: FormData) => {
                              "use server";
                              await updateProjectStatus(p.id, String(formData.get("status")));
                            }}
                          >
                            <AutoSubmitSelect
                              name="status"
                              defaultValue={p.status}
                              className="rounded-md border border-border bg-white px-2 py-1 text-xs"
                            >
                              <option value="not_started">Not started</option>
                              <option value="ongoing">Ongoing</option>
                              <option value="completed">Completed</option>
                              <option value="blocked_by_client">Blocked by client</option>
                            </AutoSubmitSelect>
                          </form>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted">None yet.</p>
                  )}
                </div>
              );
            })}
          </Card>
        </div>
      </div>
    </div>
  );
}
