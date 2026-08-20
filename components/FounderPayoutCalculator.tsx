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

type FounderCode = "HB" | "TAQ" | "RSS";
type PayoutType = "normal" | "hourly" | "bonus";
type SplitPresetKey = "none" | "HB" | "TAQ" | "RSS" | "HB_RSS_50" | "HB_RSS_95_5" | "TAQ_RSS_95_5";

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

interface PayoutRow {
  id: string;
  staffName: string;
  client: string;
  payoutType: PayoutType;
  amount: number;
  rate: number;
  salaryDeduction: number;
  /** Marks this row's Salary Deduction as a founder's own monthly salary base (normal rows only). */
  salaryBaseFor: FounderCode | null;
  /** Which founder(s) this row's Sales allocation is credited to (normal rows only). */
  salesCredit: SplitPresetKey;
  /** Which founder(s) this row's Operations allocation is credited to (normal rows only). */
  opsCredit: SplitPresetKey;
  /** Which founder this row's bonus goes to (bonus rows only). */
  bonusFounder: FounderCode | null;
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
const AUGUST_ROWS: PayoutRow[] = [
  { id: "row2", staffName: "Ruchit Singh Sisodiya", client: "Seven Figure Agency", payoutType: "normal", amount: 1200, rate: 95.38, salaryDeduction: 75000, salaryBaseFor: "RSS", salesCredit: "RSS", opsCredit: "RSS", bonusFounder: null },
  { id: "row3", staffName: "Harshit Bansal", client: "Semble - Jeffrey", payoutType: "normal", amount: 1200, rate: 95.564015625, salaryDeduction: 75000, salaryBaseFor: "HB", salesCredit: "HB", opsCredit: "HB", bonusFounder: null },
  { id: "row4", staffName: "Rohan Soni", client: "Semble - Alex", payoutType: "normal", amount: 1250, rate: 95.564015625, salaryDeduction: 45000, salaryBaseFor: null, salesCredit: "HB", opsCredit: "HB_RSS_95_5", bonusFounder: null },
  { id: "row5", staffName: "Tanveer Ahmed Quraishi", client: "Semble - Noah", payoutType: "normal", amount: 1250, rate: 95.564015625, salaryDeduction: 75000, salaryBaseFor: "TAQ", salesCredit: "HB_RSS_50", opsCredit: "TAQ_RSS_95_5", bonusFounder: null },
  { id: "row6", staffName: "-", client: "Hourly - Developer - TODD", payoutType: "hourly", amount: 60, rate: 95.564015625, salaryDeduction: 0, salaryBaseFor: null, salesCredit: "none", opsCredit: "none", bonusFounder: null },
  { id: "row7", staffName: "Ruchit Singh Sisodiya", client: "Vanessa", payoutType: "normal", amount: 0, rate: 0, salaryDeduction: 0, salaryBaseFor: null, salesCredit: "RSS", opsCredit: "RSS", bonusFounder: null },
  { id: "row8", staffName: "Ruchit Singh Sisodiya", client: "Sun Club", payoutType: "normal", amount: 110, rate: 0, salaryDeduction: 0, salaryBaseFor: null, salesCredit: "RSS", opsCredit: "RSS", bonusFounder: null },
  { id: "row9", staffName: "Semble", client: "Website Development", payoutType: "normal", amount: 2000, rate: 95.56, salaryDeduction: 85000, salaryBaseFor: null, salesCredit: "HB_RSS_50", opsCredit: "RSS", bonusFounder: null },
  { id: "row10", staffName: "SebleCommons", client: "Website Development", payoutType: "normal", amount: 0, rate: 0, salaryDeduction: 0, salaryBaseFor: null, salesCredit: "RSS", opsCredit: "RSS", bonusFounder: null },
  { id: "row11", staffName: "Ruchit Singh Sisodiya", client: "Semble Bonus", payoutType: "bonus", amount: 0, rate: 0, salaryDeduction: 0, salaryBaseFor: null, salesCredit: "none", opsCredit: "none", bonusFounder: "RSS" },
  { id: "row12", staffName: "Tanveer Ahmed Quraishi", client: "Semble - Noah - Bonus", payoutType: "bonus", amount: 0, rate: 0, salaryDeduction: 0, salaryBaseFor: null, salesCredit: "none", opsCredit: "none", bonusFounder: "TAQ" },
  { id: "row13", staffName: "Harshit Bansal", client: "Semble - Jeffrey - Bonus", payoutType: "bonus", amount: 0, rate: 0, salaryDeduction: 0, salaryBaseFor: null, salesCredit: "none", opsCredit: "none", bonusFounder: "HB" },
  { id: "row14", staffName: "-", client: "Semble - Alex - Bonus", payoutType: "bonus", amount: 0, rate: 0, salaryDeduction: 0, salaryBaseFor: null, salesCredit: "none", opsCredit: "none", bonusFounder: null },
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
    salaryBaseFor: null,
    salesCredit: "none",
    opsCredit: "none",
    bonusFounder: null,
  };
}

