"use client";

import { ArrowLeft, ArrowRight, Mail, Package, Shirt } from "lucide-react";
import type { PackageRow } from "@/app/events/packages-actions";
import { cn } from "@/lib/cn";

type Props = {
  rows: PackageRow[];
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

function recipientLabel(r: PackageRow) {
  return r.resident_full_name ?? r.recipient_name ?? "—";
}

export function PackagesHistoryList({ rows }: Props) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium opacity-80">חבילות אחרונות</h2>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-black/10 dark:border-white/10 p-6 text-center text-sm opacity-60">
          אין חבילות עדיין
        </div>
      ) : (
        <ul className="rounded-lg border border-black/10 dark:border-white/10 divide-y divide-black/5 dark:divide-white/5 overflow-hidden">
          {rows.map((r) => {
            const Icon = TYPE_ICON[r.type];
            const incoming = r.direction === "in";
            const Arrow = incoming ? ArrowLeft : ArrowRight;
            const delivered = r.is_delivered === 1;

            return (
              <li
                key={r.id}
                className="flex items-start gap-3 px-4 py-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors"
              >
                <div
                  className={cn(
                    "shrink-0 mt-0.5 inline-flex items-center justify-center h-7 w-7 rounded-full",
                    delivered
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                  )}
                >
                  <Icon size={14} aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                    {r.apartment_number && (
                      <span className="font-medium">
                        דירה {r.apartment_number} ·
                      </span>
                    )}
                    <span className="font-medium">{recipientLabel(r)}</span>
                    <span className="text-xs opacity-70">
                      · {TYPE_LABEL[r.type]}
                    </span>
                    <Arrow
                      size={12}
                      aria-hidden="true"
                      className={cn(
                        "opacity-70",
                        incoming
                          ? "text-sky-700 dark:text-sky-300"
                          : "text-amber-700 dark:text-amber-300"
                      )}
                    />
                  </div>
                  <div className="mt-0.5 text-xs opacity-70 flex flex-wrap gap-x-2">
                    <span>נמסרה ע״י: {r.delivered_by}</span>
                    {r.received_by && <span>· התקבלה ע״י: {r.received_by}</span>}
                    <span>· התקבלה: {formatTimestamp(r.created_at)}</span>
                    {delivered && r.delivered_at && (
                      <span className="text-emerald-700 dark:text-emerald-300">
                        · נמסרה: {formatTimestamp(r.delivered_at)}
                      </span>
                    )}
                    {!delivered && (
                      <span className="text-amber-700 dark:text-amber-300">
                        · ממתינה
                      </span>
                    )}
                  </div>
                  {r.comment && (
                    <div className="mt-1 text-sm">{r.comment}</div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
