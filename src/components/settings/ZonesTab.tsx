"use client";

import { useEffect, useState } from "react";
import { AddZoneButton } from "@/app/zones/AddZoneButton";
import { EditZoneButton } from "@/app/zones/EditZoneButton";
import { getAllZones, type ZoneRow } from "@/app/zones/actions";
import { useIsManager } from "@/components/AuthProvider";
import { onZonesChanged } from "@/lib/zones-events";

export function ZonesTab() {
  const isManager = useIsManager();
  const [zones, setZones] = useState<ZoneRow[] | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let active = true;
    getAllZones().then((rows) => {
      if (active) setZones(rows);
    });
    return () => {
      active = false;
    };
  }, [refreshTick]);

  useEffect(() => {
    const bump = () => setRefreshTick((t) => t + 1);
    window.addEventListener("focus", bump);
    const unsubscribe = onZonesChanged(bump);
    return () => {
      window.removeEventListener("focus", bump);
      unsubscribe();
    };
  }, []);

  if (zones === null) {
    return <div className="text-sm opacity-60 py-8 text-center">טוען...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium opacity-80">
          {zones.length === 0 ? "אין אזורים" : `${zones.length} אזורים`}
        </h2>
        {isManager && <AddZoneButton />}
      </div>

      {zones.length === 0 ? (
        <div className="rounded-lg border border-dashed border-black/10 dark:border-white/10 p-8 text-center text-sm opacity-60">
          אין אזורים עדיין. הוסף את האזור הראשון.
        </div>
      ) : (
        <ul className="border border-black/10 dark:border-white/10 rounded-lg divide-y divide-black/10 dark:divide-white/10">
          {zones.map((z) => (
            <li
              key={z.id}
              className="flex items-center justify-between px-4 py-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors"
            >
              <span>{z.name}</span>
              <EditZoneButton zone={z} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
