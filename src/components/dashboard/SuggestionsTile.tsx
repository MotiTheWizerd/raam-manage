"use client";

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "./ChartCard";
import type { SuggestionsData } from "@/lib/dashboard-queries";

const STATUS_LABEL: Record<SuggestionsData["byStatus"][number]["status"], string> = {
  open: "פתוחות",
  in_progress: "בטיפול",
  done: "טופלו",
  wont_fix: "נדחו",
};

const STATUS_COLOR: Record<SuggestionsData["byStatus"][number]["status"], string> = {
  open: "#dc2626",
  in_progress: "#d97706",
  done: "#059669",
  wont_fix: "#6b7280",
};

export function SuggestionsTile({
  data,
  delay = 0,
}: {
  data: SuggestionsData;
  delay?: number;
}) {
  const total = data.byStatus.reduce((acc, b) => acc + b.count, 0);
  const chartData = data.byStatus.map((b) => ({
    name: STATUS_LABEL[b.status],
    value: b.count,
    color: STATUS_COLOR[b.status],
  }));

  return (
    <ChartCard
      title="הצעות ייעול"
      subtitle="פתוחות בראש"
      value={data.open}
      accent="red"
      delay={delay}
      className="h-56"
    >
      {total === 0 ? (
        <div className="h-full flex items-center justify-center text-sm opacity-50">
          אין הצעות עדיין
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={140}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 4, right: 0, left: 8, bottom: 0 }}
          >
            <XAxis
              type="number"
              hide
              reversed
              allowDecimals={false}
              domain={[0, "dataMax"]}
            />
            <YAxis
              type="category"
              dataKey="name"
              orientation="right"
              mirror
              tick={{ fontSize: 12, fill: "#fff", opacity: 0.95 }}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={0}
            />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: "1px solid rgba(0,0,0,0.1)",
                background: "rgba(255,255,255,0.95)",
                color: "#111",
              }}
              cursor={{ fill: "currentColor", opacity: 0.04 }}
              formatter={(v: number) => [v, "כמות"]}
            />
            <Bar dataKey="value" radius={[4, 4, 4, 4]} animationDuration={700}>
              {chartData.map((entry, idx) => (
                <Cell key={idx} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}
