"use client";

import { Armchair, Search, Users, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  getApartmentResidents,
  type ApartmentResidentOption,
} from "@/app/events/actions";
import {
  getEquipmentLoansPage,
  getEquipmentLoansStats,
  getResidentOpenLoans,
  searchEquipmentLoans,
  type EquipmentLoanRow,
  type EquipmentLoanStatusFilter,
  type EquipmentLoansStats,
} from "@/app/events/equipment-actions";
import { Dropdown } from "@/components/ui/Dropdown";
import { Input } from "@/components/ui/Input";
import { Pagination } from "@/components/ui/Pagination";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { cn } from "@/lib/cn";
import { AddEquipmentLoanButton } from "./AddEquipmentLoanButton";
import { EquipmentLoansHistoryList } from "./EquipmentLoansHistoryList";
import { MarkReturnedButton } from "./MarkReturnedButton";

const HISTORY_PAGE_SIZE = 10;

const STATUS_OPTIONS: { value: EquipmentLoanStatusFilter; label: string }[] = [
  { value: "all", label: "הכל" },
  { value: "open", label: "פתוחות" },
  { value: "returned", label: "הוחזרו" },
];

type Props = {
  residentId: number | null;
  apartmentId: number | null;
};

function typeLabel(type: EquipmentLoanRow["type"], qty: number): string {
  if (type === "chairs") return qty === 1 ? "כיסא" : "כיסאות";
  if (type === "cart") return qty === 1 ? "עגלת משא" : "עגלות משא";
  return qty === 1 ? "שולחן" : "שולחנות";
}

function formatTimestamp(iso: string) {
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

export function EquipmentTab({ residentId, apartmentId }: Props) {
  const [openLoans, setOpenLoans] = useState<EquipmentLoanRow[] | null>(null);
  const [history, setHistory] = useState<EquipmentLoanRow[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [residents, setResidents] = useState<ApartmentResidentOption[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<EquipmentLoanStatusFilter>("all");
  const [stats, setStats] = useState<EquipmentLoansStats | null>(null);
  const debouncedQuery = useDebouncedValue(query.trim(), 250);
  const searching = debouncedQuery.length > 0;

  useEffect(() => {
    let active = true;
    getEquipmentLoansStats().then((s) => {
      if (active) setStats(s);
    });
    return () => {
      active = false;
    };
  }, [refreshTick]);

  useEffect(() => {
    setHistoryPage(1);
  }, [statusFilter, debouncedQuery]);

  useEffect(() => {
    let active = true;

    if (searching) {
      searchEquipmentLoans(debouncedQuery, 50, statusFilter).then((rows) => {
        if (!active) return;
        setHistory(rows);
        setHistoryTotal(rows.length);
        setHistoryTotalPages(1);
      });
      return () => {
        active = false;
      };
    }

    if (residentId === null) {
      getEquipmentLoansPage(null, historyPage, HISTORY_PAGE_SIZE, statusFilter).then(
        (result) => {
          if (!active) return;
          setHistory(result.rows);
          setHistoryTotal(result.total);
          setHistoryTotalPages(result.totalPages);
          if (result.page !== historyPage) setHistoryPage(result.page);
          setOpenLoans([]);
          setResidents([]);
        }
      );
    } else {
      Promise.all([
        getResidentOpenLoans(residentId),
        getEquipmentLoansPage(residentId, historyPage, HISTORY_PAGE_SIZE, statusFilter),
        apartmentId !== null
          ? getApartmentResidents(apartmentId)
          : Promise.resolve([] as ApartmentResidentOption[]),
      ]).then(([openRows, historyResult, residentRows]) => {
        if (!active) return;
        setOpenLoans(openRows);
        setHistory(historyResult.rows);
        setHistoryTotal(historyResult.total);
        setHistoryTotalPages(historyResult.totalPages);
        if (historyResult.page !== historyPage) setHistoryPage(historyResult.page);
        setResidents(residentRows);
      });
    }

    return () => {
      active = false;
    };
  }, [residentId, apartmentId, refreshTick, historyPage, searching, debouncedQuery, statusFilter]);

  const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);

  return (
    <div className="space-y-6">
      {residentId !== null && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium opacity-80">השאלות פתוחות</h2>
            <AddEquipmentLoanButton
              defaultResidentId={residentId}
              residents={residents}
              onCreated={refresh}
            />
          </div>

          <OpenSection loans={openLoans} onMarkReturned={refresh} />
        </>
      )}

      <section className="space-y-3">
        <div className="flex items-center gap-4 rounded-lg border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] px-4 py-3 text-sm">
          <div className="flex items-center gap-2">
            <Armchair size={16} className="opacity-60 shrink-0" />
            <span className="text-lg font-semibold tabular-nums">
              {stats?.totalOpen ?? "—"}
            </span>
            <span className="opacity-70">השאלות פתוחות</span>
          </div>
          <div
            className="h-5 w-px bg-black/10 dark:bg-white/10"
            aria-hidden="true"
          />
          <div className="flex items-center gap-2">
            <Users size={16} className="opacity-60 shrink-0" />
            <span className="text-lg font-semibold tabular-nums">
              {stats?.uniqueResidents ?? "—"}
            </span>
            <span className="opacity-70">דיירים שונים</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative max-w-sm flex-1 min-w-[16rem]">
            <Search
              size={14}
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-3 opacity-50"
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="חיפוש לפי שם דייר או מספר דירה"
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
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as EquipmentLoanStatusFilter)}
            className="w-32"
          />
        </div>

        <EquipmentLoansHistoryList
          rows={history}
          onDeleted={refresh}
          onMarkReturned={refresh}
        />

        {!searching && (
          <Pagination
            page={historyPage}
            totalPages={historyTotalPages}
            pageSize={HISTORY_PAGE_SIZE}
            total={historyTotal}
            onPageChange={setHistoryPage}
          />
        )}
      </section>
    </div>
  );
}

