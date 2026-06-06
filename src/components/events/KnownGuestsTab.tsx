"use client";

import { DoorOpen, Minus, Search, UserRoundCheck, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  forgetResidentGuest,
  getKnownGuestsPage,
  searchKnownGuests,
  setGuestAutoOpen,
  type KnownGuestRow,
} from "@/app/events/cars-actions";
import { ApartmentLink, ResidentLink } from "@/components/entity-links";
import { useIsManager } from "@/components/AuthProvider";
import { Input } from "@/components/ui/Input";
import { Pagination } from "@/components/ui/Pagination";
import { cn } from "@/lib/cn";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { DeleteEventButton } from "./DeleteEventButton";

/** Manager-only toggle: does this approved guest's car auto-open the gate? */
function AutoOpenToggle({ id, value }: { id: number; value: boolean }) {
  const [on, setOn] = useState(value);
  const [pending, setPending] = useState(false);

  useEffect(() => setOn(value), [value]);

  async function toggle() {
    const next = !on;
    setPending(true);
    setOn(next); // optimistic
    const result = await setGuestAutoOpen(id, next);
    setPending(false);
    if (!result.ok) {
      setOn(!next);
      toast.error(result.error ?? "שגיאה בעדכון");
    } else {
      toast.success(next ? "פתיחה אוטומטית הופעלה" : "פתיחה אוטומטית בוטלה");
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
        on
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25"
          : "bg-black/[0.04] text-zinc-500 hover:bg-black/[0.08] dark:bg-white/[0.06] dark:text-zinc-400 dark:hover:bg-white/[0.1]",
        pending && "opacity-60"
      )}
      aria-pressed={on}
    >
      {on ? <DoorOpen size={13} aria-hidden="true" /> : <Minus size={13} aria-hidden="true" />}
      {on ? "פעיל" : "כבוי"}
    </button>
  );
}

const PAGE_SIZE = 10;

function formatTimestamp(raw: string) {
  const d = new Date(raw.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function KnownGuestsTab() {
  const isManager = useIsManager();
  const [rows, setRows] = useState<KnownGuestRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [refreshTick, setRefreshTick] = useState(0);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query.trim(), 250);
  const searching = debouncedQuery.length > 0;

  const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);

  useEffect(() => {
    let active = true;
    if (searching) {
      searchKnownGuests(debouncedQuery, 50).then((result) => {
        if (!active) return;
        setRows(result);
        setTotal(result.length);
        setTotalPages(1);
      });
    } else {
      getKnownGuestsPage(page, PAGE_SIZE).then((result) => {
        if (!active) return;
        setRows(result.rows);
        setTotal(result.total);
        setTotalPages(result.totalPages);
        if (result.page !== page) setPage(result.page);
      });
    }
    return () => {
      active = false;
    };
  }, [searching, debouncedQuery, page, refreshTick]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-medium opacity-80">אורחים מוכרים</h2>
        <p className="text-xs opacity-60">
          רכבי אורחים שזוהו בעבר — מזוהים אוטומטית בכניסה
        </p>
      </div>

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

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-black/10 dark:border-white/10 p-6 text-center text-sm opacity-60">
          {searching ? "לא נמצאו אורחים מוכרים" : "אין אורחים מוכרים עדיין"}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-black/10 dark:border-white/10">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-black/[0.02] dark:bg-white/[0.03] text-xs uppercase tracking-wide">
                <tr className="border-b border-black/10 dark:border-white/10 opacity-70">
                  <th className="px-4 py-2.5 font-medium text-start">מספר רישוי</th>
                  <th className="px-4 py-2.5 font-medium text-start">שם האורח</th>
                  <th className="px-4 py-2.5 font-medium text-start">דירה</th>
                  <th className="px-4 py-2.5 font-medium text-start">דייר מארח</th>
                  <th className="px-4 py-2.5 font-medium text-start">נלמד בתאריך</th>
                  {isManager && (
                    <th className="px-4 py-2.5 font-medium text-center">פתיחה אוטומטית</th>
                  )}
                  <th className="px-4 py-2.5 font-medium text-center">הסרה</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/5">
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors"
                  >
                    <td className="px-4 py-3 font-mono font-semibold" dir="ltr">
                      {r.carPlate || "-"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-300">
                        <UserRoundCheck size={14} aria-hidden="true" />
                        {r.guestName || "אורח ידוע"}
                      </span>
                    </td>
                    <td className="px-4 py-3 opacity-80">
                      {r.apartmentNumber ? (
                        r.apartmentId ? (
                          <ApartmentLink id={r.apartmentId} isNewTab>
                            דירה {r.apartmentNumber}
                          </ApartmentLink>
                        ) : (
                          <>דירה {r.apartmentNumber}</>
                        )
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 opacity-80">
                      {r.residentName ? (
                        r.residentId ? (
                          <ResidentLink id={r.residentId} isNewTab>
                            {r.residentName}
                          </ResidentLink>
                        ) : (
                          r.residentName
                        )
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs opacity-70">
                      {formatTimestamp(r.createdAt)}
                    </td>
                    {isManager && (
                      <td className="px-4 py-3 text-center">
                        <AutoOpenToggle id={r.id} value={r.autoOpen === 1} />
                      </td>
                    )}
                    <td className="px-4 py-3 text-center">
                      <DeleteEventButton
                        id={r.id}
                        action={forgetResidentGuest}
                        successMessage="האורח הוסר מהזיהוי"
                        confirmTitle="הסרת אורח מזוהה"
                        confirmDescription={`להסיר את "${
                          r.guestName || "האורח"
                        }" מזיהוי לוחית ${r.carPlate}? הרכב לא יזוהה אוטומטית יותר.`}
                        ariaLabel="הסר אורח מזוהה"
                        onDeleted={refresh}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!searching && (
        <Pagination
          page={page}
          totalPages={totalPages}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
