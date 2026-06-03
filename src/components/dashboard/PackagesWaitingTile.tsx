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
import type { PackagesWaitingData } from "@/lib/dashboard-queries";

export function PackagesWaitingTile({
  data,
  delay = 0,
}: {
  data: PackagesWaitingData;
  delay?: number;
}) {
  return (
    <ChartCard
      title="חבילות ממתינות לאיסוף"
      titleHref="/events?tab=packages"
      subtitle="7 ימים אחרונים"
      value={data.pending}
      accent="red"
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
            dataKey="incoming"
            name="נכנסו"
            fill={ACCENTS.red.fill}
            radius={[3, 3, 0, 0]}
            animationDuration={700}
          />
          <Bar
            dataKey="delivered"
            name="נמסרו"
            fill={ACCENTS.emerald.fill}
            radius={[3, 3, 0, 0]}
            animationDuration={700}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
