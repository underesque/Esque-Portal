import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Button, Select, EmptyState } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { recomputeFounderPayoutForMonthAction } from "@/lib/actions/payout";
import type { Employee, PayoutRun, PayoutShare, PayoutShareCategory } from "@/lib/types";

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

function monthOptions(count = 12): { value: string; label: string }[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return { value: toDateStr(d), label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }) };
  });
}

const CATEGORY_LABELS: Record<PayoutShareCategory, string> = {
  sales: "Sales",
  ops: "Operations",
  partner: "Partners",
  salary: "Salary",
  bonus: "Bonus",
  foundation_excess: "Foundation excess",
  client_excess: "Client excess",
};

export default async function FoundersPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const options = monthOptions();
  const periodStart = params.month ?? options[0].value;
  const monthLabel =
    options.find((o) => o.value === periodStart)?.label ??
    new Date(periodStart).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const supabase = await createClient();

  const [{ data: founders }, { data: run }] = await Promise.all([
    supabase.from("employees").select("*").eq("is_founder", true).order("full_name").returns<Employee[]>(),
    supabase.from("payout_runs").select("*").eq("period_start", periodStart).maybeSingle<PayoutRun>(),
  ]);

  const { data: shares } = run
    ? await supabase
        .from("payout_shares")
        .select("*")
        .eq("run_id", run.id)
        .returns<PayoutShare[]>()
    : { data: [] as PayoutShare[] };

  const founderRows = (founders ?? []).map((founder) => {
    const founderShares = (shares ?? []).filter((s) => s.employee_id === founder.id);
    const byCategory = (Object.keys(CATEGORY_LABELS) as PayoutShareCategory[]).map((category) => ({
      category,
      cents: founderShares.filter((s) => s.category === category).reduce((sum, s) => sum + s.amount_inr_cents, 0),
    }));
    const totalCents = founderShares.reduce((sum, s) => sum + s.amount_inr_cents, 0);
    return { founder, byCategory, totalCents };
  });

  return (
    <div>
      <PageHeader
        title="Founder Payouts"
        description="Computed automatically from paid invoices — 10% sales, 50% operations, 32% partners, 8% retained."
        action={
          <form method="get" className="flex items-center gap-2">
            <Select name="month" defaultValue={periodStart} className="w-auto">
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <Button type="submit" variant="secondary">
              View
            </Button>
          </form>
        }
      />

      <div className="mb-6 flex items-center justify-between">
        <p className="text-xs text-muted">
          {run
            ? `Last computed ${new Date(run.computed_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`
            : "No invoices have been marked paid for this month yet."}
        </p>
        <form action={recomputeFounderPayoutForMonthAction.bind(null, periodStart)}>
          <button type="submit" className="text-xs font-medium text-brand-red hover:underline">
            Recompute this month
          </button>
        </form>
      </div>

      {run ? (
        <div className="space-y-8">
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-3">Monthly totals — {monthLabel}</h2>
            <Card className="p-5">
              <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
                <div className="flex justify-between sm:block">
                  <dt className="text-muted">Conversion</dt>
                  <dd className="tabular-nums font-medium sm:mt-0.5">{formatINR(run.conversion_total_inr_cents)}</dd>
                </div>
                <div className="flex justify-between sm:block">
                  <dt className="text-muted">ESQUE retained</dt>
                  <dd className="tabular-nums font-medium sm:mt-0.5">{formatINR(run.esque_total_inr_cents)}</dd>
                </div>
                <div className="flex justify-between sm:block">
                  <dt className="text-muted">Foundation excess</dt>
                  <dd className="tabular-nums font-medium sm:mt-0.5">{formatINR(run.foundation_excess_inr_cents)}</dd>
                </div>
              </dl>
            </Card>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-foreground mb-3">Founder payout summary — {monthLabel}</h2>
            {founderRows.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {founderRows.map(({ founder, byCategory, totalCents }) => (
                  <Card key={founder.id} className="p-5">
                    <div className="font-semibold text-foreground font-display">{founder.full_name}</div>
                    <dl className="mt-3 space-y-1.5 text-sm">
                      {byCategory.map(({ category, cents }) => (
                        <div key={category} className="flex justify-between">
                          <dt className="text-muted">{CATEGORY_LABELS[category]}</dt>
                          <dd className="tabular-nums">{formatINR(cents)}</dd>
                        </div>
                      ))}
                      <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
                        <dt className="text-foreground">Total payout</dt>
                        <dd className="tabular-nums text-foreground">{formatINR(totalCents)}</dd>
                      </div>
                    </dl>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <EmptyState message="No employees are marked as founders yet — set 'Is a founder' on an employee's page." />
              </Card>
            )}
          </div>
        </div>
      ) : (
        <Card>
          <EmptyState message="Nothing computed for this month yet — mark a client invoice as Paid to generate a payout." />
        </Card>
      )}
    </div>
  );
}
