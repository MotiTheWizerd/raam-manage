"use client";

import { Car, Plus } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  createGuestParking,
  getResidentGuestParking,
  type GuestParkingFormState,
  type GuestParkingRow,
} from "@/app/events/guest-parking-actions";
import { useActiveLobbyist } from "@/components/PreferencesProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useFormToasts } from "@/lib/hooks/useFormToasts";

const initialState: GuestParkingFormState = {};

type Props = {
  residentId: number;
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

export function GuestParkingSection({ residentId }: Props) {
  const [rows, setRows] = useState<GuestParkingRow[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);
  const [state, action, pending] = useActionState(
    createGuestParking,
    initialState
  );
  const formRef = useRef<HTMLFormElement>(null);
  const activeLobbyist = useActiveLobbyist();

  useFormToasts(state, "נוסף");

  useEffect(() => {
    let active = true;
    getResidentGuestParking(residentId).then((data) => {
      if (active) setRows(data);
    });
    return () => {
      active = false;
    };
  }, [residentId, refreshTick]);

  useEffect(() => {
    if (!state.submittedAt) return;
    formRef.current?.reset();
    Promise.resolve().then(() => setRefreshTick((t) => t + 1));
  }, [state.submittedAt]);

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium opacity-80">חניית אורחים</h2>

      <form
        ref={formRef}
        action={action}
        className="flex flex-wrap items-end gap-2"
      >
        <input type="hidden" name="resident_id" value={residentId} />

        <div className="flex flex-col gap-1">
          <label
            htmlFor="guest-plate"
            className="text-xs opacity-70"
          >
            מספר רישוי
          </label>
          <Input
            id="guest-plate"
            name="car_plate"
            required
            placeholder="123-45-678"
            dir="ltr"
            className="w-40 text-end font-mono"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="guest-lobbyist"
            className="text-xs opacity-70"
          >
            סדרן
          </label>
          <Input
            id="guest-lobbyist"
            name="lobbyist_name"
            required
            defaultValue={activeLobbyist?.lobbyist_name ?? ""}
            placeholder="שם הסדרן"
            className="w-44"
          />
        </div>

        <Button type="submit" size="sm" disabled={pending}>
          <Plus size={14} />
          {pending ? "שומר..." : "הוסף"}
        </Button>
      </form>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-black/10 dark:border-white/10 p-4 text-center text-sm opacity-60">
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
                  <span
                    className="font-mono font-medium"
                    dir="ltr"
                  >
                    {r.car_plate}
                  </span>
                  <span className="text-xs opacity-70">
                    {formatTimestamp(r.created_at)}
                  </span>
                </div>
                <div className="mt-0.5 text-xs opacity-70 flex flex-wrap gap-x-2">
                  {r.resident_full_name && (
                    <span>אצל: {r.resident_full_name}</span>
                  )}
                  {r.apartment_number && (
                    <span>· דירה {r.apartment_number}</span>
                  )}
                  {r.lobbyist_name && (
                    <span>· סדרן: {r.lobbyist_name}</span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
