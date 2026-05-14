"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ACCENTS, ChartCard } from "./ChartCard";
import type { WhatsAppVolumeData } from "@/lib/dashboard-queries";

export function WhatsAppVolumeTile({
  data,
  delay = 0,
}: {
  data: WhatsAppVolumeData;
  delay?: number;
}) {
  return (
    <ChartCard
      title="ווטסאפ — נפח הודעות"
      subtitle="7 ימים אחרונים"
      value={data.total}
      accent="emerald"
      delay={delay}
      className="h-72"
    >
      <ResponsiveContainer width="100%" height={210}>
        <LineChart
          data={data.series}
          margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
        >
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
            cursor={{ stroke: "currentColor", opacity: 0.15 }}
            labelStyle={{ direction: "rtl" }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 4 }}
            iconType="circle"
          />
          <Line
            type="monotone"
            dataKey="sent"
            name="נשלחו"
            stroke={ACCENTS.emerald.stroke}
            strokeWidth={2.5}
            dot={{ r: 3, strokeWidth: 0, fill: ACCENTS.emerald.fill }}
            activeDot={{ r: 5 }}
            animationDuration={900}
          />
          <Line
            type="monotone"
            dataKey="received"
            name="התקבלו"
            stroke={ACCENTS.blue.stroke}
            strokeWidth={2.5}
            dot={{ r: 3, strokeWidth: 0, fill: ACCENTS.blue.fill }}
            activeDot={{ r: 5 }}
            animationDuration={900}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
