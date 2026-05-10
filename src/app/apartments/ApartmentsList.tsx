"use client";

import Link from "next/link";
import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/Input";

export type ApartmentsListItem = {
  id: number;
  number: string;
  floor: number | null;
  zone_id: number | null;
  zone_name: string | null;
  notes: string | null;
};

type Props = {
  apartments: ApartmentsListItem[];
};

export function ApartmentsList({ apartments }: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return apartments;
    return apartments.filter((a) => {
      const number = a.number.toLowerCase();
      const zone = (a.zone_name ?? "").toLowerCase();
      return number.includes(q) || zone.includes(q);
    });
  }, [apartments, query]);

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

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-black/10 dark:border-white/10 p-8 text-center text-sm opacity-60">
          לא נמצאו דירות תואמות
        </div>
      ) : (
        <div className="rounded-lg border border-black/10 dark:border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.02] dark:bg-white/[0.03] text-xs uppercase tracking-wide">
              <tr className="border-b border-black/10 dark:border-white/10 opacity-70">
                <th className="px-4 py-2.5 font-medium text-start">מספר</th>
                <th className="px-4 py-2.5 font-medium text-start">קומה</th>
                <th className="px-4 py-2.5 font-medium text-start">אזור</th>
                <th className="px-4 py-2.5 font-medium text-start">הערות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 dark:divide-white/5">
              {filtered.map((a) => (
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
