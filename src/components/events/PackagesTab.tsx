"use client";

import { Mail, Package, Shirt } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  getApartmentResidents,
  type ApartmentResidentOption,
} from "@/app/events/actions";
import {
  getRecentPackages,
  getResidentPendingPackages,
  type PackageRow,
} from "@/app/events/packages-actions";
import { cn } from "@/lib/cn";
import { AddPackageButton } from "./AddPackageButton";
import { MarkDeliveredButton } from "./MarkDeliveredButton";
import { PackagesHistoryList } from "./PackagesHistoryList";

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
  const [residents, setResidents] = useState<ApartmentResidentOption[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let active = true;

    if (residentId === null) {
      // No resident — global history only
      getRecentPackages(null, 10).then((rows) => {
        if (!active) return;
        setHistory(rows);
        setPending([]);
        setResidents([]);
      });
    } else {
      Promise.all([
        getResidentPendingPackages(residentId),
        getRecentPackages(residentId, 10),
        apartmentId !== null
          ? getApartmentResidents(apartmentId)
          : Promise.resolve([] as ApartmentResidentOption[]),
      ]).then(([pendingRows, historyRows, residentRows]) => {
        if (!active) return;
        setPending(pendingRows);
        setHistory(historyRows);
        setResidents(residentRows);
      });
    }

    return () => {
      active = false;
    };
  }, [residentId, apartmentId, refreshTick]);

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

      <PackagesHistoryList rows={history} onDeleted={refresh} />
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
