// Client billing (invoices, payments) is USD. Employee pay (salary, commission,
// payroll runs) is INR. Both are stored as integer minor units (cents / paise).

export function formatUSD(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

export function formatINR(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

export function formatDate(date: string | null): string {
  if (!date) return "—";
  // Plain "YYYY-MM-DD" columns (due dates, holidays, scorecard periods) have
  // no time component — they're parsed as UTC midnight, so format them back
  // out in UTC too. Without this, a server running behind UTC renders every
  // such date one day earlier than what's actually stored.
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatDateTime(date: string): string {
  return new Date(date).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function titleCase(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
