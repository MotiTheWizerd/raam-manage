"use client";

import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ApartmentLink, ResidentLink } from "@/components/entity-links";
import { useSelectedResident } from "@/components/PreferencesProvider";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { CarsTab } from "./CarsTab";
import { EquipmentTab } from "./EquipmentTab";
import { KeysTab } from "./KeysTab";
import { PackagesTab } from "./PackagesTab";
import { VehiclesTab } from "./VehiclesTab";

const TABS: TabItem[] = [
  { value: "keys", label: "ניהול מפתחות" },
  { value: "packages", label: "ניהול חבילות" },
  { value: "vehicles", label: "ניהול אורחים" },
  { value: "equipment", label: "השאלת ציוד" },
  { value: "cars", label: "רכבים" },
];

const TAB_VALUES = new Set(TABS.map((t) => t.value));

export function EventsView() {
  const resident = useSelectedResident();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<string>(() => {
    const initial = searchParams.get("tab");
    return initial && TAB_VALUES.has(initial) ? initial : "keys";
  });
  const [guestPlatePrefill, setGuestPlatePrefill] = useState<{
    plate: string;
    nonce: number;
  } | null>(null);

  const handleUseCarForGuest = useCallback(
    (plate: string) => {
      const trimmed = plate.trim();
      if (!trimmed) return;
      if (!resident) {
        toast.error("בחר דייר כדי לרשום חניית אורח");
        return;
      }
      setGuestPlatePrefill((prev) => ({
        plate: trimmed,
        nonce: (prev?.nonce ?? 0) + 1,
      }));
      setTab("vehicles");
    },
    [resident]
  );

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">אירועים</h1>
        {resident ? (
          <p className="text-sm opacity-70 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              דירה{" "}
              <ApartmentLink
                id={resident.apartment_id}
                className="font-medium text-foreground"
                isNewTab
              >
                {resident.apartment_number}
              </ApartmentLink>
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
              <ResidentLink
                id={resident.id}
                className="font-medium text-foreground"
                isNewTab
              >
                {resident.first_name} {resident.last_name}
              </ResidentLink>
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
          <KeysTab
            key={resident?.apartment_id ?? "global"}
            apartmentId={resident?.apartment_id ?? null}
          />
        )}
        {tab === "packages" && (
          <PackagesTab
            key={resident?.id ?? "global"}
            residentId={resident?.id ?? null}
            apartmentId={resident?.apartment_id ?? null}
          />
        )}
        {tab === "vehicles" && (
          <VehiclesTab
            key={resident?.id ?? "global"}
            apartmentId={resident?.apartment_id ?? null}
            residentId={resident?.id ?? null}
            guestPlatePrefill={guestPlatePrefill}
          />
        )}
        {tab === "equipment" && (
          <EquipmentTab
            key={resident?.id ?? "global"}
            residentId={resident?.id ?? null}
            apartmentId={resident?.apartment_id ?? null}
          />
        )}
        {tab === "cars" && <CarsTab onUseForGuest={handleUseCarForGuest} />}
      </section>
    </div>
  );
}
