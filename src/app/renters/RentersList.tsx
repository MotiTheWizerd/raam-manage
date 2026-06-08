"use client";

import Link from "next/link";
import { ChevronDown, ChevronsUpDown, ChevronUp, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Dropdown } from "@/components/ui/Dropdown";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";

export type RentersListResident = {
  id: number;
  first_name: string;
  last_name: string;
  type: "owner" | "renter";
  po_box: string | null;
  apartment_number: string | null;
  apartment_comment: string | null;
  zone_name: string | null;
  primary_phone: string | null;
};

const TYPE_LABEL: Record<RentersListResident["type"], string> = {
  owner: "בעלים",
  renter: "שוכר",
};

type TypeFilter = "all" | "owner" | "renter";

type SortKey =
  | "name"
  | "apartment"
  | "apartment_comment"
  | "zone"
  | "type"
  | "phone"
  | "po_box";
type SortDir = "asc" | "desc";

function sortValue(r: RentersListResident, key: SortKey): string | null {
  switch (key) {
    case "name":
      return `${r.first_name} ${r.last_name}`;
    case "apartment":
      return r.apartment_number;
    case "apartment_comment":
      return r.apartment_comment;
    case "zone":
      return r.zone_name;
    case "type":
      return TYPE_LABEL[r.type];
    case "phone":
      return r.primary_phone;
    case "po_box":
      return r.po_box;
  }
}

type Props = {
  residents: RentersListResident[];
};

export function RentersList({ residents }: Props) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("apartment");
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
    const filtered = residents.filter((r) => {
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      if (!q) return true;
      const fullName = `${r.first_name} ${r.last_name}`.toLowerCase();
      const apt = (r.apartment_number ?? "").toLowerCase();
      return fullName.includes(q) || apt.includes(q);
    });

    const sorted = [...filtered].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      // Nulls always sink to the bottom regardless of direction.
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      const cmp = av.localeCompare(bv, "he", { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [residents, query, typeFilter, sortKey, sortDir]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 max-w-sm">
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
        <Dropdown
          value={typeFilter}
          onChange={(v) => setTypeFilter(v as TypeFilter)}
          options={[
            { value: "all", label: "הכל" },
            { value: "owner", label: "בעלים" },
            { value: "renter", label: "שוכרים" },
          ]}
          className="w-32"
        />
      </div>

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-black/10 dark:border-white/10 p-8 text-center text-sm opacity-60">
          לא נמצאו דיירים תואמים
        </div>
      ) : (
        <div className="rounded-lg border border-black/10 dark:border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.02] dark:bg-white/[0.03] text-xs uppercase tracking-wide">
              <tr className="border-b border-black/10 dark:border-white/10 opacity-70">
                <SortHeader label="שם"   k="name"      sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                <SortHeader label="דירה"  k="apartment" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                <SortHeader label="הערת דירה" k="apartment_comment" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                <SortHeader label="אזור"  k="zone"      sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                <SortHeader label="סוג"   k="type"      sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                <SortHeader label="טלפון" k="phone"     sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                <SortHeader label="ת.ד."  k="po_box"    sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 dark:divide-white/5">
              {visible.map((r) => (
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
                  <td className="px-4 py-2.5 opacity-70 max-w-[16rem] truncate" title={r.apartment_comment ?? undefined}>
                    {r.apartment_comment ?? "—"}
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
