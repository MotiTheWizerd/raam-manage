"use client";

import Link from "next/link";
import { ChevronDown, ChevronsUpDown, ChevronUp, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";

export type ApartmentsListItem = {
  id: number;
  number: string;
  floor: number | null;
  zone_id: number | null;
  zone_name: string | null;
  notes: string | null;
};

type SortKey = "number" | "floor" | "zone" | "notes";
type SortDir = "asc" | "desc";

function compareForKey(
  a: ApartmentsListItem,
  b: ApartmentsListItem,
  key: SortKey
): number {
  // Returns the asc-direction comparator. Nulls always sink to the bottom,
  // mirroring the renters list behaviour.
  if (key === "floor") {
    const av = a.floor;
    const bv = b.floor;
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return av - bv;
  }
  const av =
    key === "number"
      ? a.number
      : key === "zone"
        ? a.zone_name
        : a.notes;
  const bv =
    key === "number"
      ? b.number
      : key === "zone"
        ? b.zone_name
        : b.notes;
  if (av === null && bv === null) return 0;
  if (av === null) return 1;
  if (bv === null) return -1;
  return av.localeCompare(bv, "he", { numeric: true });
}

type Props = {
  apartments: ApartmentsListItem[];
};

export function ApartmentsList({ apartments }: Props) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("number");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = apartments.filter((a) => {
      if (!q) return true;
      const number = a.number.toLowerCase();
      const zone = (a.zone_name ?? "").toLowerCase();
      return number.includes(q) || zone.includes(q);
    });

    const sorted = [...filtered].sort((a, b) => {
      const cmp = compareForKey(a, b, sortKey);
      return sortDir === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [apartments, query, sortKey, sortDir]);

  return (
    <div className="space-y-3">
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
          placeholder="חיפוש לפי מספר דירה או אזור"
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

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-black/10 dark:border-white/10 p-8 text-center text-sm opacity-60">
          לא נמצאו דירות תואמות
        </div>
      ) : (
        <div className="rounded-lg border border-black/10 dark:border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.02] dark:bg-white/[0.03] text-xs uppercase tracking-wide">
              <tr className="border-b border-black/10 dark:border-white/10 opacity-70">
                <SortHeader label="מספר"  k="number" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                <SortHeader label="קומה"  k="floor"  sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                <SortHeader label="אזור"  k="zone"   sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                <SortHeader label="הערות" k="notes"  sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 dark:divide-white/5">
              {visible.map((a) => (
                <tr
                  key={a.id}
                  className="hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors"
                >
                  <td className="px-4 py-2.5 font-medium">
                    <Link
                      href={`/apartments/${a.id}`}
                      className="hover:text-red-600 dark:hover:text-red-400 transition-colors"
                    >
                      {a.number}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 opacity-80">{a.floor ?? "—"}</td>
                  <td className="px-4 py-2.5 opacity-80">{a.zone_name ?? "—"}</td>
                  <td className="px-4 py-2.5 opacity-60 max-w-xs truncate">
                    {a.notes ?? "—"}
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

type SortHeaderProps = {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onToggle: (k: SortKey) => void;
};

function SortHeader({ label, k, sortKey, sortDir, onToggle }: SortHeaderProps) {
  const active = sortKey === k;
  const Icon = active
    ? sortDir === "asc"
      ? ChevronUp
      : ChevronDown
    : ChevronsUpDown;

  return (
    <th className="px-0 py-0 font-medium text-start">
      <button
        type="button"
        onClick={() => onToggle(k)}
        className={cn(
          "w-full h-full px-4 py-2.5 inline-flex items-center gap-1.5 text-start hover:bg-black/[0.04] dark:hover:bg-white/[0.05] transition-colors",
          active && "text-foreground"
        )}
      >
        <span>{label}</span>
        <Icon
          size={12}
          aria-hidden="true"
          className={cn("shrink-0", active ? "opacity-90" : "opacity-40")}
        />
      </button>
    </th>
  );
}
