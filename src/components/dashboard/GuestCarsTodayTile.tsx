"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ACCENTS, ChartCard } from "./ChartCard";
import type { GuestCarsTodayData } from "@/lib/dashboard-queries";

export function GuestCarsTodayTile({
  data,
  delay = 0,
}: {
  data: GuestCarsTodayData;
  delay?: number;
}) {
  return (
    <ChartCard
      title="אורחים"
      titleHref="/events?tab=vehicles"
      subtitle="7 ימים אחרונים"
      value={data.count}
      accent="blue"
      delay={delay}
      className="h-56"
    >
      <ResponsiveContainer width="100%" height={150}>
        <BarChart data={data.series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.08} />
          <XAxis
            dataKey="label"
            reversed
            tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }}
            tickLine={false}
            axisLine={false}
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
            cursor={{ fill: "currentColor", opacity: 0.04 }}
            labelStyle={{ direction: "rtl" }}
          />
          <Bar
            dataKey="guests"
            name="אורחים"
            fill={ACCENTS.blue.fill}
            radius={[3, 3, 0, 0]}
            animationDuration={700}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
