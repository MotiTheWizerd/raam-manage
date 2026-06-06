"use client";

import { Search, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  getApartmentVehicles,
  type ApartmentVehicleRow,
} from "@/app/events/vehicles-actions";
import {
  getGuestParkingPage,
  searchGuestParking,
  type GuestParkingRow,
} from "@/app/events/guest-parking-actions";
import { Input } from "@/components/ui/Input";
import { Pagination } from "@/components/ui/Pagination";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { GuestParkingHistoryList } from "./GuestParkingHistoryList";
import { GuestParkingSection } from "./GuestParkingSection";

const HISTORY_PAGE_SIZE = 10;

type Props = {
  apartmentId: number | null;
  residentId: number | null;
  guestPlatePrefill?: {
    plate: string;
    guestName?: string | null;
    nonce: number;
  } | null;
};

export function VehiclesTab({ apartmentId, residentId, guestPlatePrefill }: Props) {
  const [vehicles, setVehicles] = useState<ApartmentVehicleRow[] | null>(null);
  const [guestRows, setGuestRows] = useState<GuestParkingRow[]>([]);
  const [guestTotal, setGuestTotal] = useState(0);
  const [guestTotalPages, setGuestTotalPages] = useState(1);
  const [guestPage, setGuestPage] = useState(1);
  const [refreshTick, setRefreshTick] = useState(0);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query.trim(), 250);
  const searching = debouncedQuery.length > 0;

  const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);

  useEffect(() => {
    let active = true;
    if (apartmentId !== null) {
      getApartmentVehicles(apartmentId).then((rows) => {
        if (active) setVehicles(rows);
      });
    }
    return () => {
      active = false;
    };
  }, [apartmentId]);

  useEffect(() => {
    let active = true;
    if (searching) {
      searchGuestParking(debouncedQuery, 50).then((rows) => {
        if (!active) return;
        setGuestRows(rows);
        setGuestTotal(rows.length);
        setGuestTotalPages(1);
      });
    } else {
      getGuestParkingPage(residentId, guestPage, HISTORY_PAGE_SIZE).then(
        (result) => {
          if (!active) return;
          setGuestRows(result.rows);
          setGuestTotal(result.total);
          setGuestTotalPages(result.totalPages);
          if (result.page !== guestPage) setGuestPage(result.page);
        }
      );
    }
    return () => {
      active = false;
    };
  }, [residentId, refreshTick, searching, debouncedQuery, guestPage]);

  return (
    <div className="space-y-6">
      {apartmentId !== null && (
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
      )}

      <GuestParkingSection
        residentId={residentId}
        onCreated={refresh}
        prefill={guestPlatePrefill}
      />

      <section className="space-y-3">
        <div className="relative max-w-sm">
          <Search
            size={14}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-3 opacity-50"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש לפי שם אורח או מספר רישוי"
            className="ps-9 pe-9"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="נקה חיפוש"
              className="absolute top-1/2 -translate-y-1/2 end-2 inline-flex items-center justify-center h-6 w-6 rounded-full opacity-60 hover:opacity-100 hover:bg-black/[0.05] dark:hover:bg-white/[0.06] transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <GuestParkingHistoryList
          rows={guestRows}
          showApartment={searching || residentId === null}
          onDeleted={refresh}
        />

        {!searching && (
          <Pagination
            page={guestPage}
            totalPages={guestTotalPages}
            pageSize={HISTORY_PAGE_SIZE}
            total={guestTotal}
            onPageChange={setGuestPage}
          />
        )}
      </section>
    </div>
  );
}
