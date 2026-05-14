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
  const hasEvents = data.recent.length > 0;

  return (
    <ChartCard
      title="אורחים היום"
      subtitle="מתחילת היום"
      value={data.count}
      accent="blue"
      delay={delay}
      className="h-56"
    >
      {hasEvents ? (
        <ul className="flex flex-col text-xs">
          {data.recent.map((ev) => (
            <li
              key={ev.id}
              className="flex items-center justify-between gap-2 py-1.5 border-b border-black/5 dark:border-white/5 last:border-b-0"
            >
              <span className="opacity-50 tabular-nums shrink-0 w-10">
                {formatTime(ev.created_at)}
              </span>
              <span className="truncate flex-1 text-start">
                {ev.guest_name || "—"}
                {ev.apartment_number ? (
                  <span className="opacity-50"> · דירה {ev.apartment_number}</span>
                ) : null}
              </span>
              <span className="opacity-70 tabular-nums shrink-0 font-mono">
                {ev.car_plate || "—"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="h-full flex items-center justify-center">
          <CarFront
            className="text-sky-500/20 dark:text-sky-400/15"
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
