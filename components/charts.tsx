"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { Card } from "@/components/ui";
import { formatUSD, formatINR } from "@/lib/format";

// Matches app/globals.css's --esque-plum / --esque-red / --muted tokens —
// kept as literal hex here since recharts needs real color values, not CSS vars.
const PLUM = "#5e3f7a";
const RED = "#b23a5b";
const MUTED = "#726e7c";
const BORDER = "rgba(38, 35, 44, 0.1)";
export const CHART_PALETTE = [PLUM, RED, "#8a6ba8", "#d97a95", "#b8a8c9", "#e0aebd"];

const FORMATTERS = {
  usd: formatUSD,
  inr: formatINR,
  number: (v: number) => String(v),
};

export function TrendChart({
  title,
  data,
  format: formatKey = "number",
  variant = "line",
}: {
  title: string;
  data: { label: string; value: number }[];
  format?: keyof typeof FORMATTERS;
  variant?: "line" | "bar";
}) {
  const format = FORMATTERS[formatKey];

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-foreground mb-4">{title}</h2>
      <div style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer>
          {variant === "bar" ? (
            <BarChart data={data} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
              <CartesianGrid stroke={BORDER} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 12 }} axisLine={{ stroke: BORDER }} tickLine={false} />
              <YAxis tick={{ fill: MUTED, fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={format} width={70} />
              <Tooltip formatter={(v) => format(Number(v))} contentStyle={{ borderRadius: 8, borderColor: BORDER, fontSize: 13 }} />
              <Bar dataKey="value" fill={PLUM} radius={[4, 4, 0, 0]} />
            </BarChart>
          ) : (
            <LineChart data={data} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
              <CartesianGrid stroke={BORDER} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 12 }} axisLine={{ stroke: BORDER }} tickLine={false} />
              <YAxis tick={{ fill: MUTED, fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={format} width={70} />
              <Tooltip formatter={(v) => format(Number(v))} contentStyle={{ borderRadius: 8, borderColor: BORDER, fontSize: 13 }} />
              <Line type="monotone" dataKey="value" stroke={RED} strokeWidth={2.5} dot={{ r: 3, fill: RED }} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

export function BreakdownChart({
  title,
  data,
  format: formatKey,
}: {
  title: string;
  data: { label: string; value: number }[];
  format?: keyof typeof FORMATTERS;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const displayValue = formatKey ? FORMATTERS[formatKey] : (v: number) => String(v);

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-foreground mb-4">{title}</h2>
      {total === 0 ? (
        <p className="text-sm text-muted">No data yet.</p>
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <div style={{ width: 160, height: 160 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="label" innerRadius={45} outerRadius={70} paddingAngle={2}>
                  {data.map((_, i) => (
                    <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 8, borderColor: BORDER, fontSize: 13 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="flex-1 space-y-1.5 text-sm">
            {data.map((d, i) => (
              <li key={d.label} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-muted">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: CHART_PALETTE[i % CHART_PALETTE.length] }}
                  />
                  {d.label}
                </span>
                <span className="font-medium text-foreground tabular-nums">
                  {displayValue(d.value)} ({total > 0 ? Math.round((d.value / total) * 100) : 0}%)
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
