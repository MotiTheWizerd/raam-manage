"use client";

import Link from "next/link";
import { Download, Printer, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  SheetTable,
  type SheetColumn,
  type SheetSortDir,
} from "@/components/ui/SheetTable";
import { cn } from "@/lib/cn";

export type DirectoryPhone = {
  name: string;
  number: string;
  label: string | null;
};

export type DirectoryResident = {
  id: number;
  name: string;
};

export type DirectoryRow = {
  apartment_id: number;
  number: string;
  zone_name: string | null;
  floor: number | null;
  owners: DirectoryResident[];
  occupants: DirectoryResident[];
  parking: string[];
  storage: string[];
  phones: DirectoryPhone[];
  po_boxes: string[];
  notes: string | null;
};

type SortKey = "apartment" | "zone" | "floor";

function sortValue(r: DirectoryRow, key: SortKey): string | number | null {
  switch (key) {
    case "apartment":
      return r.number;
    case "zone":
      return r.zone_name;
    case "floor":
      return r.floor;
  }
}

type Props = {
  rows: DirectoryRow[];
};

export function DirectoryTable({ rows }: Props) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("apartment");
  const [sortDir, setSortDir] = useState<SheetSortDir>("asc");
  const [exporting, setExporting] = useState(false);

  function toggleSort(key: string) {
    const k = key as SortKey;
    if (sortKey === k) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir("asc");
    }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    const filtered = rows.filter((r) => {
      if (!q) return true;
      if (r.number.toLowerCase().includes(q)) return true;
      if ((r.zone_name ?? "").toLowerCase().includes(q)) return true;
      const people = [...r.owners, ...r.occupants]
        .map((p) => p.name)
        .join(" ")
        .toLowerCase();
      if (people.includes(q)) return true;
      if (
        qDigits &&
        r.phones.some((p) => p.number.replace(/\D/g, "").includes(qDigits))
      ) {
        return true;
      }
      return false;
    });

    const sorted = [...filtered].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      // Nulls always sink to the bottom regardless of direction.
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv), "he", { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [rows, query, sortKey, sortDir]);

  const columns: SheetColumn<DirectoryRow>[] = [
    {
      key: "apartment",
      header: "דירה",
      sortable: true,
      cellClassName: "font-medium whitespace-nowrap",
      render: (r) => (
        <Link
          href={`/apartments/${r.apartment_id}`}
          className="transition-colors hover:text-red-600 dark:hover:text-red-400"
        >
          {r.number}
        </Link>
      ),
    },
    {
      key: "zone",
      header: "אגף",
      sortable: true,
      cellClassName: "opacity-80 whitespace-nowrap",
      render: (r) => r.zone_name ?? "—",
    },
    {
      key: "floor",
      header: "קומה",
      sortable: true,
      align: "center",
      cellClassName: "opacity-80",
      render: (r) => r.floor ?? "—",
    },
    {
      key: "owners",
      header: "בעלי הדירות",
      maxWidth: "12rem",
      render: (r) => <PeopleLines people={r.owners} />,
    },
    {
      key: "occupants",
      header: "רשימת דיירים",
      maxWidth: "12rem",
      render: (r) => <PeopleLines people={r.occupants} muted />,
    },
    {
      key: "parking",
      header: "חנייה",
      cellClassName: "whitespace-nowrap font-mono text-xs opacity-80",
      render: (r) => <Lines items={r.parking} />,
    },
    {
      key: "storage",
      header: "מחסן",
      cellClassName: "whitespace-nowrap font-mono text-xs opacity-80",
      render: (r) => <Lines items={r.storage} />,
    },
    {
      key: "po_boxes",
      header: "ת.ד",
      cellClassName: "font-mono text-xs opacity-70",
      render: (r) => <Lines items={r.po_boxes} />,
    },
    {
      key: "phones",
      header: "רשימת טלפונים",
      maxWidth: "16rem",
      cellClassName: "text-xs",
      render: (r) =>
        r.phones.length === 0 ? (
          <span className="opacity-40">—</span>
        ) : (
          <div className="space-y-0.5">
            {r.phones.map((p, i) => (
              <div key={i} className="flex flex-wrap items-baseline gap-1">
                <span className="opacity-70">{p.name}</span>
                <span dir="ltr" className="font-mono">
                  {p.number}
                </span>
                {p.label && <span className="opacity-50">· {p.label}</span>}
              </div>
            ))}
          </div>
        ),
    },
    {
      key: "notes",
      header: "מידע נוסף",
      maxWidth: "16rem",
      cellClassName: "text-xs opacity-70",
      render: (r) =>
        r.notes ? (
          <div className="whitespace-pre-wrap">{r.notes}</div>
        ) : (
          <span className="opacity-40">—</span>
        ),
    },
  ];

  async function exportToExcel() {
    if (visible.length === 0) return;
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const data = visible.map((r) => ({
        דירה: r.number,
        אגף: r.zone_name ?? "",
        קומה: r.floor ?? "",
        "בעלי הדירות": r.owners.map((o) => o.name).join(", "),
        "רשימת דיירים": r.occupants.map((o) => o.name).join(", "),
        חנייה: r.parking.join(", "),
        מחסן: r.storage.join(", "),
        "ת.ד": r.po_boxes.join(", "),
        "רשימת טלפונים": r.phones
          .map((p) => `${p.name}: ${p.number}${p.label ? ` (${p.label})` : ""}`)
          .join(" | "),
        "מידע נוסף": r.notes ?? "",
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "מדריך הבניין");
      const today = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `directory-${today}.xlsx`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h1 className="text-2xl font-semibold tracking-tight">מדריך הבניין</h1>
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
      </header>

      <div className="relative max-w-sm print:hidden">
        <Search
          size={14}
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 start-3 -translate-y-1/2 opacity-50"
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חיפוש לפי דירה, שם, אגף או טלפון"
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

      <div id="directory-print" className="space-y-3">
        <h2 className="mb-2 hidden text-lg font-semibold print:block">
          מדריך הבניין
        </h2>
        <SheetTable
          columns={columns}
          rows={visible}
          rowKey={(r) => r.apartment_id}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={toggleSort}
          emptyText="לא נמצאו דירות תואמות"
        />
      </div>
    </div>
  );
}

function Lines({ items, muted }: { items: string[]; muted?: boolean }) {
  if (items.length === 0) return <span className="opacity-40">—</span>;
  return (
    <div className={cn("space-y-0.5", muted && "opacity-80")}>
      {items.map((it, i) => (
        <div key={i} className="whitespace-nowrap">
          {it}
        </div>
      ))}
    </div>
  );
}

// Like Lines, but each person links to their resident page (same red-hover
// style as the apartment-number link).
function PeopleLines({
  people,
  muted,
}: {
  people: DirectoryResident[];
  muted?: boolean;
}) {
  if (people.length === 0) return <span className="opacity-40">—</span>;
  return (
    <div className={cn("space-y-0.5", muted && "opacity-80")}>
      {people.map((p) => (
        <div key={p.id} className="whitespace-nowrap">
          <Link
            href={`/renters/${p.id}`}
            className="transition-colors hover:text-red-600 dark:hover:text-red-400"
          >
            {p.name}
          </Link>
        </div>
      ))}
    </div>
  );
}
