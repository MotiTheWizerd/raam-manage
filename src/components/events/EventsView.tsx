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
  { value: "vehicles", label: "ניהול רכבים" },
];

export function EventsView() {
  const resident = useSelectedResident();
  const [tab, setTab] = useState<string>("keys");

  if (!resident) {
    return (
      <div className="max-w-3xl mx-auto pt-16 text-center space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">אירועים</h1>
        <p className="text-sm opacity-70">
          בחר דייר מהחיפוש כדי לראות אירועים
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">אירועים</h1>
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
      </header>

      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      <section>
        {tab === "keys" && <KeysTab />}
        {tab === "packages" && <PackagesTab />}
        {tab === "vehicles" && <VehiclesTab />}
      </section>
    </div>
  );
}
