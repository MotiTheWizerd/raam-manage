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
  const hasKeys = data.recent.length > 0;

  return (
    <ChartCard
      title="מפתחות בלובי"
      subtitle="פעילים, ניתנים למסירה"
      value={data.count}
      accent="amber"
      delay={delay}
      className="h-56"
    >
      {hasKeys ? (
        <ul className="flex flex-col text-xs">
          {data.recent.map((k) => (
            <li
              key={k.id}
              className="flex items-center justify-between gap-2 py-1.5 border-b border-black/5 dark:border-white/5 last:border-b-0"
            >
              <span className="opacity-50 tabular-nums shrink-0 w-10">
                {k.since ? formatTime(k.since) : "—"}
              </span>
              <span className="truncate flex-1 text-start">
                <span className="font-medium">דירה {k.apartment_number}</span>
                {k.nickname ? (
                  <span className="opacity-50"> · {k.nickname}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="h-full flex items-center justify-center">
          <KeyRound
            className="text-amber-500/20 dark:text-amber-400/15"
            size={120}
            strokeWidth={1.2}
          />
        </div>
      )}
    </ChartCard>
  );
}

function formatTime(iso: string): string {
  const utc = iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
  const d = new Date(utc);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}
