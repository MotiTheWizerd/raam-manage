"use client";

import { KeyRound } from "lucide-react";
import { ChartCard } from "./ChartCard";
import type { KeysInLobbyData } from "@/lib/dashboard-queries";

export function KeysInLobbyTile({
  data,
  delay = 0,
}: {
  data: KeysInLobbyData;
  delay?: number;
}) {
  return (
    <ChartCard
      title="מפתחות בלובי"
      subtitle="פעילים, ניתנים למסירה"
      value={data.count}
      accent="amber"
      delay={delay}
      className="h-56"
    >
      <div className="h-full flex items-center justify-center">
        <KeyRound
          className="text-amber-500/20 dark:text-amber-400/15"
          size={120}
          strokeWidth={1.2}
        />
      </div>
    </ChartCard>
  );
}
