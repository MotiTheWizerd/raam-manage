"use client";

import { Car } from "lucide-react";
import {
  deleteGuestParking,
  type GuestParkingRow,
} from "@/app/events/guest-parking-actions";
import { useIsManager } from "@/components/AuthProvider";
import { DeleteEventButton } from "./DeleteEventButton";

type Props = {
  rows: GuestParkingRow[];
  showApartment?: boolean;
  onDeleted: () => void;
};

function formatTimestamp(iso: string) {
  const d = new Date(iso.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function GuestParkingHistoryList({
  rows,
  showApartment = false,
  onDeleted,
}: Props) {
  const isManager = useIsManager();
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium opacity-80">חניית אורחים אחרונה</h2>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-black/10 dark:border-white/10 p-6 text-center text-sm opacity-60">
          אין רכבי אורחים רשומים
        </div>
      ) : (
        <ul className="rounded-lg border border-black/10 dark:border-white/10 divide-y divide-black/5 dark:divide-white/5 overflow-hidden">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-start gap-3 px-4 py-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors"
            >
              <div className="shrink-0 mt-0.5 inline-flex items-center justify-center h-7 w-7 rounded-full bg-sky-500/15 text-sky-700 dark:text-sky-300">
                <Car size={14} aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm">
                  {showApartment && r.apartment_number && (
                    <span className="text-xs font-medium opacity-70">
                      דירה {r.apartment_number} ·
                    </span>
                  )}
                  {r.guest_name && (
                    <span className="font-medium">{r.guest_name}</span>
                  )}
                  {r.car_plate && (
                    <span className="font-mono opacity-80" dir="ltr">
                      {r.car_plate}
                    </span>
                  )}
                  <span className="text-xs opacity-70">
                    {formatTimestamp(r.created_at)}
                  </span>
                </div>
                <div className="mt-0.5 text-xs opacity-70 flex flex-wrap gap-x-2">
                  {r.resident_full_name && (
                    <span>
                      אצל:{" "}
                      {r.apartment_number && (
                        <span className="font-medium">
                          דירה {r.apartment_number}
                        </span>
                      )}
                      {r.apartment_number && " · "}
                      {r.resident_full_name}
                    </span>
                  )}
                  {r.lobbyist_name && (
                    <span>· פקיד: {r.lobbyist_name}</span>
                  )}
                </div>
              </div>
              {isManager && (
                <div className="shrink-0 self-center">
                  <DeleteEventButton
                    id={r.id}
                    action={deleteGuestParking}
                    successMessage="הרישום נמחק"
                    confirmTitle="מחיקת חניית אורח"
                    confirmDescription="האם למחוק את חניית האורח? פעולה זו אינה ניתנת לביטול."
                    ariaLabel="מחק חניית אורח"
                    onDeleted={onDeleted}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
