"use client";

import { useState } from "react";
import { Card } from "@/components/ui";

// Monthly Founder Payout calculator. Reproduces the "August 2026" sheet of
// the Income & Expenses Tracker as that month's seed data, and generalizes
// the same calculation to any month via calculatePayoutRow() — the single
// place row-level math happens, per row.
//
// Founder-level Sales/Operations credit is a genuinely per-deal business
// decision in the source spreadsheet (e.g. the "Semble - Noah" row is
// staffed by T.A.Q. but its Sales credit splits 50/50 between H.B. and
// R.S.S.) — there's no rule to infer it from Staff Name, so each row
// carries its own credit selection (a founder, a known split preset, or
// unassigned) rather than a fixed lookup keyed to specific rows. August's
// rows are pre-set to the exact presets verified against the Excel.
//
// Three rules below come from the "Profit Sharing & Compensation Policy"
// (effective 1 Apr 2025, edited 20 Jun 2025) rather than the Excel — the
// Excel's August data never exercised them (bonuses were all ₹0, and the
// two Foundation Accounts happened to have equal invoice amounts that
// month), so they're implemented per the written policy text directly:
//   1. Standard salary amounts (full-time / half-time / hourly-director)
//      with the policy's "shall not exceed" caps.
//   2. Bonus = 70% to whoever handles the account (a founder, a regular
//      employee, or split between both if co-managed), 30% held for ESQUE
//      — not the 100%-to-one-founder behavior the calculator had before.
//   3. Foundation Accounts (Seven Figure Agency / R.S.S., Semble / H.B.):
//      both calculated using whichever has the lower invoice amount; the
//      excess from the higher one transfers 100% to whichever founder
//      owns that (currently higher) account.

type FounderCode = "HB" | "TAQ" | "RSS";
type PayoutType = "normal" | "hourly" | "bonus";
type SplitPresetKey = "none" | "HB" | "TAQ" | "RSS" | "HB_RSS_50" | "HB_RSS_95_5" | "TAQ_RSS_95_5";
type SalaryBasis = "full_time" | "half_time" | "hourly_director" | "custom";

const FOUNDER_LABELS: Record<FounderCode, string> = {
  HB: "Harshit Bansal (H.B.)",
  TAQ: "Tanveer Ahmed Quraishi (T.A.Q.)",
  RSS: "Ruchit Singh Sisodiya (R.S.S.)",
};
const FOUNDER_ORDER: FounderCode[] = ["HB", "TAQ", "RSS"];

const SPLIT_PRESETS: Record<SplitPresetKey, Partial<Record<FounderCode, number>>> = {
  none: {},
  HB: { HB: 1 },
  TAQ: { TAQ: 1 },
  RSS: { RSS: 1 },
  HB_RSS_50: { HB: 0.5, RSS: 0.5 },
  HB_RSS_95_5: { HB: 0.95, RSS: 0.05 },
  TAQ_RSS_95_5: { TAQ: 0.95, RSS: 0.05 },
};

const SPLIT_PRESET_LABELS: Record<SplitPresetKey, string> = {
  none: "— Unassigned —",
  HB: "H.B. (100%)",
  TAQ: "T.A.Q. (100%)",
  RSS: "R.S.S. (100%)",
  HB_RSS_50: "H.B. / R.S.S. (50 / 50)",
  HB_RSS_95_5: "H.B. 95% / R.S.S. 5%",
  TAQ_RSS_95_5: "T.A.Q. 95% / R.S.S. 5%",
};

// Policy §1 — standard salary amounts. "custom" is the escape hatch for
// anything that doesn't fit (e.g. August's Website Development rows, which
// predate this being enforced in the tool).
const SALARY_CAPS: Record<"full_time" | "half_time", number> = { full_time: 75000, half_time: 40000 };
const DIRECTOR_HOURLY_RATE = 500;
const SALARY_BASIS_LABELS: Record<SalaryBasis, string> = {
  full_time: `Full-time (₹${SALARY_CAPS.full_time.toLocaleString("en-IN")} cap)`,
  half_time: `Half-time (₹${SALARY_CAPS.half_time.toLocaleString("en-IN")} cap)`,
  hourly_director: `Director hourly (₹${DIRECTOR_HOURLY_RATE}/hr)`,
  custom: "Custom",
};

