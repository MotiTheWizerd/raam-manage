"use client";

import { CarFront } from "lucide-react";
import { ChartCard } from "./ChartCard";
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
      title="רכבי אורחים היום"
      subtitle="מתחילת היום"
      value={data.count}
      accent="blue"
      delay={delay}
      className="h-56"
    >
      <div className="h-full flex items-center justify-center">
        <CarFront
          className="text-sky-500/20 dark:text-sky-400/15"
          size={120}
          strokeWidth={1.2}
        />
      </div>
    </ChartCard>
  );
}
