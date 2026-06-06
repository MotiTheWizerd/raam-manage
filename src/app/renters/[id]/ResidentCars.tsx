"use client";

import { Car } from "lucide-react";
import { useEffect, useState } from "react";
import {
  getRegisteredCarsForApartment,
  type RegisteredCarRow,
} from "@/app/settings/registered-cars-actions";

function fullName(r: RegisteredCarRow): string {
  const name = [r.firstName, r.lastName].filter(Boolean).join(" ").trim();
  return name || "—";
}

// Read-only list of the cars registered to this resident's apartment in the
// parking (SLPR) system. Visible to everyone; never editable.
export function ResidentCars({
  apartmentNumber,
}: {
  apartmentNumber: string | null;
}) {
  const [cars, setCars] = useState<RegisteredCarRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!apartmentNumber) {
      setCars([]);
      return;
    }
    let active = true;
    setCars(null);
    setFailed(false);
    getRegisteredCarsForApartment(apartmentNumber)
      .then((rows) => active && setCars(rows))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [apartmentNumber]);

  // No apartment, or the parking system is unreachable — stay quiet.
  if (!apartmentNumber || failed) return null;

  return (
    <section className="space-y-3 border-t border-black/10 dark:border-white/10 pt-5">
      <div className="flex items-center gap-2">
        <Car size={16} className="opacity-70" aria-hidden="true" />
        <h2 className="text-sm font-medium opacity-80">
          רכבים רשומים בדירה {apartmentNumber}
        </h2>
        {cars && cars.length > 0 && (
          <span className="text-xs opacity-50 tabular-nums">({cars.length})</span>
        )}
      </div>

      {cars === null ? (
        <p className="text-sm opacity-50">טוען רכבים...</p>
      ) : cars.length === 0 ? (
        <p className="text-sm opacity-60">
          אין רכבים רשומים בדירה זו במערכת החניון
        </p>
      ) : (
        <ul className="divide-y divide-black/5 dark:divide-white/5 rounded-lg border border-black/10 dark:border-white/10 overflow-hidden">
          {cars.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
            >
              <div className="min-w-0">
                <div className="font-mono font-semibold" dir="ltr">
                  {c.plate || "—"}
                </div>
                {c.additionalPlates && (
                  <div className="mt-0.5 text-[11px] opacity-50" dir="ltr">
                    + {c.additionalPlates}
                  </div>
                )}
              </div>
              <div className="text-end">
                <div className="opacity-85">{fullName(c)}</div>
                {c.phone && (
                  <div className="text-xs opacity-50" dir="ltr">
                    {c.phone}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] opacity-40">
        מקור: מערכת זיהוי לוחיות (SLPR) — לקריאה בלבד
      </p>
    </section>
  );
}