interface PayoutRow {
  id: string;
  staffName: string;
  client: string;
  payoutType: PayoutType;
  amount: number;
  rate: number;
  salaryDeduction: number;
  /** Policy §1 — how Salary Deduction is derived (normal rows only). */
  salaryBasis: SalaryBasis;
  /** Hours worked, only meaningful when salaryBasis is "hourly_director". */
  directorHours: number;
  /** Marks this row's Salary Deduction as a founder's own monthly salary base (normal rows only). */
  salaryBaseFor: FounderCode | null;
  /** Which founder(s) this row's Sales allocation is credited to (normal rows only). */
  salesCredit: SplitPresetKey;
  /** Which founder(s) this row's Operations allocation is credited to (normal rows only). */
  opsCredit: SplitPresetKey;
  /** Founder who handles this bonus account, if any (bonus rows only). */
  bonusFounder: FounderCode | null;
  /** Non-founder employee who handles this bonus account, if any (bonus rows only). */
  bonusEmployeeName: string;
  /** When both a founder and an employee are set, the founder's share of the 70% handler pool (0-100). */
  bonusPartnerSharePercent: number;
  /** Policy §5 — Foundation Account flag (normal rows only; exactly two expected: R.S.S.'s and H.B.'s). */
  isFoundationAccount: boolean;
}

// Month list — a plain array, so adding a future month is just adding a row.
const MONTHS: { id: string; label: string }[] = [
  { id: "2026-07", label: "July 2026" },
  { id: "2026-08", label: "August 2026" },
  { id: "2026-09", label: "September 2026" },
  { id: "2026-10", label: "October 2026" },
  { id: "2026-11", label: "November 2026" },
  { id: "2026-12", label: "December 2026" },
  { id: "2027-01", label: "January 2027" },
  { id: "2027-02", label: "February 2027" },
  { id: "2027-03", label: "March 2027" },
  { id: "2027-04", label: "April 2027" },
  { id: "2027-05", label: "May 2027" },
  { id: "2027-06", label: "June 2027" },
];