// The single place row-level math happens — every month, every row type,
// goes through this function.
function calculatePayoutRow(row: PayoutRow) {
  const conversion = row.amount * row.rate;

  if (row.payoutType === "hourly") {
    // Hourly/contractor work: no salary deduction, no 10/50/32/8 split —
    // the full converted amount is retained as ESQUE.
    return { conversion, remaining: 0, sales: 0, operations: 0, partners: 0, esque: conversion };
  }

  if (row.payoutType === "bonus") {
    // Bonus rows never go through the split; their value is added to a
    // founder's payout directly (handled in computeFounderTotals).
    return { conversion, remaining: 0, sales: 0, operations: 0, partners: 0, esque: 0 };
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

function computeFounderTotals(rows: PayoutRow[]) {
  const computed = rows.map((r) => ({ row: r, calc: calculatePayoutRow(r) }));
  const normal = computed.filter((c) => c.row.payoutType === "normal");

  const partnersPool = normal.reduce((sum, c) => sum + c.calc.partners, 0);
  const partnersShare = partnersPool / 3;

  function creditSum(preset: (r: PayoutRow) => SplitPresetKey, valueKey: "sales" | "operations", founder: FounderCode) {
    return normal.reduce((sum, c) => {
      const frac = SPLIT_PRESETS[preset(c.row)][founder];
      return frac ? sum + c.calc[valueKey] * frac : sum;
    }, 0);
  }

  return FOUNDER_ORDER.map((f) => {
    const sales = creditSum((r) => r.salesCredit, "sales", f);
    const operations = creditSum((r) => r.opsCredit, "operations", f);
    const salaryDeduction = normal
      .filter((c) => c.row.salaryBaseFor === f)
      .reduce((sum, c) => sum + c.row.salaryDeduction, 0);
    const salary = salaryDeduction + sales + operations + partnersShare;
    const bonus = computed
      .filter((c) => c.row.payoutType === "bonus" && c.row.bonusFounder === f)
      .reduce((sum, c) => sum + c.calc.conversion, 0);
    return { founder: f, sales, operations, partners: partnersShare, salaryDeduction, salary, bonus, total: salary + bonus };
  });
}

function computeMonthlyTotals(rows: PayoutRow[]) {
  const computed = rows.map((r) => calculatePayoutRow(r));
  return {
    conversion: computed.reduce((s, c) => s + c.conversion, 0),
    salaryDeduction: rows.filter((r) => r.payoutType === "normal").reduce((s, r) => s + r.salaryDeduction, 0),
    remaining: computed.reduce((s, c) => s + c.remaining, 0),
    sales: computed.reduce((s, c) => s + c.sales, 0),
    operations: computed.reduce((s, c) => s + c.operations, 0),
    partners: computed.reduce((s, c) => s + c.partners, 0),
    esque: computed.reduce((s, c) => s + c.esque, 0),
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

  function updateText(id: string, field: "staffName" | "client", value: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }
  function updateNumber(id: string, field: "amount" | "rate" | "salaryDeduction", value: string) {
    const n = Number(value);
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: Number.isFinite(n) ? n : 0 } : r)));
  }
  function updateType(id: string, value: PayoutType) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, payoutType: value } : r)));
  }
  function updateSalaryBase(id: string, value: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, salaryBaseFor: (value || null) as FounderCode | null } : r)));
  }
  function updateCredit(id: string, field: "salesCredit" | "opsCredit", value: SplitPresetKey) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }
  function updateBonusFounder(id: string, value: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, bonusFounder: (value || null) as FounderCode | null } : r)));
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
                  <th className="px-2 py-3 w-24">Salary Ded.</th>
                  <th className="px-2 py-3 min-w-[140px]">Salary base for</th>
                  <th className="px-2 py-3 min-w-[160px]">Sales / Bonus →</th>
                  <th className="px-2 py-3 min-w-[160px]">Operations →</th>
                  <th className="px-2 py-3 text-right">Conversion</th>
                  <th className="px-2 py-3 text-right">Remaining</th>
                  <th className="px-2 py-3 text-right">Sales 10%</th>
                  <th className="px-2 py-3 text-right">Operations 50%</th>
                  <th className="px-2 py-3 text-right">Partners 32%</th>
                  <th className="px-2 py-3 text-right">ESQUE 8%</th>
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
                        <select
                          className={cellInput}
                          value={r.payoutType}
                          onChange={(e) => updateType(r.id, e.target.value as PayoutType)}
                        >
                          <option value="normal">Normal (10/50/32/8)</option>
                          <option value="hourly">Hourly / Contractor</option>
                          <option value="bonus">Bonus</option>
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
                          <input
                            type="number"
                            step="any"
                            className={numInput}
                            value={r.salaryDeduction}
                            onChange={(e) => updateNumber(r.id, "salaryDeduction", e.target.value)}
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
          amount is retained as ESQUE. Bonus rows skip the split too; their converted amount goes
          straight to the founder picked under &ldquo;Sales / Bonus →&rdquo;.
        </p>
      </div>

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
                  <dt className="text-muted">Bonus</dt>
                  <dd className="tabular-nums">{inr.format(f.bonus)}</dd>
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
