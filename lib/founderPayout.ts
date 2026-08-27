// Founder Payout — Profit Sharing & Compensation Policy, encoded as pure
// functions + shared constants (same pattern as lib/scorecard.ts), used by
// lib/actions/payout.ts (the orchestration that reads invoices/clients and
// writes payout_runs/payout_shares) and by app/(portal)/founders/page.tsx
// (the read-only monthly view) so both always agree on the same numbers.
//
// Money convention: this module works entirely in INR cents (paise). The
// USD→INR conversion happens once, via convertToInrCents, at the boundary
// where an invoice's USD amount enters this system.

export const NORMAL_SPLIT = { sales: 0.1, operations: 0.5, partners: 0.32, esque: 0.08 } as const;
export const BONUS_SPLIT = { handler: 0.7, esque: 0.3 } as const;

// Policy §1 — standard salary amounts, in INR cents (paise).
export const SALARY_CAPS_INR_CENTS = { full_time: 7_500_000, half_time: 4_000_000 } as const;
export const DIRECTOR_HOURLY_RATE_INR_CENTS = 50_000;

export type FounderSalaryBasis = "full_time" | "half_time" | "hourly_director" | "custom";

export interface FounderSalaryConfig {
  salary_basis: FounderSalaryBasis;
  salary_basis_hours: number;
  salary_basis_custom_cents: number;
}

// A founder's flat monthly salary, deducted once from their total
// attributed revenue for the month (Policy §1) — not re-typed per client.
export function founderMonthlySalaryCents(config: FounderSalaryConfig): number {
  switch (config.salary_basis) {
    case "full_time":
      return SALARY_CAPS_INR_CENTS.full_time;
    case "half_time":
      return SALARY_CAPS_INR_CENTS.half_time;
    case "hourly_director":
      return Math.round(config.salary_basis_hours * DIRECTOR_HOURLY_RATE_INR_CENTS);
    case "custom":
      return config.salary_basis_custom_cents;
  }
}

export function convertToInrCents(amountUsdCents: number, conversionRate: number): number {
  return Math.round(amountUsdCents * conversionRate);
}

// Splits `total` (integer minor units) evenly across `n` recipients so the
// parts sum back to exactly `total` — the first `remainder` recipients get
// one extra unit rather than losing paise to rounding. Ported from the
// retired lib/actions/founders.ts, same behavior.
export function splitEven(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const remainder = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0));
}

// Splits `total` proportionally to `weights`, using the largest-remainder
// method so the parts still sum back to exactly `total`. Falls back to an
// even split if every weight is zero. Ported from the retired
// lib/actions/founders.ts, same behavior.
export function splitProportional(total: number, weights: number[]): number[] {
  const sumWeights = weights.reduce((a, b) => a + b, 0);
  if (sumWeights <= 0) return splitEven(total, weights.length);

  const raw = weights.map((w) => (w / sumWeights) * total);
  const floors = raw.map(Math.floor);
  const remainder = total - floors.reduce((a, b) => a + b, 0);

  const byFraction = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);

  const result = [...floors];
  for (let k = 0; k < remainder; k++) result[byFraction[k].i] += 1;
  return result;
}

export interface NormalSplitResult {
  sales: number;
  operations: number;
  partners: number;
  esque: number;
}

// Policy default — 10% sales / 50% operations / 32% partners / 8% ESQUE, on
// the full conversion (no per-invoice salary deduction; see
// founderMonthlySalaryCents for how salary is now handled). Uses the
// largest-remainder method so the four parts always sum to exactly
// conversionInrCents.
export function calculateNormalSplit(conversionInrCents: number): NormalSplitResult {
  const [sales, operations, partners, esque] = splitProportional(conversionInrCents, [
    NORMAL_SPLIT.sales,
    NORMAL_SPLIT.operations,
    NORMAL_SPLIT.partners,
    NORMAL_SPLIT.esque,
  ]);
  return { sales, operations, partners, esque };
}

export interface BonusSplitResult {
  handlerPoolCents: number;
  esqueCents: number;
}

// Policy §4 — bonuses split 70% to whoever handles the account / 30% held
// for ESQUE, never the 10/50/32/8 split.
export function calculateBonusSplit(conversionInrCents: number): BonusSplitResult {
  const handlerPoolCents = Math.round(conversionInrCents * BONUS_SPLIT.handler);
  return { handlerPoolCents, esqueCents: conversionInrCents - handlerPoolCents };
}

export interface FoundationAccountInput {
  clientId: string;
  ownerEmployeeId: string | null;
  totalInrCents: number;
}

export interface FoundationExcessResult {
  cappedClientId: string;
  cappedToInrCents: number;
  excessOwnerEmployeeId: string;
  excessInrCents: number;
}

// Policy §5 — Foundation Accounts. When exactly two Foundation clients have
// paid invoices in a month, both get calculated using whichever has the
// lower total; the higher one's excess transfers 100% to whichever founder
// owns that (currently higher) account, bypassing the split and ESQUE
// entirely. Returns null if the two totals are equal (no excess) or if the
// higher account has no owner to receive it.
export function computeFoundationExcess(
  a: FoundationAccountInput,
  b: FoundationAccountInput
): FoundationExcessResult | null {
  if (a.totalInrCents === b.totalInrCents) return null;

  const higher = a.totalInrCents > b.totalInrCents ? a : b;
  const lower = higher === a ? b : a;

  if (!higher.ownerEmployeeId) return null;

  return {
    cappedClientId: higher.clientId,
    cappedToInrCents: lower.totalInrCents,
    excessOwnerEmployeeId: higher.ownerEmployeeId,
    excessInrCents: higher.totalInrCents - lower.totalInrCents,
  };
}

export interface FixedBaseExcessResult {
  baseInrCents: number;
  excessInrCents: number;
  actualTotalInrCents: number;
}

// Per-client fixed monthly payout base — some clients (e.g. weekly-billed
// retainers) have their founder payout calculated off a fixed monthly USD
// figure rather than the real invoiced total. The fixed base is what feeds
// the normal 10/50/32/8 split; whatever was actually billed above that base
// goes 100% to the client's Sales owner, bypassing the split and ESQUE
// entirely. A separate, simpler mechanism than Foundation Account pairing —
// a client uses one or the other, not both.
export function computeFixedBaseExcess(
  actualUsdCents: number,
  baseUsdCents: number,
  avgConversionRate: number
): FixedBaseExcessResult {
  const baseInrCents = Math.round(baseUsdCents * avgConversionRate);
  const excessUsdCents = Math.max(0, actualUsdCents - baseUsdCents);
  const excessInrCents = Math.round(excessUsdCents * avgConversionRate);
  const actualTotalInrCents = Math.round(actualUsdCents * avgConversionRate);
  return { baseInrCents, excessInrCents, actualTotalInrCents };
}
