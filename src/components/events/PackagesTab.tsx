"use client";

import { Mail, Package, Search, Shirt, Users, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  getApartmentResidents,
  type ApartmentResidentOption,
} from "@/app/events/actions";
import {
  getPackagesPage,
  getPackagesPendingStats,
  getResidentPendingPackages,
  searchPackages,
  type PackageRow,
  type PackageStatusFilter,
  type PackagesPendingStats,
} from "@/app/events/packages-actions";
import { Dropdown } from "@/components/ui/Dropdown";
import { Input } from "@/components/ui/Input";
import { Pagination } from "@/components/ui/Pagination";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { cn } from "@/lib/cn";
import { AddPackageButton } from "./AddPackageButton";
import { MarkDeliveredButton } from "./MarkDeliveredButton";
import { PackagesHistoryList } from "./PackagesHistoryList";

const HISTORY_PAGE_SIZE = 10;

const STATUS_OPTIONS: { value: PackageStatusFilter; label: string }[] = [
  { value: "all", label: "הכל" },
  { value: "pending", label: "ממתינות" },
  { value: "delivered", label: "הושלמו" },
];

type Props = {
  residentId: number | null;
  apartmentId: number | null;
};

const TYPE_LABEL: Record<PackageRow["type"], string> = {
  package: "חבילה",
  envelope: "מעטפה",
  laundry: "כביסה",
};

const TYPE_ICON: Record<PackageRow["type"], typeof Package> = {
  package: Package,
  envelope: Mail,
  laundry: Shirt,
};

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

export function PackagesTab({ residentId, apartmentId }: Props) {
  const [pending, setPending] = useState<PackageRow[] | null>(null);
  const [history, setHistory] = useState<PackageRow[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [residents, setResidents] = useState<ApartmentResidentOption[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<PackageStatusFilter>("all");
  const [stats, setStats] = useState<PackagesPendingStats | null>(null);

  useEffect(() => {
    let active = true;
    getPackagesPendingStats().then((s) => {
      if (active) setStats(s);
    });
    return () => {
      active = false;
    };
  }, [refreshTick]);
  const debouncedQuery = useDebouncedValue(query.trim(), 250);
  const searching = debouncedQuery.length > 0;

  useEffect(() => {
    setHistoryPage(1);
  }, [statusFilter, debouncedQuery]);

  useEffect(() => {
    let active = true;

    if (searching) {
      searchPackages(debouncedQuery, 50, statusFilter).then((rows) => {
        if (!active) return;
        setHistory(rows);
        setHistoryTotal(rows.length);
        setHistoryTotalPages(1);
      });
      return () => { active = false; };
    }

    if (residentId === null) {
      getPackagesPage(null, historyPage, HISTORY_PAGE_SIZE, statusFilter).then((result) => {
        if (!active) return;
        setHistory(result.rows);
        setHistoryTotal(result.total);
        setHistoryTotalPages(result.totalPages);
        if (result.page !== historyPage) setHistoryPage(result.page);
        setPending([]);
        setResidents([]);
      });
    } else {
      Promise.all([
        getResidentPendingPackages(residentId),
        getPackagesPage(residentId, historyPage, HISTORY_PAGE_SIZE, statusFilter),
        apartmentId !== null
          ? getApartmentResidents(apartmentId)
          : Promise.resolve([] as ApartmentResidentOption[]),
      ]).then(([pendingRows, historyResult, residentRows]) => {
        if (!active) return;
        setPending(pendingRows);
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
            <h2 className="text-sm font-medium opacity-80">חבילות ממתינות</h2>
            <AddPackageButton
              defaultResidentId={residentId}
              residents={residents}
              onCreated={refresh}
            />
          </div>

          <PendingSection
            packages={pending}
            onMarkDelivered={refresh}
          />
        </>
      )}

      <section className="space-y-3">
        <div className="flex items-center gap-4 rounded-lg border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] px-4 py-3 text-sm">
          <div className="flex items-center gap-2">
            <Package size={16} className="opacity-60 shrink-0" />
            <span className="text-lg font-semibold tabular-nums">
              {stats?.totalPending ?? "—"}
            </span>
            <span className="opacity-70">חבילות ממתינות</span>
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
            onChange={(v) => setStatusFilter(v as PackageStatusFilter)}
            className="w-32"
          />
        </div>

        <PackagesHistoryList rows={history} onDeleted={refresh} onMarkDelivered={refresh} />

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

function PendingSection({
  packages,
  onMarkDelivered,
}: {
  packages: PackageRow[] | null;
  onMarkDelivered: () => void;
}) {
  if (packages === null) {
    return (
      <div className="text-sm opacity-60 py-6 text-center">טוען חבילות...</div>
    );
  }

  if (packages.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-black/10 dark:border-white/10 p-6 text-center text-sm opacity-60">
        אין חבילות ממתינות לדייר זה.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-black/[0.02] dark:bg-white/[0.03] text-xs uppercase tracking-wide">
          <tr className="border-b border-black/10 dark:border-white/10 opacity-70">
            <th className="px-4 py-2.5 font-medium text-start">סוג</th>
            <th className="px-4 py-2.5 font-medium text-start">כיוון</th>
            <th className="px-4 py-2.5 font-medium text-start">נמסרה ע״י</th>
            <th className="px-4 py-2.5 font-medium text-start">התקבלה ע״י</th>
            <th className="px-4 py-2.5 font-medium text-start">זמן</th>
            <th className="px-4 py-2.5 font-medium text-start">הערה</th>
            <th className="px-4 py-2.5 font-medium text-start"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5 dark:divide-white/5">
          {packages.map((p) => {
            const Icon = TYPE_ICON[p.type];
            return (
              <tr
                key={p.id}
                className="hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Icon size={14} className="opacity-70 shrink-0" />
                    <span className="font-medium">{TYPE_LABEL[p.type]}</span>
                  </div>
                </td>
                <td className="px-4 py-3 opacity-80">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                      p.direction === "in"
                        ? "bg-sky-500/10 text-sky-700 dark:text-sky-300"
                        : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                    )}
                  >
                    {p.direction === "in" ? "נכנסת" : "יוצאת"}
                  </span>
                </td>
                <td className="px-4 py-3 opacity-80">{p.delivered_by}</td>
                <td className="px-4 py-3 opacity-80">{p.received_by || "—"}</td>
                <td className="px-4 py-3 opacity-80 text-xs">
                  {formatTimestamp(p.created_at)}
                </td>
                <td className="px-4 py-3 opacity-80 text-xs max-w-xs truncate">
                  {p.comment ?? "—"}
                </td>
                <td className="px-4 py-3 text-end">
                  <MarkDeliveredButton
                    packageId={p.id}
                    onSuccess={onMarkDelivered}
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