// August 2026 — the Excel-verified seed data. Every other month starts empty.
// salaryBasis is "custom" everywhere here so none of the new caps silently
// touch these already-verified numbers; isFoundationAccount is set on the
// two rows the policy names (their amounts happen to be equal in August, so
// the new adjustment produces zero excess and changes nothing).
const AUGUST_ROWS: PayoutRow[] = [
  { id: "row2", staffName: "Ruchit Singh Sisodiya", client: "Seven Figure Agency", payoutType: "normal", amount: 1200, rate: 95.38, salaryDeduction: 75000, salaryBasis: "custom", directorHours: 0, salaryBaseFor: "RSS", salesCredit: "RSS", opsCredit: "RSS", bonusFounder: null, bonusEmployeeName: "", bonusPartnerSharePercent: 50, isFoundationAccount: true },
  { id: "row3", staffName: "Harshit Bansal", client: "Semble - Jeffrey", payoutType: "normal", amount: 1200, rate: 95.564015625, salaryDeduction: 75000, salaryBasis: "custom", directorHours: 0, salaryBaseFor: "HB", salesCredit: "HB", opsCredit: "HB", bonusFounder: null, bonusEmployeeName: "", bonusPartnerSharePercent: 50, isFoundationAccount: true },
  { id: "row4", staffName: "Rohan Soni", client: "Semble - Alex", payoutType: "normal", amount: 1250, rate: 95.564015625, salaryDeduction: 45000, salaryBasis: "custom", directorHours: 0, salaryBaseFor: null, salesCredit: "HB", opsCredit: "HB_RSS_95_5", bonusFounder: null, bonusEmployeeName: "", bonusPartnerSharePercent: 50, isFoundationAccount: false },
  { id: "row5", staffName: "Tanveer Ahmed Quraishi", client: "Semble - Noah", payoutType: "normal", amount: 1250, rate: 95.564015625, salaryDeduction: 75000, salaryBasis: "custom", directorHours: 0, salaryBaseFor: "TAQ", salesCredit: "HB_RSS_50", opsCredit: "TAQ_RSS_95_5", bonusFounder: null, bonusEmployeeName: "", bonusPartnerSharePercent: 50, isFoundationAccount: false },
  { id: "row6", staffName: "-", client: "Hourly - Developer - TODD", payoutType: "hourly", amount: 60, rate: 95.564015625, salaryDeduction: 0, salaryBasis: "custom", directorHours: 0, salaryBaseFor: null, salesCredit: "none", opsCredit: "none", bonusFounder: null, bonusEmployeeName: "", bonusPartnerSharePercent: 50, isFoundationAccount: false },
  { id: "row7", staffName: "Ruchit Singh Sisodiya", client: "Vanessa", payoutType: "normal", amount: 0, rate: 0, salaryDeduction: 0, salaryBasis: "custom", directorHours: 0, salaryBaseFor: null, salesCredit: "RSS", opsCredit: "RSS", bonusFounder: null, bonusEmployeeName: "", bonusPartnerSharePercent: 50, isFoundationAccount: false },
  { id: "row8", staffName: "Ruchit Singh Sisodiya", client: "Sun Club", payoutType: "normal", amount: 110, rate: 0, salaryDeduction: 0, salaryBasis: "custom", directorHours: 0, salaryBaseFor: null, salesCredit: "RSS", opsCredit: "RSS", bonusFounder: null, bonusEmployeeName: "", bonusPartnerSharePercent: 50, isFoundationAccount: false },
  { id: "row9", staffName: "Semble", client: "Website Development", payoutType: "normal", amount: 2000, rate: 95.56, salaryDeduction: 85000, salaryBasis: "custom", directorHours: 0, salaryBaseFor: null, salesCredit: "HB_RSS_50", opsCredit: "RSS", bonusFounder: null, bonusEmployeeName: "", bonusPartnerSharePercent: 50, isFoundationAccount: false },
  { id: "row10", staffName: "SebleCommons", client: "Website Development", payoutType: "normal", amount: 0, rate: 0, salaryDeduction: 0, salaryBasis: "custom", directorHours: 0, salaryBaseFor: null, salesCredit: "RSS", opsCredit: "RSS", bonusFounder: null, bonusEmployeeName: "", bonusPartnerSharePercent: 50, isFoundationAccount: false },
  { id: "row11", staffName: "Ruchit Singh Sisodiya", client: "Semble Bonus", payoutType: "bonus", amount: 0, rate: 0, salaryDeduction: 0, salaryBasis: "custom", directorHours: 0, salaryBaseFor: null, salesCredit: "none", opsCredit: "none", bonusFounder: "RSS", bonusEmployeeName: "", bonusPartnerSharePercent: 50, isFoundationAccount: false },
  { id: "row12", staffName: "Tanveer Ahmed Quraishi", client: "Semble - Noah - Bonus", payoutType: "bonus", amount: 0, rate: 0, salaryDeduction: 0, salaryBasis: "custom", directorHours: 0, salaryBaseFor: null, salesCredit: "none", opsCredit: "none", bonusFounder: "TAQ", bonusEmployeeName: "", bonusPartnerSharePercent: 50, isFoundationAccount: false },
  { id: "row13", staffName: "Harshit Bansal", client: "Semble - Jeffrey - Bonus", payoutType: "bonus", amount: 0, rate: 0, salaryDeduction: 0, salaryBasis: "custom", directorHours: 0, salaryBaseFor: null, salesCredit: "none", opsCredit: "none", bonusFounder: "HB", bonusEmployeeName: "", bonusPartnerSharePercent: 50, isFoundationAccount: false },
  { id: "row14", staffName: "-", client: "Semble - Alex - Bonus", payoutType: "bonus", amount: 0, rate: 0, salaryDeduction: 0, salaryBasis: "custom", directorHours: 0, salaryBaseFor: null, salesCredit: "none", opsCredit: "none", bonusFounder: null, bonusEmployeeName: "", bonusPartnerSharePercent: 50, isFoundationAccount: false },
];

function blankRow(): PayoutRow {
  const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    staffName: "",
    client: "",
    payoutType: "normal",
    amount: 0,
    rate: 0,
    salaryDeduction: 0,
    salaryBasis: "custom",
    directorHours: 0,
    salaryBaseFor: null,
    salesCredit: "none",
    opsCredit: "none",
    bonusFounder: null,
    bonusEmployeeName: "",
    bonusPartnerSharePercent: 50,
    isFoundationAccount: false,
  };
}

