"use client";

import { Home, KeyRound, Search, Star, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  getApartmentKeysComment,
  getApartmentKeysForEvents,
  getApartmentResidents,
  getKeysHistoryPage,
  searchKeysHistory,
  type ApartmentResidentOption,
  type EventsKeyRow,
  type KeyHistoryRow,
} from "@/app/events/actions";
import { Button } from "@/components/ui/Button";
import { ResidentLink } from "@/components/entity-links";
import { Input } from "@/components/ui/Input";
import { Pagination } from "@/components/ui/Pagination";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { cn } from "@/lib/cn";
import { KeysHistoryList } from "./KeysHistoryList";
import { LogKeyEventModal } from "./LogKeyEventModal";

const HISTORY_PAGE_SIZE = 10;

type Props = {
  apartmentId: number | null;
};

export function KeysTab({ apartmentId }: Props) {
  const [keys, setKeys] = useState<EventsKeyRow[] | null>(null);
  const [keysComment, setKeysComment] = useState<string | null>(null);
  const [history, setHistory] = useState<KeyHistoryRow[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [residents, setResidents] = useState<ApartmentResidentOption[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);
  const [activeKey, setActiveKey] = useState<EventsKeyRow | null>(null);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query.trim(), 250);
  const searching = debouncedQuery.length > 0;

  const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);
  const handleCloseModal = useCallback(() => setActiveKey(null), []);

  useEffect(() => {
    let active = true;
    if (searching) {
      searchKeysHistory(debouncedQuery, 50).then((rows) => {
        if (!active) return;
        setHistory(rows);
        setHistoryTotal(rows.length);
        setHistoryTotalPages(1);
      });
      return () => { active = false; };
    }
    if (apartmentId === null) {
      getKeysHistoryPage(null, historyPage, HISTORY_PAGE_SIZE).then((result) => {
        if (!active) return;
        setHistory(result.rows);
        setHistoryTotal(result.total);
        setHistoryTotalPages(result.totalPages);
        if (result.page !== historyPage) setHistoryPage(result.page);
        setKeys([]);
        setKeysComment(null);
        setResidents([]);
      });
    } else {
      Promise.all([
        getApartmentKeysForEvents(apartmentId),
        getApartmentKeysComment(apartmentId),
        getApartmentResidents(apartmentId),
        getKeysHistoryPage(apartmentId, historyPage, HISTORY_PAGE_SIZE),
      ]).then(([keyRows, keyComment, residentRows, historyResult]) => {
        if (!active) return;
        setKeys(keyRows);
        setKeysComment(keyComment);
        setResidents(residentRows);
        setHistory(historyResult.rows);
        setHistoryTotal(historyResult.total);
        setHistoryTotalPages(historyResult.totalPages);
        if (historyResult.page !== historyPage) setHistoryPage(historyResult.page);
      });
    }
    return () => {
      active = false;
    };
  }, [apartmentId, refreshTick, historyPage, searching, debouncedQuery]);

  return (
    <div className="space-y-6">
      {apartmentId !== null ? (
        <>
          <KeysComment comment={keysComment} />
          <KeysSection
            keys={keys}
            onLogEvent={setActiveKey}
          />
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-black/10 dark:border-white/10 p-4 text-center text-sm opacity-60">
          יש לבחור דייר בכדי להוסיף אירוע
        </div>
      )}

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
            placeholder="חיפוש לפי שם מפתח או מספר דירה"
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

        <KeysHistoryList
          rows={history}
          showApartment={searching || apartmentId === null}
          onDeleted={refresh}
        />

        {!searching && (
          <Pagination
            page={historyPage}
            totalPages={historyTotalPages}
            pageSize={HISTORY_PAGE_SIZE}
            total={historyTotal}
            onPageChange={setHistoryPage}
          />
        )}
      </section>

      {activeKey && apartmentId !== null && (
        <LogKeyEventModal
          open={true}
          onClose={handleCloseModal}
          onSuccess={refresh}
          keyId={activeKey.id}
          keyNickname={activeKey.nickname}
          currentIsInLobby={activeKey.is_in_lobby === 1}
          residents={residents}
        />
      )}
    </div>
  );
}

function KeysComment({ comment }: { comment: string | null }) {
  if (!comment) return null;

  return (
    <section className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
      <KeyRound
        size={18}
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
      />
      <div className="space-y-0.5">
        <h2 className="text-sm font-semibold text-amber-800 dark:text-amber-200">
          הערת מפתחות
        </h2>
        <p className="text-sm whitespace-pre-wrap text-amber-900/90 dark:text-amber-100">
          {comment}
        </p>
      </div>
    </section>
  );
}

function KeysSection({
  keys,
  onLogEvent,
}: {
  keys: EventsKeyRow[] | null;
  onLogEvent: (key: EventsKeyRow) => void;
}) {
  if (keys === null) {
    return (
      <div className="text-sm opacity-60 py-8 text-center">טוען מפתחות...</div>
    );
  }

  if (keys.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-black/10 dark:border-white/10 p-8 text-center text-sm opacity-60">
        אין מפתחות פעילים לדירה זו. הוסף מפתחות בעמוד הדירה.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-black/[0.02] dark:bg-white/[0.03] text-xs uppercase tracking-wide">
          <tr className="border-b border-black/10 dark:border-white/10 opacity-70">
            <th className="px-4 py-2.5 font-medium text-start">מפתח</th>
            <th className="px-4 py-2.5 font-medium text-start">מצב</th>
            <th className="px-4 py-2.5 font-medium text-start">אירוע אחרון</th>
            <th className="px-4 py-2.5 font-medium text-start"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5 dark:divide-white/5">
          {keys.map((k) => {
            const inLobby = k.is_in_lobby === 1;
            return (
              <tr
                key={k.id}
                className="hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {k.is_default === 1 && (
                      <Star
                        size={14}
                        className="fill-red-500 text-red-500 shrink-0"
                        aria-label="ברירת מחדל"
                      />
                    )}
                    <span className="font-medium">{k.nickname}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                      inLobby
                        ? "bg-sky-500/10 text-sky-700 dark:text-sky-300"
                        : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                    )}
                  >
                    <Home size={12} aria-hidden="true" />
                    {inLobby ? "בלובי" : "מחוץ ללובי"}
                  </span>
                </td>
                <td className="px-4 py-3 opacity-80">
                  {k.last_event_at ? (
                    <div className="space-y-0.5">
                      <div className="text-xs opacity-70">
                        {formatTimestamp(k.last_event_at)}
                        {k.last_lobbyist_name && (
                          <> · {k.last_lobbyist_name}</>
                        )}
                        {k.last_resident_name && (
                          <>
                            {" "}
                            ·{" "}
                            {k.last_resident_id ? (
                              <ResidentLink id={k.last_resident_id} isNewTab>
                                {k.last_resident_name}
                              </ResidentLink>
                            ) : (
                              k.last_resident_name
                            )}
                          </>
                        )}
                      </div>
                      {k.last_comment && (
                        <div className="truncate max-w-md">
                          {k.last_comment}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="opacity-50">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onLogEvent(k)}
                  >
                    תיעוד אירוע
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function formatTimestamp(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
