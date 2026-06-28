"use client";

import Link from "next/link";
import { Download, KeyRound, Printer, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { type LobbyKeyRow } from "@/app/events/actions";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Input } from "@/components/ui/Input";

type LobbyFilter = "in" | "out" | "all";

const FILTER_OPTIONS = [
  { value: "in", label: "בלובי" },
  { value: "out", label: "מחוץ ללובי" },
  { value: "all", label: "הכל" },
];

// Excel export + print buttons are hidden for now (session 44, by request) — the
// code below stays intact; flip this to `true` to bring the buttons back.
const SHOW_REPORT_ACTIONS = false;

// SQLite stores timestamps as UTC "YYYY-MM-DD HH:MM:SS"; render them in local
// Israeli time (same helper shape as the keys history list).
function formatTimestamp(iso: string | null) {
  if (!iso) return "—";
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

type Props = {
  rows: LobbyKeyRow[];
};

export function LobbyKeysReport({ rows }: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<LobbyFilter>("in");
  const [exporting, setExporting] = useState(false);

  const inCount = useMemo(
    () => rows.filter((r) => r.is_in_lobby === 1).length,
    [rows]
  );
  const outCount = rows.length - inCount;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "in" && r.is_in_lobby !== 1) return false;
      if (filter === "out" && r.is_in_lobby === 1) return false;
      if (!q) return true;
      return [
        r.apartment_number,
        r.zone_name ?? "",
        r.nickname,
        r.last_lobbyist ?? "",
        r.comment ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [rows, query, filter]);

  async function exportToExcel() {
    if (visible.length === 0) return;
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const data = visible.map((r) => ({
        דירה: r.apartment_number,
        אגף: r.zone_name ?? "",
        קומה: r.floor ?? "",
        "כינוי המפתח": r.nickname,
        מיקום: r.is_in_lobby === 1 ? "בלובי" : "מחוץ ללובי",
        מאז: formatTimestamp(r.since),
        'עודכן ע"י': r.last_lobbyist ?? "",
        הערה: r.comment ?? "",
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "מפתחות לובי");
      const today = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `lobby-keys-${today}.xlsx`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <KeyRound size={20} className="text-red-600 dark:text-red-400" />
            דוח מפתחות לובי
          </h2>
          <p className="mt-1 text-sm opacity-60">
            {rows.length === 0
              ? "אין מפתחות פעילים"
              : `בלובי: ${inCount} · מחוץ ללובי: ${outCount} · סה"כ: ${rows.length}`}
          </p>
        </div>
        {SHOW_REPORT_ACTIONS && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => window.print()}
            >
              <Printer size={14} />
              הדפסה
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={exportToExcel}
              disabled={exporting || visible.length === 0}
            >
              <Download size={14} />
              {exporting ? "מייצא..." : "ייצוא לאקסל"}
            </Button>
          </div>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <div className="relative max-w-sm flex-1 sm:min-w-[16rem]">
          <Search
            size={14}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 start-3 -translate-y-1/2 opacity-50"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש לפי דירה, מפתח או פקיד"
            className="ps-9 pe-9"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="נקה חיפוש"
              className="absolute top-1/2 end-2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full opacity-60 transition-colors hover:bg-black/[0.05] hover:opacity-100 dark:hover:bg-white/[0.06]"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <Dropdown
          options={FILTER_OPTIONS}
          value={filter}
          onChange={(v) => setFilter(v as LobbyFilter)}
          className="w-44"
        />
      </div>

      <div id="report-print" className="space-y-3">
        <h2 className="mb-2 hidden text-lg font-semibold print:block">
          דוח מפתחות לובי
        </h2>
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-black/10 bg-black/[0.03] text-start dark:border-white/10 dark:bg-white/[0.04]">
                <Th>דירה</Th>
                <Th>אגף</Th>
                <Th className="text-center">קומה</Th>
                <Th>כינוי המפתח</Th>
                <Th>מיקום</Th>
                <Th>מאז</Th>
                <Th>עודכן ע&quot;י</Th>
                <Th>הערה</Th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-10 text-center text-sm opacity-50"
                  >
                    {rows.length === 0
                      ? "אין מפתחות פעילים"
                      : "לא נמצאו מפתחות תואמים"}
                  </td>
                </tr>
              ) : (
                visible.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-black/5 last:border-b-0 hover:bg-black/[0.02] dark:border-white/5 dark:hover:bg-white/[0.03]"
                  >
                    <Td className="font-medium whitespace-nowrap">
                      <Link
                        href={`/apartments/${r.apartment_id}`}
                        className="transition-colors hover:text-red-600 dark:hover:text-red-400"
                      >
                        {r.apartment_number}
                      </Link>
                    </Td>
                    <Td className="whitespace-nowrap opacity-80">
                      {r.zone_name ?? "—"}
                    </Td>
                    <Td className="text-center opacity-80">{r.floor ?? "—"}</Td>
                    <Td className="whitespace-nowrap">
                      <span className="inline-flex items-center gap-2">
                        {r.nickname}
                        {r.is_default === 1 && (
                          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">
                            ברירת מחדל
                          </span>
                        )}
                      </span>
                    </Td>
                    <Td className="whitespace-nowrap">
                      <StatusBadge inLobby={r.is_in_lobby === 1} />
                    </Td>
                    <Td className="whitespace-nowrap opacity-80">
                      {formatTimestamp(r.since)}
                    </Td>
                    <Td className="whitespace-nowrap opacity-80">
                      {r.last_lobbyist || "—"}
                    </Td>
                    <Td className="opacity-70">
                      {r.comment ? (
                        <span className="whitespace-pre-wrap">{r.comment}</span>
                      ) : (
                        <span className="opacity-40">—</span>
                      )}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ inLobby }: { inLobby: boolean }) {
  return inLobby ? (
    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
      בלובי
    </span>
  ) : (
    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
      מחוץ ללובי
    </span>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`px-3 py-2 text-start font-semibold whitespace-nowrap ${className}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-3 py-2 align-top ${className}`}>{children}</td>;
}
