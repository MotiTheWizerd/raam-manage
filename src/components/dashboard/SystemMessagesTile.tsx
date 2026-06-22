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
import type { SystemMessagesData } from "@/lib/dashboard-queries";

const PRIORITY_LABEL: Record<SystemMessagesData["byPriority"][number]["priority"], string> = {
  high: "דחוף",
  med: "רגיל",
  low: "מידע",
};

const PRIORITY_COLOR: Record<SystemMessagesData["byPriority"][number]["priority"], string> = {
  high: "#dc2626",
  med: "#d97706",
  low: "#0284c7",
};

export function SystemMessagesTile({
  data,
  delay = 0,
}: {
  data: SystemMessagesData;
  delay?: number;
}) {
  const chartData = data.byPriority.map((b) => ({
    name: PRIORITY_LABEL[b.priority],
    value: b.count,
    color: PRIORITY_COLOR[b.priority],
  }));

  return (
    <ChartCard
      title="הודעות לובי פעילות"
      subtitle="לפי דחיפות"
      value={data.total}
      accent="amber"
      delay={delay}
      className="h-56"
    >
      {data.total === 0 ? (
        <div className="h-full flex items-center justify-center text-sm opacity-50">
          אין הודעות לובי פעילות
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
              formatter={(v) => [Number(v ?? 0), "כמות"]}
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
