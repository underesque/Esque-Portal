// Performance Scorecard & Growth Policy — fixed category weights and yearly
// increment tiers, shared by the admin-entry UI and the employee's own view
// so both always agree on the same numbers.

export const SCORECARD_CATEGORIES = [
  { key: "attendance_score", label: "Attendance", weight: 0.1 },
  { key: "punctuality_score", label: "Punctuality", weight: 0.1 },
  { key: "work_performance_score", label: "Work Performance", weight: 0.5 },
  { key: "manager_feedback_score", label: "Manager Feedback", weight: 0.1 },
  { key: "responsiveness_score", label: "Responsiveness", weight: 0.2 },
] as const;

export type ScorecardCategoryKey = (typeof SCORECARD_CATEGORIES)[number]["key"];

export interface ScorecardInput {
  attendance_score: number;
  punctuality_score: number;
  work_performance_score: number;
  manager_feedback_score: number;
  responsiveness_score: number;
}

// Every month starts at 100%; each category score (0-100, how well they did
// in that area) is weighted and summed. A perfect month across every
// category is exactly 100.
export function calculateMonthlyScore(input: ScorecardInput): number {
  return SCORECARD_CATEGORIES.reduce((sum, c) => sum + input[c.key] * c.weight, 0);
}

// Yearly Growth & Increment Policy — salary increment tier from the yearly
// average score. Highest matching floor wins; below 70 isn't specified in
// the policy, so it earns no increment.
const INCREMENT_TIERS: { floor: number; percent: number }[] = [
  { floor: 100, percent: 25 },
  { floor: 95, percent: 20 },
  { floor: 90, percent: 15 },
  { floor: 80, percent: 10 },
  { floor: 75, percent: 7 },
  { floor: 70, percent: 5 },
];

export function incrementPercentForYearlyScore(yearlyScore: number): number {
  const tier = INCREMENT_TIERS.find((t) => yearlyScore >= t.floor);
  return tier ? tier.percent : 0;
}

export function yearlyScoreLabel(yearlyScore: number): string {
  const percent = incrementPercentForYearlyScore(yearlyScore);
  return percent > 0 ? `${percent}% increment` : "Below increment threshold";
}

export function monthBounds(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

// Pure string-based month bounds for a "YYYY-MM-DD" date — used when rolling
// daily entries up into a month, so the result never depends on the server's
// local timezone the way parsing/reading a Date object can.
export function monthBoundsForDateString(dateStr: string) {
  const [year, month] = dateStr.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function isWeekday(dateStr: string): boolean {
  const [year, month, day] = dateStr.split("-").map(Number);
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return dow >= 1 && dow <= 5;
}

// Most recent weekday on/before `date` — the sensible default for a new
// daily-entry form (today if it's a weekday, else the preceding Friday).
// Built from local Y/M/D components throughout so the result reflects the
// server's local "today", not a UTC-shifted one.
export function mostRecentWeekday(date: Date): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() - 1);
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
