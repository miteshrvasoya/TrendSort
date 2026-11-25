"use client";
import type { WaterfallItem } from "@trendbridge/shared";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/** Margin waterfall: price (ex-GST) down to contribution per unit. Costs float from the running total. */
export function WaterfallChart({ items }: { items: WaterfallItem[] }) {
  let running = 0;
  const data = items.map((w) => {
    if (w.kind === "revenue") {
      running = w.value;
      return { name: w.label, base: 0, value: w.value, kind: w.kind };
    }
    if (w.kind === "cost") {
      running -= w.value;
      return { name: w.label, base: Math.max(0, running), value: w.value, kind: w.kind };
    }
    return { name: w.label, base: 0, value: Math.max(0, w.value), kind: w.kind, neg: w.value < 0 };
  });
  const color = (k: string, neg?: boolean) =>
    k === "revenue" ? "#2563eb" : k === "cost" ? "#ea580c" : neg ? "#dc2626" : "#0d9488";
  return (
    <div
      className="h-72"
      role="img"
      aria-label="Margin waterfall from selling price to contribution per unit"
    >
      <ResponsiveContainer>
        <BarChart data={data} margin={{ left: 0, right: 8, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10 }}
            interval={0}
            angle={-30}
            textAnchor="end"
            height={60}
            stroke="hsl(var(--muted-foreground))"
          />
          <YAxis
            tick={{ fontSize: 11 }}
            stroke="hsl(var(--muted-foreground))"
            tickFormatter={(v) => `₹${v}`}
          />
          <Tooltip
            formatter={(v: number, n: string) =>
              n === "base" ? [null, null] : [`₹${Math.round(v)}`, "Amount"]
            }
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
            }}
          />
          <Bar dataKey="base" stackId="a" fill="transparent" />
          <Bar dataKey="value" stackId="a">
            {data.map((d, i) => (
              <Cell key={i} fill={color(d.kind, (d as { neg?: boolean }).neg)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
