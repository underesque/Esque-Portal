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
