"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import type { KeyHistoryRow } from "@/app/events/actions";
import { cn } from "@/lib/cn";

type Props = {
  rows: KeyHistoryRow[];
  showApartment?: boolean;
};

function formatTimestamp(iso: string) {
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

export function KeysHistoryList({ rows, showApartment = false }: Props) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium opacity-80">אירועים אחרונים</h2>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-black/10 dark:border-white/10 p-6 text-center text-sm opacity-60">
          אין אירועים עדיין
        </div>
      ) : (
        <ul className="rounded-lg border border-black/10 dark:border-white/10 divide-y divide-black/5 dark:divide-white/5 overflow-hidden">
          {rows.map((r) => {
            const inLobby = r.is_in_lobby === 1;
            const Arrow = inLobby ? ArrowLeft : ArrowRight;
            return (
              <li
                key={r.id}
                className="flex items-start gap-3 px-4 py-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors"
              >
                <div
                  className={cn(
                    "shrink-0 mt-0.5 inline-flex items-center justify-center h-6 w-6 rounded-full",
                    inLobby
                      ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                      : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                  )}
                  title={inLobby ? "חזר ללובי" : "יצא מהלובי"}
                >
                  <Arrow size={14} aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                    {showApartment && (
                      <span className="text-xs font-medium opacity-70">
                        דירה {r.apartment_number} ·
                      </span>
                    )}
                    <span className="font-medium">{r.key_nickname}</span>
                    <span
                      className={cn(
                        "text-xs",
                        inLobby
                          ? "text-sky-700 dark:text-sky-300"
                          : "text-amber-700 dark:text-amber-300"
                      )}
                    >
                      {inLobby ? "חזר ללובי" : "יצא מהלובי"}
                    </span>
                    <span className="text-xs opacity-60">
                      · {formatTimestamp(r.created_at)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs opacity-70 flex flex-wrap gap-x-2">
                    <span>סדרן: {r.lobbyist_name}</span>
                    {r.resident_name && <span>· דייר: {r.resident_name}</span>}
                  </div>
                  {r.comment && (
                    <div className="mt-1 text-sm">{r.comment}</div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
