"use client";

import { useEffect, useState } from "react";
import {
  getApartmentVehicles,
  type ApartmentVehicleRow,
} from "@/app/events/vehicles-actions";
import { GuestParkingSection } from "./GuestParkingSection";

type Props = {
  apartmentId: number | null;
  residentId: number | null;
};

export function VehiclesTab({ apartmentId, residentId }: Props) {
  const [vehicles, setVehicles] = useState<ApartmentVehicleRow[] | null>(null);

  useEffect(() => {
    if (apartmentId === null) return;
    let active = true;
    getApartmentVehicles(apartmentId).then((rows) => {
      if (active) setVehicles(rows);
    });
    return () => {
      active = false;
    };
  }, [apartmentId]);

  if (apartmentId === null) {
    return (
      <div className="rounded-lg border border-dashed border-black/10 dark:border-white/10 p-8 text-center text-sm opacity-60">
        בחר דייר מהחיפוש כדי לראות את רכבי הדירה
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-sm font-medium opacity-80">רכבי הדירה</h2>
        {vehicles === null ? (
          <div className="text-sm opacity-60 py-6 text-center">
            טוען רכבים...
          </div>
        ) : vehicles.length === 0 ? (
          <div className="rounded-lg border border-dashed border-black/10 dark:border-white/10 p-6 text-center text-sm opacity-60">
            אין רכבים רשומים לדירה זו. הוסף רכבים בעמוד הדירה.
          </div>
        ) : (
          <div className="rounded-lg border border-black/10 dark:border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-black/[0.02] dark:bg-white/[0.03] text-xs uppercase tracking-wide">
                <tr className="border-b border-black/10 dark:border-white/10 opacity-70">
                  <th className="px-4 py-2.5 font-medium text-start">
                    מספר רישוי
                  </th>
                  <th className="px-4 py-2.5 font-medium text-start">דגם</th>
                  <th className="px-4 py-2.5 font-medium text-start">צבע</th>
                  <th className="px-4 py-2.5 font-medium text-start">הערה</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/5">
                {vehicles.map((v) => (
                  <tr
                    key={v.id}
                    className="hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors"
                  >
                    <td
                      className="px-4 py-3 font-medium font-mono"
                      dir="ltr"
                    >
                      {v.license_plate}
                    </td>
                    <td className="px-4 py-3 opacity-80">{v.model ?? "—"}</td>
                    <td className="px-4 py-3 opacity-80">{v.color ?? "—"}</td>
                    <td className="px-4 py-3 opacity-60 text-xs">
                      {v.notes ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {residentId !== null && <GuestParkingSection residentId={residentId} />}
    </div>
  );
}