// The single place row-level math happens — every month, every row type,
// goes through this function. (Unchanged in shape/behavior from before;
// only the bonus branch's ESQUE share changed, from 0 to 30%, per policy §4
// — since every bonus row in the verified August data is ₹0, this doesn't
// move any previously-checked number.)
function calculatePayoutRow(row: PayoutRow) {
  const conversion = row.amount * row.rate;

  if (row.payoutType === "hourly") {
    // Hourly/contractor work: no salary deduction, no 10/50/32/8 split —
    // the full converted amount is retained as ESQUE.
    return { conversion, remaining: 0, sales: 0, operations: 0, partners: 0, esque: conversion };
  }

  if (row.payoutType === "bonus") {
    // Policy §4: bonuses split 70% to the handler / 30% held for ESQUE —
    // never the 10/50/32/8 split. The 70% "handler" portion is attributed
    // to specific founders/employees in computeFounderTotals, not here.
    return { conversion, remaining: 0, sales: 0, operations: 0, partners: 0, esque: conversion * 0.3 };
  }

  const remaining = conversion - row.salaryDeduction;
  return {
    conversion,
    remaining,
    sales: remaining * 0.1,
    operations: remaining * 0.5,
    partners: remaining * 0.32,
    esque: remaining * 0.08,
  };
}

// Policy §5 — Foundation Accounts. When exactly two "normal" rows are
// flagged, both get calculated using whichever has the lower Amount; the
// higher one's excess (its own amount minus the shared lower amount,
// converted at its own rate) transfers 100% to whichever founder owns that
// (currently higher) account, bypassing the split and ESQUE entirely.
// Returns the row list with the higher row's amount capped to match (for
// every downstream aggregate calculation), plus the excess if any.
function applyFoundationAdjustment(rows: PayoutRow[]): { rows: PayoutRow[]; excess: { founder: FounderCode; amount: number } | null } {
  const flagged = rows.filter((r) => r.isFoundationAccount && r.payoutType === "normal");
  if (flagged.length !== 2 || flagged[0].amount === flagged[1].amount) {
    return { rows, excess: null };
  }
  const [a, b] = flagged;
  const higher = a.amount > b.amount ? a : b;
  const lower = higher.id === a.id ? b : a;
  const baseAmount = lower.amount;
  const excessAmount = (higher.amount - baseAmount) * higher.rate;
  const adjustedRows = rows.map((r) => (r.id === higher.id ? { ...r, amount: baseAmount } : r));
  const founder = higher.salaryBaseFor;
  return { rows: adjustedRows, excess: founder ? { founder, amount: excessAmount } : null };
}

function computeFounderTotals(rows: PayoutRow[]) {
  const { rows: adjustedRows, excess } = applyFoundationAdjustment(rows);
  const computed = adjustedRows.map((r) => ({ row: r, calc: calculatePayoutRow(r) }));
  const normal = computed.filter((c) => c.row.payoutType === "normal");
  const bonusRows = computed.filter((c) => c.row.payoutType === "bonus");

  const partnersPool = normal.reduce((sum, c) => sum + c.calc.partners, 0);
  const partnersShare = partnersPool / 3;

  function creditSum(preset: (r: PayoutRow) => SplitPresetKey, valueKey: "sales" | "operations", founder: FounderCode) {
    return normal.reduce((sum, c) => {
      const frac = SPLIT_PRESETS[preset(c.row)][founder];
      return frac ? sum + c.calc[valueKey] * frac : sum;
    }, 0);
  }

  // Policy §4: 70% of a bonus goes to whoever handles the account. If a
  // founder handles it alone, they get the full 70%. If a founder co-manages
  // with a named employee, the 70% splits between them per
  // bonusPartnerSharePercent (the policy doesn't pin an exact ratio for the
  // co-managed case, so this is editable per row rather than assumed).
  function bonusSumFor(founder: FounderCode) {
    return bonusRows.reduce((sum, c) => {
      if (c.row.bonusFounder !== founder) return sum;
      const handlerPool = c.calc.conversion * 0.7;
      const hasEmployee = c.row.bonusEmployeeName.trim() !== "";
      return sum + (hasEmployee ? handlerPool * (c.row.bonusPartnerSharePercent / 100) : handlerPool);
    }, 0);
  }

  return FOUNDER_ORDER.map((f) => {
    const sales = creditSum((r) => r.salesCredit, "sales", f);
    const operations = creditSum((r) => r.opsCredit, "operations", f);
    const salaryDeduction = normal
      .filter((c) => c.row.salaryBaseFor === f)
      .reduce((sum, c) => sum + c.row.salaryDeduction, 0);
    const salary = salaryDeduction + sales + operations + partnersShare;
    const bonus = bonusSumFor(f);
    const foundationExcess = excess && excess.founder === f ? excess.amount : 0;
    return {
      founder: f,
      sales,
      operations,
      partners: partnersShare,
      salaryDeduction,
      salary,
      bonus,
      foundationExcess,
      total: salary + bonus + foundationExcess,
    };
  });
}

