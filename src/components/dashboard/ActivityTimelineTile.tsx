"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ACCENTS, ChartCard } from "./ChartCard";
import type { ActivityTimelineData } from "@/lib/dashboard-queries";

export function ActivityTimelineTile({
  data,
  delay = 0,
}: {
  data: ActivityTimelineData;
  delay?: number;
}) {
  const total = data.series.reduce(
    (acc, p) => acc + p.keys + p.packages + p.guests,
    0
  );

  return (
    <ChartCard
      title="פעילות היום"
      subtitle="מפתחות, חבילות ואורחים — לפי שעה"
      value={total}
      accent="violet"
      delay={delay}
      className="h-72"
    >
      <ResponsiveContainer width="100%" height={210}>
        <AreaChart
          data={data.series}
          margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="g-keys" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENTS.amber.fill} stopOpacity={0.5} />
              <stop offset="100%" stopColor={ACCENTS.amber.fill} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="g-pkgs" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENTS.red.fill} stopOpacity={0.5} />
              <stop offset="100%" stopColor={ACCENTS.red.fill} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="g-guests" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENTS.blue.fill} stopOpacity={0.5} />
              <stop offset="100%" stopColor={ACCENTS.blue.fill} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.08} />
          <XAxis
            dataKey="hour"
            reversed
            tick={{ fontSize: 10, fill: "currentColor", opacity: 0.6 }}
            tickLine={false}
            axisLine={false}
            interval={2}
          />
          <YAxis
            allowDecimals={false}
            orientation="right"
            tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }}
            tickLine={false}
            axisLine={false}
            width={28}
          />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: "1px solid rgba(0,0,0,0.1)",
              background: "rgba(255,255,255,0.95)",
              color: "#111",
            }}
            cursor={{ stroke: "currentColor", opacity: 0.15 }}
            labelStyle={{ direction: "rtl" }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 4 }}
            iconType="circle"
          />
          <Area
            type="monotone"
            dataKey="keys"
            name="מפתחות"
            stroke={ACCENTS.amber.stroke}
            fill="url(#g-keys)"
            strokeWidth={2}
            animationDuration={900}
          />
          <Area
            type="monotone"
            dataKey="packages"
            name="חבילות"
            stroke={ACCENTS.red.stroke}
            fill="url(#g-pkgs)"
            strokeWidth={2}
            animationDuration={900}
          />
          <Area
            type="monotone"
            dataKey="guests"
            name="אורחים"
            stroke={ACCENTS.blue.stroke}
            fill="url(#g-guests)"
            strokeWidth={2}
            animationDuration={900}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
