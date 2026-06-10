"use client";

import { Building2, ImageIcon, RefreshCw, UserRound, UserRoundPlus } from "lucide-react";
import NextImage from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  forgetResidentGuest,
  getRecentCarEvents,
  type CarBuilding,
  type SlprCarEventRow,
} from "@/app/events/cars-actions";
import { Button } from "@/components/ui/Button";
import { DeleteEventButton } from "@/components/events/DeleteEventButton";
import { Pagination } from "@/components/ui/Pagination";
import { cn } from "@/lib/cn";

const AUTO_REFRESH_MS = 10000;
const PAGE_SIZE = 10;

function formatCamera(cameraId: number | null): string {
  if (cameraId === null) return "-";
  if (cameraId === 1) return "Entry";
  if (cameraId === 3) return "Entry1";
  return `מצלמה ${cameraId}`;
}

function statusClassName(status: string): string {
  return status.toUpperCase() === "VALID"
    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
    : "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300";
}

/**
 * Label + colour for the building tag. "boutique" is our lane (cam-3 confirmed);
 * "manhattan" is the neighbour lane that only the outdoor gate camera sees.
 */
function buildingTag(building: CarBuilding): { text: string; className: string } {
  return building === "boutique"
    ? {
        text: "בוטיק",
        className:
          "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
      }
    : {
        text: "מנהטן",
        className:
          "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
      };
}

function imageUrl(path: string | null): string | null {
  if (!path) return null;
  return `/api/slpr/image?path=${encodeURIComponent(path)}`;
}

/**
 * Compact "DD/MM HH:MM" for the table — drops year and seconds. The full
 * timestamp stays available via the cell's title (hover). Falls back to the
 * raw value if the shape is unexpected.
 */
function formatEventTime(raw: string): string {
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!match) return raw;
  const [, , month, day, hour, minute] = match;
  return `${day}/${month} ${hour}:${minute}`;
}

/**
 * Like formatEventTime but keeps the year — used only in the visit-history
 * panel, where "first seen" can be more than a year ago and the bare
 * "DD/MM" would be ambiguous.
 */
function formatEventTimeWithYear(raw: string): string {
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!match) return raw;
  const [, year, month, day, hour, minute] = match;
  return `${day}/${month}/${year} ${hour}:${minute}`;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[4.75rem_1fr] items-center gap-2 text-xs">
      <span className="text-foreground/60">{label}</span>
      <span className="min-h-7 rounded-md border border-black/10 bg-black/[0.02] px-2 py-1.5 dark:border-white/10 dark:bg-white/[0.04]">
        {value || "-"}
      </span>
    </div>
  );
}

