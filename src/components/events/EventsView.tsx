"use client";

import { useState } from "react";
import { useSelectedResident } from "@/components/PreferencesProvider";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { KeysTab } from "./KeysTab";
import { PackagesTab } from "./PackagesTab";
import { VehiclesTab } from "./VehiclesTab";

const TABS: TabItem[] = [
  { value: "keys", label: "ניהול מפתחות" },
  { value: "packages", label: "ניהול חבילות" },
  { value: "vehicles", label: "ניהול אורחים" },
];

export function EventsView() {
  const resident = useSelectedResident();
  const [tab, setTab] = useState<string>("keys");

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">אירועים</h1>
        {resident ? (
          <p className="text-sm opacity-70 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              דירה{" "}
              <span className="font-medium text-foreground">
                {resident.apartment_number}
              </span>
            </span>
            {resident.zone_name && (
              <>
                <span aria-hidden="true">·</span>
                <span>{resident.zone_name}</span>
              </>
            )}
            {resident.floor != null && (
              <>
                <span aria-hidden="true">·</span>
                <span>קומה {resident.floor}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>
              דייר נוכחי:{" "}
              <span className="font-medium text-foreground">
                {resident.first_name} {resident.last_name}
              </span>
            </span>
          </p>
        ) : (
          <p className="text-sm opacity-70">
            בחר דייר מהחיפוש כדי לפעול במפתחות. היסטוריה גלובלית מוצגת למטה.
          </p>
        )}
      </header>

      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      <section>
        {tab === "keys" && (
          <KeysTab apartmentId={resident?.apartment_id ?? null} />
        )}
        {tab === "packages" && (
          <PackagesTab
            residentId={resident?.id ?? null}
            apartmentId={resident?.apartment_id ?? null}
          />
        )}
        {tab === "vehicles" && (
          <VehiclesTab
            apartmentId={resident?.apartment_id ?? null}
            residentId={resident?.id ?? null}
          />
        )}
      </section>
    </div>
  );
}
