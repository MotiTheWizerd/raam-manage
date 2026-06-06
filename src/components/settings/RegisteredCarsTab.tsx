"use client";

import { Building2, Car, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  getCarsPerApartment,
  getRegisteredCarsPage,
  getRegisteredCarsSummary,
  type ApartmentCarCount,
  type RegisteredCarRow,
  type RegisteredCarsSummary,
} from "@/app/settings/registered-cars-actions";
import { Input } from "@/components/ui/Input";
import { Pagination } from "@/components/ui/Pagination";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";

const PAGE_SIZE = 15;

function fullName(r: RegisteredCarRow): string {
  const name = [r.firstName, r.lastName].filter(Boolean).join(" ").trim();
  return name || "—";
}

function StatCard({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-black/10 dark:border-white/10 bg-white/40 dark:bg-white/[0.02] px-4 py-3">
      <div className="rounded-md bg-black/[0.04] dark:bg-white/[0.06] p-2 opacity-70">
        {icon}
      </div>
      <div>
        <div className="text-2xl font-semibold tabular-nums leading-none">
          {value}
        </div>
        <div className="mt-1 text-xs opacity-60">{label}</div>
      </div>
    </div>
  );
}

function PerApartment({ items }: { items: ApartmentCarCount[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return items;
    return items.filter((a) => a.apartment.includes(q));
  }, [items, query]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium opacity-80">רכבים רשומים לפי דירה</h3>
        <div className="relative w-40">
          <Search
            size={14}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-3 opacity-50"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש דירה"
            className="h-8 ps-9 pe-3 text-sm"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-black/10 dark:border-white/10 p-6 text-center text-sm opacity-60">
          לא נמצאו דירות תואמות
        </div>
      ) : (
        <div className="grid max-h-72 grid-cols-2 gap-2 overflow-auto rounded-lg border border-black/10 dark:border-white/10 p-2 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((a) => (
            <div
              key={a.apartment}
              className="flex items-center justify-between gap-2 rounded-md bg-black/[0.02] dark:bg-white/[0.03] px-3 py-2 text-sm"
            >
              <span className="opacity-80">דירה {a.apartment}</span>
              <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                {a.cars}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function RegisteredCarsTab() {
  const [summary, setSummary] = useState<RegisteredCarsSummary | null>(null);
  const [perApartment, setPerApartment] = useState<ApartmentCarCount[]>([]);
  const [rows, setRows] = useState<RegisteredCarRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debouncedQuery = useDebouncedValue(query.trim(), 250);

  useEffect(() => {
    let active = true;
    Promise.all([getRegisteredCarsSummary(), getCarsPerApartment()])
      .then(([s, perApt]) => {
        if (!active) return;
        setSummary(s);
        setPerApartment(perApt);
      })
      .catch(() => {
        // The list-level error banner already covers connection failures.
      });
    return () => {
      active = false;
    };
  }, []);

  // Reset to the first page whenever the search term changes.
  useEffect(() => {
    setPage(1);
  }, [debouncedQuery]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getRegisteredCarsPage(page, PAGE_SIZE, debouncedQuery)
      .then((result) => {
        if (!active) return;
        setError(null);
        setRows(result.rows);
        setTotal(result.total);
        setTotalPages(result.totalPages);
        if (result.page !== page) setPage(result.page);
      })
      .catch((e) => {
        if (!active) return;
        setError(e instanceof Error ? e.message : "טעינת הרכבים הרשומים נכשלה");
        setRows([]);
        setTotal(0);
        setTotalPages(1);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, debouncedQuery]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-medium opacity-80">רכבי דיירים רשומים במערכת החניון</h2>
        <p className="text-xs opacity-60">
          נתונים לקריאה בלבד ממערכת זיהוי הלוחיות (SLPR) — דיירים בלבד
        </p>
      </div>

      {summary && (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            icon={<Car size={18} aria-hidden="true" />}
            value={summary.residentCars}
            label="רכבי דיירים"
          />
          <StatCard
            icon={<Building2 size={18} aria-hidden="true" />}
            value={summary.apartments}
            label="דירות עם רכב רשום"
          />
          <StatCard
            icon={<Car size={18} aria-hidden="true" />}
            value={summary.withoutApartment}
            label="ללא שיוך דירה"
          />
        </div>
      )}

      {perApartment.length > 0 && <PerApartment items={perApartment} />}

      <div className="space-y-3">
        <h3 className="text-sm font-medium opacity-80">רשימת רכבי דיירים</h3>

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
            placeholder="חיפוש לפי לוחית, שם, דירה או טלפון"
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

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-950 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        ) : loading && rows.length === 0 ? (
          <div className="py-8 text-center text-sm opacity-60">טוען רכבים...</div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-black/10 dark:border-white/10 p-8 text-center text-sm opacity-60">
            {debouncedQuery ? "לא נמצאו רכבים תואמים" : "אין רכבים רשומים"}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-black/10 dark:border-white/10">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-black/[0.02] dark:bg-white/[0.03] text-xs uppercase tracking-wide">
                  <tr className="border-b border-black/10 dark:border-white/10 opacity-70">
                    <th className="px-4 py-2.5 font-medium text-start">מספר רישוי</th>
                    <th className="px-4 py-2.5 font-medium text-start">שם</th>
                    <th className="px-4 py-2.5 font-medium text-start">דירה</th>
                    <th className="px-4 py-2.5 font-medium text-start">טלפון</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5 dark:divide-white/5">
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className="hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors"
                    >
                      <td className="px-4 py-3 font-mono font-semibold align-top" dir="ltr">
                        {r.plate || "—"}
                        {r.additionalPlates && (
                          <div className="mt-0.5 text-[11px] font-normal opacity-50">
                            + {r.additionalPlates}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">{fullName(r)}</td>
                      <td className="px-4 py-3 opacity-80">{r.apartment ?? "—"}</td>
                      <td className="px-4 py-3 opacity-80" dir="ltr">
                        {r.phone ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!error && (
          <Pagination
            page={page}
            totalPages={totalPages}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={setPage}
          />
        )}
      </div>
    </div>
  );
}
