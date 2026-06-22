"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageSquare, PhoneCall } from "lucide-react";
import { ApartmentLink, ResidentLink } from "@/components/entity-links";
import { useSelectedResident } from "@/components/PreferencesProvider";
import { getApartmentCallPolicy } from "@/app/events/actions";
import { type CallPolicy } from "@/lib/call-policy";
import { cn } from "@/lib/cn";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { CarsTab } from "./CarsTab";
import { EquipmentTab } from "./EquipmentTab";
import { KeysTab } from "./KeysTab";
import { KnownGuestsTab } from "./KnownGuestsTab";
import { PackagesTab } from "./PackagesTab";
import { VehiclesTab } from "./VehiclesTab";

const TABS: TabItem[] = [
  { value: "vehicles", label: "ניהול אורחים" },
  { value: "cars", label: "ניהול רכבים" },
  { value: "packages", label: "ניהול חבילות" },
  { value: "keys", label: "ניהול מפתחות" },
  { value: "equipment", label: "השאלת ציוד" },
  { value: "known-guests", label: "אורחים מוכרים" },
];

const TAB_VALUES = new Set(TABS.map((t) => t.value));

export function EventsView() {
  const resident = useSelectedResident();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<string>(() => {
    const initial = searchParams.get("tab");
    return initial && TAB_VALUES.has(initial) ? initial : "vehicles";
  });

  // Keep the active tab mirrored in the URL so it's addressable: the global
  // car notifier reads ?tab to suppress itself on the cars tab, and clicking a
  // popup navigates here with ?tab=cars.
  const selectTab = useCallback(
    (value: string) => {
      setTab(value);
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", value);
      router.replace(`/events?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  // React to external URL changes (e.g. a notification click while already on
  // /events) so the tab follows the address bar.
  useEffect(() => {
    const urlTab = searchParams.get("tab");
    if (urlTab && TAB_VALUES.has(urlTab) && urlTab !== tab) setTab(urlTab);
  }, [searchParams, tab]);

  // Fetch the "must call the resident" flag fresh per apartment so the warning
  // banner is never stale (the persisted selection could lag a flag change).
  const apartmentId = resident?.apartment_id ?? null;
  const [callPolicy, setCallPolicy] = useState<CallPolicy>("none");
  useEffect(() => {
    if (apartmentId === null) {
      setCallPolicy("none");
      return;
    }
    let active = true;
    getApartmentCallPolicy(apartmentId).then((policy) => {
      if (active) setCallPolicy(policy);
    });
    return () => {
      active = false;
    };
  }, [apartmentId]);

  const [guestPlatePrefill, setGuestPlatePrefill] = useState<{
    plate: string;
    guestName?: string | null;
    nonce: number;
  } | null>(null);

  const handleUseCarForGuest = useCallback(
    (plate: string, guestName?: string | null) => {
      const trimmed = plate.trim();
      if (!trimmed) return;
      setGuestPlatePrefill((prev) => ({
        plate: trimmed,
        guestName: guestName?.trim() || null,
        nonce: (prev?.nonce ?? 0) + 1,
      }));
      selectTab("vehicles");
    },
    [selectTab]
  );

  // Per-policy banner shown above the tabs when a resident is selected.
  const callBanner =
    resident && callPolicy !== "none"
      ? callPolicy === "call"
        ? {
            Icon: PhoneCall,
            box: "border-red-500/50 bg-red-500/10 text-red-800 dark:text-red-200",
            iconColor: "text-red-600 dark:text-red-400",
            title: "חובה להתקשר לדייר לפני העלאת שליח או אורח",
            sub: `דירה ${resident.apartment_number} — יש לקבל אישור טלפוני מהדייר לפני שמעלים שליח או אורח.`,
          }
        : {
            Icon: MessageSquare,
            box: "border-sky-500/50 bg-sky-500/10 text-sky-800 dark:text-sky-200",
            iconColor: "text-sky-600 dark:text-sky-400",
            title: "יש לעדכן את הדייר בהודעה לפני העלאת שליח או אורח",
            sub: `דירה ${resident.apartment_number} — יש לשלוח הודעה לדייר לפני שמעלים שליח או אורח.`,
          }
      : null;

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

      {callBanner && (
        <div
          role="alert"
          className={cn(
            "flex items-center gap-3 rounded-lg border p-4",
            callBanner.box
          )}
        >
          <callBanner.Icon
            size={20}
            aria-hidden="true"
            className={cn("shrink-0", callBanner.iconColor)}
          />
          <div className="space-y-0.5">
            <p className="text-sm font-semibold">{callBanner.title}</p>
            <p className="text-xs opacity-80">{callBanner.sub}</p>
          </div>
        </div>
      )}

      <Tabs tabs={TABS} value={tab} onChange={selectTab} />

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
        {tab === "known-guests" && <KnownGuestsTab />}
      </section>
    </div>
  );
}