function CarDetails({
  row,
  onForgetGuest,
}: {
  row: SlprCarEventRow | null;
  onForgetGuest: () => void;
}) {
  const src = imageUrl(row?.imagePath ?? null);

  if (!row) {
    return (
      <aside className="rounded-lg border border-dashed border-black/10 p-6 text-center text-sm opacity-60 dark:border-white/10">
        בחר רכב מהרשימה כדי לראות פרטים
      </aside>
    );
  }

  return (
    <aside className="rounded-lg border border-black/10 bg-black/[0.015] p-3 dark:border-white/10 dark:bg-white/[0.025]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">מידע בזמן אמת</h3>
          <p className="text-xs text-foreground/60" dir="ltr">
            #{row.id}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(() => {
            const tag = buildingTag(row.building);
            return (
              <span
                className={cn(
                  "inline-flex h-7 items-center rounded-full px-3 text-xs font-semibold",
                  tag.className
                )}
              >
                {tag.text}
              </span>
            );
          })()}
          <span
            className={cn(
              "inline-flex h-7 items-center rounded-full px-3 text-xs font-semibold",
              statusClassName(row.status)
            )}
            dir="ltr"
          >
            {row.status && row.status.toUpperCase() != "INVALID" ?  "מאושר" : "לא מאושר"}
          </span>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-[1fr_4.5rem] gap-2">
        <div className="space-y-2">
          <DetailRow label="מספר רישוי" value={<span dir="ltr">{row.plate}</span>} />
          <DetailRow label="תאריך" value={<span dir="ltr">{row.eventTime}</span>} />
          <DetailRow label="מצלמה" value={formatCamera(row.cameraId)} />
          <DetailRow
            label="לקוח"
            value={row.customerId && row.customerId > 0 ? row.customerId : "-"}
          />
        </div>
        <div className="flex h-[6.5rem] items-center justify-center rounded-md border border-black/10 bg-zinc-100 dark:border-white/10 dark:bg-zinc-900">
          <UserRound size={42} className="text-zinc-500" />
        </div>
      </div>

      {row.guest && (
        <div className="mb-3 flex items-start justify-between gap-2 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs dark:border-orange-900 dark:bg-orange-950/30">
          <div>
            <div className="font-semibold text-orange-700 dark:text-orange-300">
              אורח מזוהה: {row.guest.guestName || "אורח ידוע"}
            </div>
            {(row.guest.apartmentNumber || row.guest.residentName) && (
              <div className="mt-0.5 opacity-70">
                {row.guest.apartmentNumber ? `דירה ${row.guest.apartmentNumber}` : ""}
                {row.guest.apartmentNumber && row.guest.residentName ? " · " : ""}
                {row.guest.residentName ?? ""}
              </div>
            )}
          </div>
          <DeleteEventButton
            id={row.guest.id}
            action={forgetResidentGuest}
            successMessage="האורח הוסר מהזיהוי"
            confirmTitle="הסרת אורח מזוהה"
            confirmDescription={`להסיר את "${
              row.guest.guestName || "האורח"
            }" מזיהוי לוחית ${row.plate}? הרכב לא יזוהה אוטומטית יותר.`}
            ariaLabel="הסר אורח מזוהה"
            onDeleted={onForgetGuest}
          />
        </div>
      )}

      {!row.guest && row.registeredOwner && (
        <div className="mb-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs dark:border-sky-900 dark:bg-sky-950/30">
          <div className="font-semibold text-sky-700 dark:text-sky-300">
            רכב רשום: {row.registeredOwner.name}
          </div>
          {row.registeredOwner.apartment && (
            <div className="mt-0.5 opacity-70">
              דירה {row.registeredOwner.apartment}
            </div>
          )}
        </div>
      )}

      {row.visitStats && (
        <div className="mb-3 rounded-md border border-black/10 px-3 py-2 text-xs dark:border-white/10">
          <div className="mb-1.5 font-semibold opacity-80">היסטוריית כניסות</div>
          <div className="grid grid-cols-[1fr_auto] gap-y-1">
            <span className="opacity-60">סה״כ כניסות</span>
            <span className="text-end font-medium tabular-nums">
              {row.visitStats.visits}
            </span>
            {row.visitStats.firstSeen && (
              <>
                <span className="opacity-60">נראה לראשונה</span>
                <span className="text-end" dir="ltr">
                  {formatEventTimeWithYear(row.visitStats.firstSeen)}
                </span>
              </>
            )}
            {row.visitStats.lastSeen && (
              <>
                <span className="opacity-60">נראה לאחרונה</span>
                <span className="text-end" dir="ltr">
                  {formatEventTimeWithYear(row.visitStats.lastSeen)}
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {src ? (
        <div className="space-y-2">
          <div className="mx-auto h-8 max-w-40 overflow-hidden rounded border border-black/10 bg-black dark:border-white/10">
            <NextImage
              src={src}
              alt={`לוחית רישוי ${row.plate}`}
              width={192}
              height={32}
              unoptimized
              className="h-full w-full object-cover"
            />
          </div>
          <div className="overflow-hidden rounded-md border border-black/10 bg-black dark:border-white/10">
            <NextImage
              src={src}
              alt={`תמונת רכב ${row.plate}`}
              width={560}
              height={360}
              unoptimized
              className="max-h-[240px] w-full object-contain"
            />
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-black/10 p-6 text-center text-sm opacity-60 dark:border-white/10">
          אין תמונה לאירוע הזה
        </div>
      )}

      <div className="mt-2 truncate rounded-md border border-black/10 px-2 py-1.5 text-[11px] opacity-70 dark:border-white/10" dir="ltr">
        {row.imagePath || "-"}
      </div>
    </aside>
  );
}

type CarsTabProps = {
  onUseForGuest: (plate: string, guestName?: string | null) => void;
};

export function CarsTab({ onUseForGuest }: CarsTabProps) {
  const [rows, setRows] = useState<SlprCarEventRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  // When on, show only cars that actually entered our building (בוטיק) and drop
  // the now-redundant building column. Default OFF — show all lanes (incl. the
  // neighbour מנהטן); press the toggle to narrow to our own (בוטיק) cars.
  const [boutiqueOnly, setBoutiqueOnly] = useState(false);
  // Tracks the newest row id we've seen so we can auto-follow new arrivals
  // without overriding a manual selection between them.
  const lastTopIdRef = useRef<number | null>(null);
  // Mirrors `page` so the live-refresh callback can read it without becoming
  // a dependency (which would tear down and rebuild the refresh interval).
  const pageRef = useRef(1);
  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  // The rows actually rendered — filtered to בוטיק when the toggle is on.
  const visibleRows = useMemo(
    () => (boutiqueOnly ? rows.filter((row) => row.building === "boutique") : rows),
    [rows, boutiqueOnly]
  );

  const selectedRow = useMemo(
    () =>
      visibleRows.find((row) => row.id === selectedId) ?? visibleRows[0] ?? null,
    [visibleRows, selectedId]
  );

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const pagedRows = useMemo(
    () => visibleRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [visibleRows, page]
  );

  // Keep the current page in range as the feed shrinks (old rows fall off).
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const load = useCallback(async () => {
    try {
      setError(null);
      const result = await getRecentCarEvents(3);
      setRows(result);
      const newestId = result[0]?.id ?? null;
      const isNewCar = newestId !== null && newestId !== lastTopIdRef.current;
      lastTopIdRef.current = newestId;
      setSelectedId((current) => {
        // A new car entered -> auto-jump the details to it, but only while
        // viewing the live (first) page so we don't yank a user browsing history.
        if (isNewCar && pageRef.current === 1) return newestId;
        // Otherwise keep the manual selection as long as it's still present.
        if (current && result.some((row) => row.id === current)) return current;
        return newestId;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "טעינת הרכבים נכשלה");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function loadIfActive() {
      if (!active) return;
      await load();
    }

    loadIfActive();
    const intervalId = window.setInterval(loadIfActive, AUTO_REFRESH_MS);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium opacity-80">רכבים אחרונים</h2>
          <p className="text-xs opacity-60">3 הימים האחרונים · מתעדכן אוטומטית כל 10 שניות</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={boutiqueOnly ? "primary" : "outline"}
            size="sm"
            onClick={() => {
              setBoutiqueOnly((on) => !on);
              setPage(1);
            }}
            aria-pressed={boutiqueOnly}
            title="הצג רק רכבים שנכנסו לבניין שלנו (הסתר מנהטן)"
          >
            <Building2 size={14} />
            רק בוטיק
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setLoading(true);
              load();
            }}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            רענון
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-950 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_18rem] 2xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-3">
        <div className="overflow-hidden rounded-lg border border-black/10 dark:border-white/10">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-xs">
              <thead className="bg-black/[0.02] text-[11px] uppercase tracking-wide dark:bg-white/[0.03]">
                <tr className="border-b border-black/10 opacity-70 dark:border-white/10">
                  <th className="px-3 py-2 font-medium text-start">מספר רישוי</th>
                  <th className="px-3 py-2 font-medium text-start">תאריך</th>
                  <th className="px-3 py-2 font-medium text-start">סטטוס</th>
                  {!boutiqueOnly && (
                    <th className="px-3 py-2 font-medium text-start">בניין</th>
                  )}
                  <th className="px-3 py-2 font-medium text-start">אורח מזוהה</th>
                  <th className="px-3 py-2 font-medium text-center">רישום אורח</th>
                  <th className="px-3 py-2 font-medium text-center">פרטים</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/5">
                {loading && rows.length === 0 ? (
                  <tr>
                    <td
                      className="px-3 py-7 text-center opacity-60"
                      colSpan={boutiqueOnly ? 6 : 7}
                    >
                      טוען רכבים...
                    </td>
                  </tr>
                ) : visibleRows.length === 0 ? (
                  <tr>
                    <td
                      className="px-3 py-7 text-center opacity-60"
                      colSpan={boutiqueOnly ? 6 : 7}
                    >
                      {boutiqueOnly
                        ? "אין רכבים שנכנסו לבניין להצגה"
                        : "אין אירועי רכבים להצגה"}
                    </td>
                  </tr>
                ) : (
                  pagedRows.map((row) => {
                    const selected = row.id === selectedRow?.id;
                    return (
                      <tr
                        key={row.id}
                        className={cn(
                          "transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.03]",
                          selected && "bg-red-50/60 dark:bg-red-950/20",
                          // Fade the neighbour-lane (מנהטן) rows so the lobby
                          // display reads as "our cars" at a glance.
                          row.building === "manhattan" && !selected && "opacity-45"
                        )}
                      >
                        <td className="px-3 py-2.5 font-mono font-semibold align-top" dir="ltr">
                          {row.plate || "-"}
                          {row.visitStats && (
                            <div
                              dir="rtl"
                              className={cn(
                                "mt-0.5 font-sans text-[11px] font-normal",
                                row.visitStats.visits <= 1
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "opacity-55"
                              )}
                              title="מספר הכניסות שתועדו לרכב זה (לפי המצלמות)"
                            >
                              {row.visitStats.visits <= 1
                                ? "כניסה ראשונה"
                                : `${row.visitStats.visits} כניסות`}
                            </div>
                          )}
                        </td>
                        <td
                          className="whitespace-nowrap px-3 py-2.5"
                          dir="ltr"
                          title={row.eventTime || undefined}
                        >
                          {formatEventTime(row.eventTime) || "-"}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={cn(
                              "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium",
                              statusClassName(row.status)
                            )}
                            dir="ltr"
                          >
                           {row.status && row.status.toUpperCase() != "INVALID" ?  "מאושר" : "לא מאושר"}
                          </span>
                        </td>
                        {!boutiqueOnly && (
                          <td className="px-3 py-2.5">
                            {(() => {
                              const tag = buildingTag(row.building);
                              return (
                                <span
                                  className={cn(
                                    "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium",
                                    tag.className
                                  )}
                                >
                                  {tag.text}
                                </span>
                              );
                            })()}
                          </td>
                        )}
                        <td className="px-3 py-2.5">
                          {row.guest ? (
                            <div className="flex flex-col">
                              <span className="font-medium text-orange-700 dark:text-orange-300">
                                {row.guest.guestName || "אורח ידוע"}
                              </span>
                              {row.guest.apartmentNumber && (
                                <span className="text-[11px] opacity-60">
                                  דירה {row.guest.apartmentNumber}
                                  {row.guest.residentName
                                    ? ` · ${row.guest.residentName}`
                                    : ""}
                                </span>
                              )}
                            </div>
                          ) : row.registeredOwner ? (
                            <div className="flex flex-col">
                              <span className="font-medium text-sky-700 dark:text-sky-300">
                                {row.registeredOwner.name}
                              </span>
                              <span className="text-[11px] opacity-60">
                                רכב רשום
                                {row.registeredOwner.apartment
                                  ? ` · דירה ${row.registeredOwner.apartment}`
                                  : ""}
                              </span>
                            </div>
                          ) : (
                            <span className="opacity-40">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              onUseForGuest(row.plate, row.guest?.guestName)
                            }
                            disabled={!row.plate}
                            aria-label={`רישום חניית אורח עם רישוי ${row.plate}`}
                            title="רישום חניית אורח עם רישוי זה"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-black/10 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:hover:border-red-900 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                          >
                            <UserRoundPlus size={16} />
                          </button>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => setSelectedId(row.id)}
                            aria-label={`הצג פרטים עבור ${row.plate}`}
                            className={cn(
                              "inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors",
                              selected
                                ? "border-red-300 bg-red-100 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
                                : "border-black/10 hover:bg-black/[0.04] dark:border-white/10 dark:hover:bg-white/[0.06]"
                            )}
                          >
                            <ImageIcon size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

          {visibleRows.length > 0 && (
            <Pagination
              page={page}
              totalPages={totalPages}
              pageSize={PAGE_SIZE}
              total={visibleRows.length}
              onPageChange={setPage}
            />
          )}
        </div>

        <CarDetails row={selectedRow} onForgetGuest={load} />
      </div>
    </div>
  );
}
