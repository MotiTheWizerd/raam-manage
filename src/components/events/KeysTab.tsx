"use client";

import { Home, Star } from "lucide-react";
import { useEffect, useState } from "react";
import {
  getApartmentKeysForEvents,
  getApartmentResidents,
  type ApartmentResidentOption,
  type EventsKeyRow,
} from "@/app/events/actions";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { LogKeyEventModal } from "./LogKeyEventModal";

type Props = {
  apartmentId: number;
};

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

export function KeysTab({ apartmentId }: Props) {
  const [keys, setKeys] = useState<EventsKeyRow[] | null>(null);
  const [residents, setResidents] = useState<ApartmentResidentOption[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);
  const [activeKey, setActiveKey] = useState<EventsKeyRow | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      getApartmentKeysForEvents(apartmentId),
      getApartmentResidents(apartmentId),
    ]).then(([keyRows, residentRows]) => {
      if (!active) return;
      setKeys(keyRows);
      setResidents(residentRows);
    });
    return () => {
      active = false;
    };
  }, [apartmentId, refreshTick]);

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
    <>
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
                            <> · {k.last_resident_name}</>
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
                      onClick={() => setActiveKey(k)}
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

      {activeKey && (
        <LogKeyEventModal
          open={true}
          onClose={() => setActiveKey(null)}
          onSuccess={() => setRefreshTick((t) => t + 1)}
          keyId={activeKey.id}
          keyNickname={activeKey.nickname}
          currentIsInLobby={activeKey.is_in_lobby === 1}
          residents={residents}
        />
      )}
    </>
  );
}