function computeMonthlyTotals(rows: PayoutRow[]) {
  // Total Conversion reflects every row's own entered Amount × Rate — the
  // full revenue picture, independent of how it's later allocated. Every
  // other total reflects the Foundation-adjusted split, since that's what
  // actually gets distributed.
  const rawConversion = rows.reduce((s, r) => s + calculatePayoutRow(r).conversion, 0);
  const { rows: adjustedRows, excess } = applyFoundationAdjustment(rows);
  const computed = adjustedRows.map((r) => calculatePayoutRow(r));
  return {
    conversion: rawConversion,
    salaryDeduction: rows.filter((r) => r.payoutType === "normal").reduce((s, r) => s + r.salaryDeduction, 0),
    remaining: computed.reduce((s, c) => s + c.remaining, 0),
    sales: computed.reduce((s, c) => s + c.sales, 0),
    operations: computed.reduce((s, c) => s + c.operations, 0),
    partners: computed.reduce((s, c) => s + c.partners, 0),
    esque: computed.reduce((s, c) => s + c.esque, 0),
    foundationExcess: excess ? excess.amount : 0,
  };
}

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

const cellInput =
  "w-full min-w-0 rounded-md border border-border bg-white/70 px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20";
const numInput = cellInput + " text-right tabular-nums";
const dash = <span className="block px-2 py-1 text-center text-muted">—</span>;

