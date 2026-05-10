"use client";

import Link from "next/link";
import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/Input";

export type RentersListResident = {
  id: number;
  first_name: string;
  last_name: string;
  type: "owner" | "renter";
  po_box: string | null;
  apartment_number: string | null;
  zone_name: string | null;
  primary_phone: string | null;
};

const TYPE_LABEL: Record<RentersListResident["type"], string> = {
  owner: "בעלים",
  renter: "שוכר",
};

type Props = {
  residents: RentersListResident[];
};

export function RentersList({ residents }: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return residents;
    return residents.filter((r) => {
      const fullName = `${r.first_name} ${r.last_name}`.toLowerCase();
      const apt = (r.apartment_number ?? "").toLowerCase();
      return fullName.includes(q) || apt.includes(q);
    });
  }, [residents, query]);

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
          placeholder="חיפוש לפי שם או מספר דירה"
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
          לא נמצאו דיירים תואמים
        </div>
      ) : (
        <div className="rounded-lg border border-black/10 dark:border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.02] dark:bg-white/[0.03] text-xs uppercase tracking-wide">
              <tr className="border-b border-black/10 dark:border-white/10 opacity-70">
                <th className="px-4 py-2.5 font-medium text-start">שם</th>
                <th className="px-4 py-2.5 font-medium text-start">דירה</th>
                <th className="px-4 py-2.5 font-medium text-start">אזור</th>
                <th className="px-4 py-2.5 font-medium text-start">סוג</th>
                <th className="px-4 py-2.5 font-medium text-start">טלפון</th>
                <th className="px-4 py-2.5 font-medium text-start">ת.ד.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 dark:divide-white/5">
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className="hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors"
                >
                  <td className="px-4 py-2.5 font-medium">
                    <Link
                      href={`/renters/${r.id}`}
                      className="hover:text-red-600 dark:hover:text-red-400 transition-colors"
                    >
                      {r.first_name} {r.last_name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 opacity-80">
                    {r.apartment_number ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 opacity-80">{r.zone_name ?? "—"}</td>
                  <td className="px-4 py-2.5 opacity-80">{TYPE_LABEL[r.type]}</td>
                  <td className="px-4 py-2.5 opacity-80 font-mono">
                    {r.primary_phone ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 opacity-60">{r.po_box ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
