import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Button, Input, Select, Label, EmptyState } from "@/components/ui";
import { FounderPayoutCalculator } from "@/components/FounderPayoutCalculator";
import { formatUSD, formatINR, formatDate, titleCase } from "@/lib/format";
import { addFounderAssignment, removeFounderAssignment, runDistribution } from "@/lib/actions/founders";
import type { DistributionRun, DistributionShare, Employee, FounderAssignment } from "@/lib/types";

function monthBounds(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export default async function FoundersPage() {
  await requireAdmin();
  const supabase = await createClient();

  const { start: defaultStart, end: defaultEnd } = monthBounds(new Date());

  const [
    { data: employees },
    { data: assignments },
    { data: payments },
    { data: runs },
    { data: shares },
    { data: periodPaymentsByOwner },
  ] = await Promise.all([
    supabase.from("employees").select("*").eq("status", "active").order("full_name").returns<Employee[]>(),
    supabase
      .from("founder_assignments")
      .select("*, employees(full_name)")
      .eq("active", true)
      .order("role")
      .returns<(FounderAssignment & { employees: { full_name: string } | null })[]>(),
    supabase
      .from("payments")
      .select("amount_cents, payment_date")
      .gte("payment_date", new Date(new Date().setMonth(new Date().getMonth() - 11)).toISOString().slice(0, 10)),
    supabase
      .from("distribution_runs")
      .select("*")
      .order("period_start", { ascending: false })
      .returns<DistributionRun[]>(),
    supabase
      .from("distribution_shares")
      .select("*, employees(full_name)")
      .order("created_at", { ascending: false })
      .returns<(DistributionShare & { employees: { full_name: string } | null })[]>(),
    supabase
      .from("payments")
      .select("amount_cents, clients(name, sales_owner_id, employees(full_name))")
      .gte("payment_date", defaultStart)
      .lte("payment_date", defaultEnd),
  ]);

  const founderEmployeeIds = new Set((assignments ?? []).map((a) => a.employee_id));

  type OwnerRevenue = { ownerName: string; cents: number };
  const revenueByOwner = new Map<string, OwnerRevenue>();
  let unownedRevenueCents = 0;
  (periodPaymentsByOwner ?? []).forEach((p) => {
    const client = p.clients as unknown as {
      sales_owner_id: string | null;
      employees: { full_name: string } | null;
    } | null;
    if (client?.sales_owner_id) {
      const key = client.sales_owner_id;
      const existing = revenueByOwner.get(key);
      revenueByOwner.set(key, {
        ownerName: client.employees?.full_name ?? "Unknown",
        cents: (existing?.cents ?? 0) + p.amount_cents,
      });
    } else {
      unownedRevenueCents += p.amount_cents;
    }
  });

  const { data: payrollRunsThisMonth } = await supabase
    .from("payroll_runs")
    .select("employee_id, total_amount_cents")
    .gte("period_start", defaultStart)
    .lte("period_start", defaultEnd);

  const suggestedSalariesCents = (payrollRunsThisMonth ?? [])
    .filter((r) => !founderEmployeeIds.has(r.employee_id))
    .reduce((sum, r) => sum + r.total_amount_cents, 0);

  const monthlyTotals = new Map<string, number>();
  (payments ?? []).forEach((p) => {
    const key = p.payment_date.slice(0, 7);
    monthlyTotals.set(key, (monthlyTotals.get(key) ?? 0) + p.amount_cents);
  });
  const monthlyRows = Array.from(monthlyTotals.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, 12);

  const sharesByRun = new Map<string, (DistributionShare & { employees: { full_name: string } | null })[]>();
  (shares ?? []).forEach((s) => {
    const list = sharesByRun.get(s.run_id) ?? [];
    list.push(s);
    sharesByRun.set(s.run_id, list);
  });

  return (
    <div>
      <PageHeader
        title="Founder Payouts"
        description="Monthly profit split — 10% sales (by whose clients paid), 50% operations, 32% partners, 8% retained."
      />

      <div className="space-y-8">
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">Payout calculator</h2>
          <FounderPayoutCalculator />
        </div>

        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">
            Revenue by sales owner — {new Date(defaultStart).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </h2>
          <Card>
            {revenueByOwner.size > 0 || unownedRevenueCents > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium uppercase text-muted">
                    <th className="px-5 py-3">Sales owner</th>
                    <th className="px-5 py-3">Collected (USD)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {Array.from(revenueByOwner.values())
                    .sort((a, b) => b.cents - a.cents)
                    .map((o) => (
                      <tr key={o.ownerName}>
                        <td className="px-5 py-3 font-medium text-foreground">{o.ownerName}</td>
                        <td className="px-5 py-3">{formatUSD(o.cents)}</td>
                      </tr>
                    ))}
                  {unownedRevenueCents > 0 && (
                    <tr>
                      <td className="px-5 py-3 text-muted">Unassigned clients</td>
                      <td className="px-5 py-3 text-muted">{formatUSD(unownedRevenueCents)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <EmptyState message="No payments recorded this month yet." />
            )}
          </Card>
          <p className="mt-2 text-xs text-muted">
            This drives the sales pool split when you run the distribution below — each sales
            founder gets a share of the 10% pool proportional to their own clients&apos; collected
            revenue for the period. Unassigned clients&apos; revenue is split evenly across sales
            founders. Set a client&apos;s sales owner from its detail page.
          </p>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">Month-over-month client invoices</h2>
          <Card>
            {monthlyRows.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium uppercase text-muted">
                    <th className="px-5 py-3">Month</th>
                    <th className="px-5 py-3">Collected (USD)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {monthlyRows.map(([month, cents]) => (
                    <tr key={month}>
                      <td className="px-5 py-3 font-medium text-foreground">
                        {new Date(`${month}-01`).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "long",
                        })}
                      </td>
                      <td className="px-5 py-3">{formatUSD(cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState message="No client payments recorded yet." />
            )}
          </Card>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">Role assignments</h2>
          <Card className="p-5">
            <form action={addFounderAssignment} className="mb-4 flex items-end gap-3">
              <div className="flex-1">
                <Label>Employee</Label>
                <Select name="employee_id" required>
                  {(employees ?? []).map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.full_name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex-1">
                <Label>Role</Label>
                <Select name="role" required>
                  <option value="sales">Sales (10% pool, split by client revenue)</option>
                  <option value="operations">Operations (50% pool)</option>
                  <option value="partner">Partner (32% pool, split evenly)</option>
                </Select>
              </div>
              <Button type="submit" variant="secondary">
                Assign
              </Button>
            </form>

            {assignments && assignments.length > 0 ? (
              <ul className="divide-y divide-border">
                {assignments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                    <span>
                      <span className="font-medium text-foreground">{a.employees?.full_name}</span>{" "}
                      <span className="text-muted">— {titleCase(a.role)}</span>
                    </span>
                    <form action={removeFounderAssignment.bind(null, a.id)}>
                      <button type="submit" className="text-xs text-brand-red hover:underline">
                        Remove
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState message="No roles assigned yet. Assign sales, operations, and partner roles above." />
            )}
          </Card>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">Run monthly distribution</h2>
          <Card className="p-5">
            <form action={runDistribution} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Period start</Label>
                  <Input name="period_start" type="date" required defaultValue={defaultStart} />
                </div>
                <div>
                  <Label>Period end</Label>
                  <Input name="period_end" type="date" required defaultValue={defaultEnd} />
                </div>
              </div>

              <div className="rounded-lg border border-border p-4">
                <p className="text-xs text-muted mb-3">
                  Enter revenue directly in INR, or a USD amount with the exchange rate to convert.
                </p>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Revenue collected (INR)</Label>
                    <Input name="revenue_inr" type="number" step="0.01" min="0" placeholder="Leave blank if using USD" />
                  </div>
                  <div>
                    <Label>...or USD amount</Label>
                    <Input name="revenue_usd" type="number" step="0.01" min="0" />
                  </div>
                  <div>
                    <Label>Exchange rate (USD→INR)</Label>
                    <Input name="exchange_rate" type="number" step="0.0001" min="0" placeholder="e.g. 83.25" />
                  </div>
                </div>
              </div>

              <div>
                <Label>Total salaries paid this period (INR)</Label>
                <Input
                  name="total_salaries_inr"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={(suggestedSalariesCents / 100).toFixed(2)}
                />
                <p className="mt-1 text-xs text-muted">
                  Pre-filled from processed payroll runs this month for non-founder employees. Adjust if needed.
                </p>
              </div>

              <div>
                <Label>Notes</Label>
                <Input name="notes" placeholder="Optional" />
              </div>

              <Button type="submit">Calculate & save distribution</Button>
            </form>
          </Card>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">Distribution history</h2>
          {runs && runs.length > 0 ? (
            <div className="space-y-4">
              {runs.map((run) => {
                const runShares = sharesByRun.get(run.id) ?? [];
                return (
                  <Card key={run.id} className="p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium text-foreground">
                          {formatDate(run.period_start)} – {formatDate(run.period_end)}
                        </div>
                        <div className="text-xs text-muted mt-0.5">
                          Revenue {formatINR(run.revenue_inr_cents)} · Salaries {formatINR(run.total_salaries_inr_cents)}
                          {run.exchange_rate ? ` · FX ${run.exchange_rate}` : ""}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted">Distributable</div>
                        <div className="font-semibold text-foreground">{formatINR(run.distributable_inr_cents)}</div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {runShares.map((share) => (
                        <div
                          key={share.id}
                          className="flex items-center justify-between rounded-lg bg-black/[0.03] px-3 py-2 text-sm"
                        >
                          <span>
                            <span className="font-medium text-foreground">{share.employees?.full_name}</span>{" "}
                            <span className="text-muted">
                              ({titleCase(share.role)}, {share.percent_of_pool}%)
                            </span>
                          </span>
                          <span className="font-medium text-foreground">{formatINR(share.amount_inr_cents)}</span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between rounded-lg bg-black/[0.03] px-3 py-2 text-sm">
                        <span className="text-muted">Retained by ESQUE</span>
                        <span className="font-medium text-foreground">
                          {formatINR(run.company_retained_inr_cents)}
                        </span>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <EmptyState message="No distributions run yet." />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