export function FounderPayoutCalculator() {
  const [selectedMonth, setSelectedMonth] = useState("2026-08");
  const [monthsData, setMonthsData] = useState<Record<string, PayoutRow[]>>({ "2026-08": AUGUST_ROWS });

  const rows = monthsData[selectedMonth] ?? [];

  function setRows(updater: (rows: PayoutRow[]) => PayoutRow[]) {
    setMonthsData((prev) => ({ ...prev, [selectedMonth]: updater(prev[selectedMonth] ?? []) }));
  }
  function updateRowRaw(id: string, patch: Partial<PayoutRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function updateText(id: string, field: "staffName" | "client" | "bonusEmployeeName", value: string) {
    updateRowRaw(id, { [field]: value });
  }
  function updateNumber(id: string, field: "amount" | "rate", value: string) {
    const n = Number(value);
    updateRowRaw(id, { [field]: Number.isFinite(n) ? n : 0 });
  }
  function updateType(id: string, value: PayoutType) {
    updateRowRaw(id, { payoutType: value });
  }
  function updateSalaryBase(id: string, value: string) {
    updateRowRaw(id, { salaryBaseFor: (value || null) as FounderCode | null });
  }
  function updateCredit(id: string, field: "salesCredit" | "opsCredit", value: SplitPresetKey) {
    updateRowRaw(id, { [field]: value });
  }
  function updateBonusFounder(id: string, value: string) {
    updateRowRaw(id, { bonusFounder: (value || null) as FounderCode | null });
  }
  function updateBonusPartnerShare(id: string, value: string) {
    const n = Number(value);
    updateRowRaw(id, { bonusPartnerSharePercent: Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 50 });
  }
  function updateFoundationFlag(id: string, checked: boolean) {
    updateRowRaw(id, { isFoundationAccount: checked });
  }

  // Salary Deduction: manual entry is clamped to the policy cap whenever
  // the basis is full_time/half_time; hourly_director derives it from hours.
  function updateSalaryDeduction(id: string, value: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const n = Number(value);
        if (!Number.isFinite(n)) return r;
        if (r.salaryBasis === "full_time") return { ...r, salaryDeduction: Math.min(n, SALARY_CAPS.full_time) };
        if (r.salaryBasis === "half_time") return { ...r, salaryDeduction: Math.min(n, SALARY_CAPS.half_time) };
        if (r.salaryBasis === "hourly_director") return r; // derived from hours, not directly editable
        return { ...r, salaryDeduction: n };
      })
    );
  }
  function updateSalaryBasis(id: string, basis: SalaryBasis) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        if (basis === "full_time") return { ...r, salaryBasis: basis, salaryDeduction: SALARY_CAPS.full_time };
        if (basis === "half_time") return { ...r, salaryBasis: basis, salaryDeduction: SALARY_CAPS.half_time };
        if (basis === "hourly_director") return { ...r, salaryBasis: basis, salaryDeduction: r.directorHours * DIRECTOR_HOURLY_RATE };
        return { ...r, salaryBasis: basis };
      })
    );
  }
  function updateDirectorHours(id: string, value: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const hours = Number(value);
        if (!Number.isFinite(hours)) return r;
        return { ...r, directorHours: hours, salaryDeduction: hours * DIRECTOR_HOURLY_RATE };
      })
    );
  }

  function addRow() {
    setRows((prev) => [...prev, blankRow()]);
  }
  function deleteRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  const founderTotals = computeFounderTotals(rows);
  const monthlyTotals = computeMonthlyTotals(rows);
  const monthLabel = MONTHS.find((m) => m.id === selectedMonth)?.label ?? selectedMonth;
  const foundationRows = rows.filter((r) => r.isFoundationAccount && r.payoutType === "normal");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Month</label>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="rounded-lg border border-border bg-white/70 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
          >
            {MONTHS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={addRow}
          className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white hover:bg-brand-red-dark"
        >
          + Add Employee
        </button>
      </div>

      <p className="text-xs text-muted">
        Each month keeps its own independent rows — editing or deleting a row here only affects{" "}
        <strong>{monthLabel}</strong>. Every figure below recalculates the moment you change a value.
      </p>

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Payout rows — {monthLabel}</h3>
        <Card className="overflow-x-auto">
          {rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted">
              No payout rows for {monthLabel} yet. Click &ldquo;+ Add Employee&rdquo; to start.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase text-muted">
                  <th className="px-2 py-3 min-w-[130px]">Type</th>
                  <th className="px-2 py-3 min-w-[150px]">Staff Name</th>
                  <th className="px-2 py-3 min-w-[150px]">Client</th>
                  <th className="px-2 py-3 w-24">Amount (USD)</th>
                  <th className="px-2 py-3 w-24">Conv. Rate</th>
                  <th className="px-2 py-3 min-w-[160px]">Salary basis</th>
                  <th className="px-2 py-3 w-20">Hours</th>
                  <th className="px-2 py-3 w-24">Salary Ded.</th>
                  <th className="px-2 py-3 min-w-[140px]">Salary base for / Bonus employee</th>
                  <th className="px-2 py-3 min-w-[160px]">Sales credit / Bonus founder</th>
                  <th className="px-2 py-3 min-w-[160px]">Ops credit / Partner share %</th>
                  <th className="px-2 py-3 w-16">Fdn.</th>
                  <th className="px-2 py-3 text-right">Conversion</th>
                  <th className="px-2 py-3 text-right">Remaining</th>
                  <th className="px-2 py-3 text-right">Sales 10%</th>
                  <th className="px-2 py-3 text-right">Operations 50%</th>
                  <th className="px-2 py-3 text-right">Partners 32%</th>
                  <th className="px-2 py-3 text-right">ESQUE</th>
                  <th className="px-2 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const calc = calculatePayoutRow(r);
                  const isNormal = r.payoutType === "normal";
                  const isBonus = r.payoutType === "bonus";
                  return (
                    <tr key={r.id} className={r.payoutType === "hourly" ? "bg-black/[0.02]" : undefined}>
                      <td className="px-2 py-2">
                        <select className={cellInput} value={r.payoutType} onChange={(e) => updateType(r.id, e.target.value as PayoutType)}>
                          <option value="normal">Normal (10/50/32/8)</option>
                          <option value="hourly">Hourly / Contractor</option>
                          <option value="bonus">Bonus (70/30)</option>
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <input className={cellInput} value={r.staffName} onChange={(e) => updateText(r.id, "staffName", e.target.value)} />
                      </td>
                      <td className="px-2 py-2">
                        <input className={cellInput} value={r.client} onChange={(e) => updateText(r.id, "client", e.target.value)} />
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" step="any" className={numInput} value={r.amount} onChange={(e) => updateNumber(r.id, "amount", e.target.value)} />
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" step="any" className={numInput} value={r.rate} onChange={(e) => updateNumber(r.id, "rate", e.target.value)} />
                      </td>
                      <td className="px-2 py-2">
                        {isNormal ? (
                          <select className={cellInput} value={r.salaryBasis} onChange={(e) => updateSalaryBasis(r.id, e.target.value as SalaryBasis)}>
                            {(Object.keys(SALARY_BASIS_LABELS) as SalaryBasis[]).map((b) => (
                              <option key={b} value={b}>
                                {SALARY_BASIS_LABELS[b]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          dash
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {isNormal && r.salaryBasis === "hourly_director" ? (
                          <input
                            type="number"
                            step="any"
                            className={numInput}
                            value={r.directorHours}
                            onChange={(e) => updateDirectorHours(r.id, e.target.value)}
                          />
                        ) : (
                          dash
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {isNormal ? (
                          <input
                            type="number"
                            step="any"
                            className={numInput}
                            value={r.salaryDeduction}
                            disabled={r.salaryBasis === "hourly_director"}
                            onChange={(e) => updateSalaryDeduction(r.id, e.target.value)}
                          />
                        ) : (
                          dash
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {isNormal ? (
                          <select className={cellInput} value={r.salaryBaseFor ?? ""} onChange={(e) => updateSalaryBase(r.id, e.target.value)}>
                            <option value="">— None —</option>
                            {FOUNDER_ORDER.map((f) => (
                              <option key={f} value={f}>
                                {FOUNDER_LABELS[f]}
                              </option>
                            ))}
                          </select>
                        ) : isBonus ? (
                          <input
                            className={cellInput}
                            placeholder="Employee name (if any)"
                            value={r.bonusEmployeeName}
                            onChange={(e) => updateText(r.id, "bonusEmployeeName", e.target.value)}
                          />
                        ) : (
                          dash
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {isNormal ? (
                          <select
                            className={cellInput}
                            value={r.salesCredit}
                            onChange={(e) => updateCredit(r.id, "salesCredit", e.target.value as SplitPresetKey)}
                          >
                            {(Object.keys(SPLIT_PRESET_LABELS) as SplitPresetKey[]).map((k) => (
                              <option key={k} value={k}>
                                {SPLIT_PRESET_LABELS[k]}
                              </option>
                            ))}
                          </select>
                        ) : isBonus ? (
                          <select className={cellInput} value={r.bonusFounder ?? ""} onChange={(e) => updateBonusFounder(r.id, e.target.value)}>
                            <option value="">— Unassigned —</option>
                            {FOUNDER_ORDER.map((f) => (
                              <option key={f} value={f}>
                                {FOUNDER_LABELS[f]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          dash
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {isNormal ? (
                          <select
                            className={cellInput}
                            value={r.opsCredit}
                            onChange={(e) => updateCredit(r.id, "opsCredit", e.target.value as SplitPresetKey)}
                          >
                            {(Object.keys(SPLIT_PRESET_LABELS) as SplitPresetKey[]).map((k) => (
                              <option key={k} value={k}>
                                {SPLIT_PRESET_LABELS[k]}
                              </option>
                            ))}
                          </select>
                        ) : isBonus && r.bonusEmployeeName.trim() !== "" ? (
                          <input
                            type="number"
                            step="1"
                            min={0}
                            max={100}
                            className={numInput}
                            value={r.bonusPartnerSharePercent}
                            onChange={(e) => updateBonusPartnerShare(r.id, e.target.value)}
                            title="Founder's share of the 70% handler pool when co-managed with the named employee"
                          />
                        ) : (
                          dash
                        )}
                      </td>
                      <td className="px-2 py-2 text-center">
                        {isNormal ? (
                          <input
                            type="checkbox"
                            checked={r.isFoundationAccount}
                            onChange={(e) => updateFoundationFlag(r.id, e.target.checked)}
                            title="Foundation Account (Policy §5) — pairs with exactly one other flagged row"
                          />
                        ) : (
                          dash
                        )}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-muted">{inr.format(calc.conversion)}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-muted">{isNormal ? inr.format(calc.remaining) : "—"}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-foreground">{isNormal ? inr.format(calc.sales) : "—"}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-foreground">{isNormal ? inr.format(calc.operations) : "—"}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-foreground">{isNormal ? inr.format(calc.partners) : "—"}</td>
                      <td className="px-2 py-2 text-right tabular-nums font-medium text-foreground">{inr.format(calc.esque)}</td>
                      <td className="px-2 py-2 text-right">
                        <button type="button" onClick={() => deleteRow(r.id)} className="text-xs font-medium text-brand-red hover:underline">
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
        <p className="mt-2 text-xs text-muted">
          Hourly/Contractor rows skip the salary deduction and split entirely — the full converted
          amount is retained as ESQUE. Bonus rows skip the 10/50/32/8 split too: 30% is retained as
          ESQUE and 70% goes to whoever handles the account — a founder, a named employee, or both
          (split by the percentage you set). Salary basis auto-fills Salary Deduction and caps it at
          the policy amount for Full-time/Half-time; Director-hourly derives it from Hours × ₹500.
        </p>
      </div>

      {foundationRows.length === 2 && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-foreground mb-1">Foundation Accounts (Policy §5)</h3>
          <p className="text-xs text-muted mb-3">
            Both accounts are calculated using the lower of the two invoice amounts; the excess from
            the higher one transfers 100% to whichever founder owns it.
          </p>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {foundationRows.map((r) => (
              <div key={r.id} className="flex justify-between rounded-lg bg-black/[0.03] px-3 py-2">
                <span>
                  <span className="font-medium text-foreground">{r.client || r.staffName}</span>{" "}
                  <span className="text-muted">({r.salaryBaseFor ? FOUNDER_LABELS[r.salaryBaseFor] : "no owner set"})</span>
                </span>
                <span className="tabular-nums text-muted">${r.amount.toLocaleString("en-US")}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-between text-sm border-t border-border pt-2">
            <span className="text-muted">Excess transferred (100%, bypasses ESQUE)</span>
            <span className="font-medium tabular-nums text-foreground">{inr.format(monthlyTotals.foundationExcess)}</span>
          </div>
        </Card>
      )}

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Monthly totals — {monthLabel}</h3>
        <Card className="p-5">
          <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-4">
            <div className="flex justify-between sm:block">
              <dt className="text-muted">Conversion</dt>
              <dd className="tabular-nums font-medium sm:mt-0.5">{inr.format(monthlyTotals.conversion)}</dd>
            </div>
            <div className="flex justify-between sm:block">
              <dt className="text-muted">Salary Deduction</dt>
              <dd className="tabular-nums font-medium sm:mt-0.5">{inr.format(monthlyTotals.salaryDeduction)}</dd>
            </div>
            <div className="flex justify-between sm:block">
              <dt className="text-muted">Remaining</dt>
              <dd className="tabular-nums font-medium sm:mt-0.5">{inr.format(monthlyTotals.remaining)}</dd>
            </div>
            <div className="flex justify-between sm:block">
              <dt className="text-muted">ESQUE</dt>
              <dd className="tabular-nums font-medium sm:mt-0.5">{inr.format(monthlyTotals.esque)}</dd>
            </div>
            <div className="flex justify-between sm:block">
              <dt className="text-muted">Sales</dt>
              <dd className="tabular-nums font-medium sm:mt-0.5">{inr.format(monthlyTotals.sales)}</dd>
            </div>
            <div className="flex justify-between sm:block">
              <dt className="text-muted">Operations</dt>
              <dd className="tabular-nums font-medium sm:mt-0.5">{inr.format(monthlyTotals.operations)}</dd>
            </div>
            <div className="flex justify-between sm:block">
              <dt className="text-muted">Partners</dt>
              <dd className="tabular-nums font-medium sm:mt-0.5">{inr.format(monthlyTotals.partners)}</dd>
            </div>
            <div className="flex justify-between sm:block">
              <dt className="text-muted">Foundation excess</dt>
              <dd className="tabular-nums font-medium sm:mt-0.5">{inr.format(monthlyTotals.foundationExcess)}</dd>
            </div>
          </dl>
        </Card>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Founder payout summary — {monthLabel}</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {founderTotals.map((f) => (
            <Card key={f.founder} className="p-5">
              <div className="font-semibold text-foreground font-display">{FOUNDER_LABELS[f.founder]}</div>
              <dl className="mt-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted">Salary deduction</dt>
                  <dd className="tabular-nums">{inr.format(f.salaryDeduction)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Sales</dt>
                  <dd className="tabular-nums">{inr.format(f.sales)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Operations</dt>
                  <dd className="tabular-nums">{inr.format(f.operations)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Partners</dt>
                  <dd className="tabular-nums">{inr.format(f.partners)}</dd>
                </div>
                <div className="flex justify-between border-t border-border pt-1.5 font-medium">
                  <dt className="text-foreground">Salary</dt>
                  <dd className="tabular-nums text-foreground">{inr.format(f.salary)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Bonus (70% share)</dt>
                  <dd className="tabular-nums">{inr.format(f.bonus)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Foundation excess</dt>
                  <dd className="tabular-nums">{inr.format(f.foundationExcess)}</dd>
                </div>
                <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
                  <dt className="text-foreground">Total payout</dt>
                  <dd className="tabular-nums text-foreground">{inr.format(f.total)}</dd>
                </div>
              </dl>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
