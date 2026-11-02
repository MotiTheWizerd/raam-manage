"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getSupplierGateLog } from "@/app/settings/supplier-gate-actions";
import type { SupplierGateRow } from "@/lib/supplier-gate";

// רחבת ספקים — every opening of the supplier-yard boom gate, as camera 114 saw
// it (lib/supplier-gate.ts): when it opened and closed, for how long, who was
// on shift, and a photo of each moment. Newest first.

// Rows are stored UTC in SQLite format ("2026-11-02 00:26:41").
const toMs = (sql: string) => Date.parse(sql.replace(" ", "T") + "Z");
const day = new Intl.DateTimeFormat("he-IL", { weekday: "short", day: "2-digit", month: "2-digit" });
const time = new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function duration(sec: number): string {
  if (sec < 60) return `${sec} שנ׳`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}:${String(sec % 60).padStart(2, "0")} דק׳`;
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")} שע׳`;
}

function Photo({ file, label }: { file: string | null; label: string }) {
  if (!file) return <span className="text-xs opacity-40">—</span>;
  const src = `/api/supplier-gate/photo?f=${encodeURIComponent(file)}`;
  return (
    <a href={src} target="_blank" rel="noreferrer" title={label} className="block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={label}
        loading="lazy"
        className="aspect-video w-28 rounded-md border border-black/10 object-cover transition hover:opacity-80 dark:border-white/10"
      />
    </a>
  );
}

export function SupplierGateTab() {
  const [rows, setRows] = useState<SupplierGateRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await getSupplierGateLog());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    getSupplierGateLog().then((r) => {
      if (alive) setRows(r);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">שער רחבת ספקים — יומן פתיחות</h2>
          <p className="text-xs opacity-60">
            מזוהה אוטומטית ממצלמה 114. תמונות נשמרות 30 יום.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs opacity-70 transition hover:bg-black/[0.05] hover:opacity-100 dark:hover:bg-white/[0.08]"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          רענן
        </button>
      </div>

      {rows === null ? null : rows.length === 0 ? (
        <p className="rounded-lg border border-black/10 p-6 text-center text-sm opacity-50 dark:border-white/10">
          עוד לא נרשמו פתיחות.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-black/10 dark:border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.03] text-xs opacity-70 dark:bg-white/[0.04]">
              <tr className="text-right">
                <th className="px-3 py-2 font-medium">יום</th>
                <th className="px-3 py-2 font-medium">נפתח</th>
                <th className="px-3 py-2 font-medium">נסגר</th>
                <th className="px-3 py-2 font-medium">משך</th>
                <th className="px-3 py-2 font-medium">פקיד לובי</th>
                <th className="px-3 py-2 font-medium">בפתיחה</th>
                <th className="px-3 py-2 font-medium">בסגירה</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 dark:divide-white/5">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-black/[0.02] dark:hover:bg-white/[0.03]">
                  <td className="px-3 py-2 whitespace-nowrap">{day.format(toMs(r.opened_at))}</td>
                  <td className="px-3 py-2 tabular-nums">{time.format(toMs(r.opened_at))}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.closed_at ? (
                      time.format(toMs(r.closed_at))
                    ) : (
                      <span className="font-medium text-amber-600 dark:text-amber-400">פתוח כעת</span>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.duration_sec != null ? duration(r.duration_sec) : "—"}
                  </td>
                  <td className="px-3 py-2">{r.lobbyist_name || "—"}</td>
                  <td className="px-3 py-2">
                    <Photo file={r.open_photo} label="השער בפתיחה" />
                  </td>
                  <td className="px-3 py-2">
                    <Photo file={r.close_photo} label="השער בסגירה" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
