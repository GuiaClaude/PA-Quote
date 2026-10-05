"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatPeso, formatPesoCompact } from "@/lib/domain/money";
import { MONTHS_SHORT } from "@/lib/domain/dates";

const SERIES = [
  { key: "sales", label: "Sales (net of VAT)", color: "var(--color-series-1)" },
  { key: "collections", label: "Collections", color: "var(--color-series-2)" },
  { key: "expenses", label: "Expenses", color: "var(--color-series-3)" },
] as const;

type Point = { month: string; sales: number; collections: number; expenses: number };

const monthLabel = (iso: string) => `${MONTHS_SHORT[Number(iso.slice(5, 7)) - 1]} ’${iso.slice(2, 4)}`;

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { dataKey: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-[12px] shadow-lg">
      <p className="mb-1 font-medium text-ink">{monthLabel(label)}</p>
      {SERIES.map((s) => {
        const p = payload.find((x) => x.dataKey === s.key);
        if (!p) return null;
        return (
          <p key={s.key} className="flex items-center justify-between gap-4 text-ink-2">
            <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-3 rounded" style={{ background: s.color }} />{s.label}</span>
            <span className="num font-medium text-ink">{formatPeso(p.value)}</span>
          </p>
        );
      })}
    </div>
  );
}

export function TrendChart({ data }: { data: Point[] }) {
  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid stroke="var(--color-grid)" strokeDasharray="0" vertical={false} />
          <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11, fill: "#7c7a75" }} axisLine={{ stroke: "#c3c2b7" }} tickLine={false} interval="preserveStartEnd" minTickGap={12} />
          <YAxis tickFormatter={(v: number) => formatPesoCompact(v)} tick={{ fontSize: 11, fill: "#7c7a75" }} axisLine={false} tickLine={false} width={56} />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#c3c2b7", strokeWidth: 1 }} />
          <Legend
            verticalAlign="top"
            align="left"
            height={28}
            iconType="plainline"
            itemSorter={null}
            formatter={(value: string) => <span className="text-[12px] text-ink-2">{SERIES.find((s) => s.key === value)?.label}</span>}
          />
          {SERIES.map((s) => (
            <Line key={s.key} type="linear" dataKey={s.key} stroke={s.color} strokeWidth={2} dot={false} isAnimationActive={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