function OpenSection({
  loans,
  onMarkReturned,
}: {
  loans: EquipmentLoanRow[] | null;
  onMarkReturned: () => void;
}) {
  if (loans === null) {
    return (
      <div className="text-sm opacity-60 py-6 text-center">טוען השאלות...</div>
    );
  }

  if (loans.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-black/10 dark:border-white/10 p-6 text-center text-sm opacity-60">
        אין השאלות פתוחות לדייר זה.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-black/[0.02] dark:bg-white/[0.03] text-xs uppercase tracking-wide">
          <tr className="border-b border-black/10 dark:border-white/10 opacity-70">
            <th className="px-4 py-2.5 font-medium text-start">ציוד</th>
            <th className="px-4 py-2.5 font-medium text-start">כמות</th>
            <th className="px-4 py-2.5 font-medium text-start">פקיד</th>
            <th className="px-4 py-2.5 font-medium text-start">זמן</th>
            <th className="px-4 py-2.5 font-medium text-start">הערה</th>
            <th className="px-4 py-2.5 font-medium text-start"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5 dark:divide-white/5">
          {loans.map((l) => {
            return (
              <tr
                key={l.id}
                className="hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors"
              >
                <td className="px-4 py-3 font-medium">
                  {typeLabel(l.type, l.quantity)}
                </td>
                <td className={cn("px-4 py-3 tabular-nums")}>{l.quantity}</td>
                <td className="px-4 py-3 opacity-80">{l.lobbyist_name}</td>
                <td className="px-4 py-3 opacity-80 text-xs">
                  {formatTimestamp(l.created_at)}
                </td>
                <td className="px-4 py-3 opacity-80 text-xs max-w-xs truncate">
                  {l.comment ?? "—"}
                </td>
                <td className="px-4 py-3 text-end">
                  <MarkReturnedButton
                    loanId={l.id}
                    onSuccess={onMarkReturned}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
