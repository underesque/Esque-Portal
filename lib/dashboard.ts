// Shared last-N-months bucketing for dashboard trend charts. Pure UTC month
// arithmetic, anchored off the current UTC month — matches lib/scorecard.ts's
// monthBounds in avoiding the local/UTC parsing mismatch that has bitten this
// app before (see formatDate's UTC-forcing comment in lib/format.ts).
export function lastNMonths(n: number): { key: string; label: string }[] {
  const now = new Date();
  const months: { key: string; label: string }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push({
      key: d.toISOString().slice(0, 7),
      label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }),
    });
  }
  return months;
}

// Buckets rows into the given months by summing `amount` for rows whose
// `dateValue` (a plain YYYY-MM-DD or YYYY-MM-DD-prefixed string) falls in
// that month. Rows outside the given range are ignored.
export function sumByMonth<T>(
  rows: T[],
  months: { key: string }[],
  dateValue: (row: T) => string,
  amount: (row: T) => number
): Map<string, number> {
  const totals = new Map(months.map((m) => [m.key, 0]));
  for (const row of rows) {
    const key = dateValue(row).slice(0, 7);
    if (totals.has(key)) {
      totals.set(key, totals.get(key)! + amount(row));
    }
  }
  return totals;
}

// --- Dashboard date-range filter -----------------------------------------
// Shared "7D / 30D / 3M / Quarter / YTD / All time" range picker used across
// every dashboard tab. A range resolves to a [startISO, endISO] window (both
// plain UTC dates), and buckets that window into daily/weekly/monthly points
// for trend charts, choosing a granularity that keeps the chart readable
// regardless of how wide the window is.

export type RangeKey = "7d" | "30d" | "3m" | "quarter" | "ytd" | "all";

export const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "7d", label: "7D" },
  { key: "30d", label: "30D" },
  { key: "3m", label: "3M" },
  { key: "quarter", label: "Quarter" },
  { key: "ytd", label: "YTD" },
  { key: "all", label: "All time" },
];

export const DEFAULT_RANGE: RangeKey = "30d";

export function isRangeKey(value: string | undefined): value is RangeKey {
  return !!value && RANGE_OPTIONS.some((o) => o.key === value);
}

// Floor for "All time" — predates any real data in this app (founded 2023),
// simpler than querying for the earliest row before resolving the range.
const EARLIEST_DATA_DATE = "2020-01-01";

export interface ResolvedRange {
  key: RangeKey;
  label: string;
  startISO: string;
  /** Inclusive end (today), for display. */
  endISO: string;
  /** Exclusive end (tomorrow), for .lt() queries against timestamptz columns. */
  endExclusiveISO: string;
}

export function resolveRange(key: RangeKey): ResolvedRange {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const endExclusive = new Date(end);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

  let start: Date;
  let label: string;
  switch (key) {
    case "7d":
      start = new Date(end);
      start.setUTCDate(start.getUTCDate() - 6);
      label = "Last 7 days";
      break;
    case "30d":
      start = new Date(end);
      start.setUTCDate(start.getUTCDate() - 29);
      label = "Last 30 days";
      break;
    case "3m":
      start = new Date(end);
      start.setUTCMonth(start.getUTCMonth() - 3);
      label = "Last 3 months";
      break;
    case "quarter": {
      const q = Math.floor(end.getUTCMonth() / 3);
      start = new Date(Date.UTC(end.getUTCFullYear(), q * 3, 1));
      label = "This quarter";
      break;
    }
    case "ytd":
      start = new Date(Date.UTC(end.getUTCFullYear(), 0, 1));
      label = "Year to date";
      break;
    case "all":
      start = new Date(`${EARLIEST_DATA_DATE}T00:00:00Z`);
      label = "All time";
      break;
  }

  return {
    key,
    label,
    startISO: start.toISOString().slice(0, 10),
    endISO: end.toISOString().slice(0, 10),
    endExclusiveISO: endExclusive.toISOString().slice(0, 10),
  };
}

export interface Bucket {
  key: string;
  label: string;
  /** Inclusive start, exclusive end — half-open, so buckets never overlap. */
  startISO: string;
  endISO: string;
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function dayLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// Buckets the range at a granularity chosen from its span, so a chart never
// ends up with 1 bar (range too short for the old fixed monthly bucketing)
// or 900 bars (range too long) — daily under ~2 weeks, weekly under ~4
// months, monthly beyond that.
export function bucketsForRange(range: Pick<ResolvedRange, "startISO" | "endISO">): Bucket[] {
  const start = new Date(`${range.startISO}T00:00:00Z`);
  const end = new Date(`${range.endISO}T00:00:00Z`);
  const spanDays = (end.getTime() - start.getTime()) / 86400000;

  const buckets: Bucket[] = [];

  if (spanDays <= 14) {
    for (let cur = start; cur <= end; cur = addDays(cur, 1)) {
      const next = addDays(cur, 1);
      buckets.push({ key: cur.toISOString().slice(0, 10), label: dayLabel(cur), startISO: cur.toISOString().slice(0, 10), endISO: next.toISOString().slice(0, 10) });
    }
  } else if (spanDays <= 120) {
    for (let cur = start; cur <= end; cur = addDays(cur, 7)) {
      const next = addDays(cur, 7);
      buckets.push({ key: cur.toISOString().slice(0, 10), label: dayLabel(cur), startISO: cur.toISOString().slice(0, 10), endISO: next.toISOString().slice(0, 10) });
    }
  } else {
    let cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    while (cur <= end) {
      const next = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
      buckets.push({
        key: cur.toISOString().slice(0, 7),
        label: cur.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }),
        startISO: cur.toISOString().slice(0, 10),
        endISO: next.toISOString().slice(0, 10),
      });
      cur = next;
    }
  }

  return buckets;
}

// Sums `amount` per bucket for rows whose `dateValue` (a plain date or
// timestamptz string) falls in that bucket's half-open [start, end) window.
// O(rows × buckets), fine at this app's data volumes (hundreds of rows,
// tens of buckets).
export function sumByBucket<T>(
  rows: T[],
  buckets: Bucket[],
  dateValue: (row: T) => string,
  amount: (row: T) => number
): Map<string, number> {
  const totals = new Map(buckets.map((b) => [b.key, 0]));
  for (const row of rows) {
    const d = dateValue(row).slice(0, 10);
    if (!d) continue;
    const bucket = buckets.find((b) => d >= b.startISO && d < b.endISO);
    if (bucket) totals.set(bucket.key, (totals.get(bucket.key) ?? 0) + amount(row));
  }
  return totals;
}
