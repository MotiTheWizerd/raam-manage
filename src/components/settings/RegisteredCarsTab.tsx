"use client";

import { Briefcase, Home, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import {
  getRegisteredCarsPage,
  getRegisteredCarsSummary,
  type RegisteredCarRow,
  type RegisteredCarsSummary,
} from "@/app/settings/registered-cars-actions";
import { Input } from "@/components/ui/Input";
import { Pagination } from "@/components/ui/Pagination";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";

const PAGE_SIZE = 15;

const EMPLOYEE_COLOR = "#0284c7";
const RESIDENT_COLOR = "#059669";

function fullName(r: RegisteredCarRow): string {
  const name = [r.firstName, r.lastName].filter(Boolean).join(" ").trim();
  return name || "—";
}

function CompositionDonut({ summary }: { summary: RegisteredCarsSummary }) {
  const data = [
    { name: "דיירים", value: summary.residents, color: RESIDENT_COLOR },
    { name: "עובדים", value: summary.employees, color: EMPLOYEE_COLOR },
  ];

  return (
    <div className="grid gap-4 rounded-lg border border-black/10 dark:border-white/10 bg-white/40 dark:bg-white/[0.02] p-4 sm:grid-cols-[10rem_1fr] sm:items-center">
      <div className="relative h-40">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={42}
              outerRadius={64}
              paddingAngle={2}
              stroke="none"
              animationDuration={700}
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: "1px solid rgba(0,0,0,0.1)",
                background: "rgba(255,255,255,0.95)",
                color: "#111",
              }}
              formatter={(v, n) => [Number(v ?? 0), String(n)]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums">
            {summary.total}
          </span>
          <span className="text-[11px] opacity-60">רכבים</span>
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <Home size={15} style={{ color: RESIDENT_COLOR }} aria-hidden="true" />
          <span className="opacity-80">דיירים</span>
          <span className="font-semibold tabular-nums">{summary.residents}</span>
        </div>
        <div className="flex items-center gap-2">
          <Briefcase
            size={15}
            style={{ color: EMPLOYEE_COLOR }}
            aria-hidden="true"
          />
          <span className="opacity-80">עובדים</span>
          <span className="font-semibold tabular-nums">{summary.employees}</span>
        </div>
        <div className="pt-1 text-xs opacity-60">
          {summary.withApartment} משויכים לדירה
        </div>
      </div>
    </div>
  );
}

export function RegisteredCarsTab() {
  const [summary, setSummary] = useState<RegisteredCarsSummary | null>(null);
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
    getRegisteredCarsSummary()
      .then((s) => {
        if (active) setSummary(s);
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
        setError(
          e instanceof Error ? e.message : "טעינת הרכבים הרשומים נכשלה"
        );
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
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-medium opacity-80">רכבים רשומים במערכת החניון</h2>
        <p className="text-xs opacity-60">
          נתונים לקריאה בלבד ממערכת זיהוי הלוחיות (SLPR)
        </p>
      </div>

      {summary && <CompositionDonut summary={summary} />}

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
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-black/[0.02] dark:bg-white/[0.03] text-xs uppercase tracking-wide">
                <tr className="border-b border-black/10 dark:border-white/10 opacity-70">
                  <th className="px-4 py-2.5 font-medium text-start">מספר רישוי</th>
                  <th className="px-4 py-2.5 font-medium text-start">שם</th>
                  <th className="px-4 py-2.5 font-medium text-start">דירה</th>
                  <th className="px-4 py-2.5 font-medium text-start">טלפון</th>
                  <th className="px-4 py-2.5 font-medium text-start">סוג</th>
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
                    <td className="px-4 py-3">
                      {r.isEmployee ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-300">
                          <Briefcase size={12} aria-hidden="true" />
                          עובד
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                          <Home size={12} aria-hidden="true" />
                          דייר
                        </span>
                      )}
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
  );
}
