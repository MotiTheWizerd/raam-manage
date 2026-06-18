"use client";

import { Armchair, ShoppingCart, Table2 } from "lucide-react";
import {
  deleteEquipmentLoan,
  type EquipmentLoanRow,
} from "@/app/events/equipment-actions";
import { useIsManager } from "@/components/AuthProvider";
import { ApartmentLink, ResidentLink } from "@/components/entity-links";
import { cn } from "@/lib/cn";
import { DeleteEventButton } from "./DeleteEventButton";
import { MarkReturnedButton } from "./MarkReturnedButton";

type Props = {
  rows: EquipmentLoanRow[];
  onDeleted: () => void;
  onMarkReturned: () => void;
};

const TYPE_ICON: Record<EquipmentLoanRow["type"], typeof Armchair> = {
  chairs: Armchair,
  tables: Table2,
  cart: ShoppingCart,
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

function borrowerLabel(r: EquipmentLoanRow) {
  return r.resident_full_name ?? r.borrower_name ?? "—";
}

function borrowerNode(r: EquipmentLoanRow) {
  const label = borrowerLabel(r);
  if (r.resident_id === null || !r.resident_full_name) return label;
  return (
    <ResidentLink id={r.resident_id} isNewTab>
      {label}
    </ResidentLink>
  );
}

export function EquipmentLoansHistoryList({
  rows,
  onDeleted,
  onMarkReturned,
}: Props) {
  const isManager = useIsManager();
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium opacity-80">השאלות אחרונות</h2>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-black/10 dark:border-white/10 p-6 text-center text-sm opacity-60">
          אין השאלות עדיין
        </div>
      ) : (
        <ul className="rounded-lg border border-black/10 dark:border-white/10 divide-y divide-black/5 dark:divide-white/5 overflow-hidden">
          {rows.map((r) => {
            const Icon = TYPE_ICON[r.type];
            const returned = r.is_returned === 1;

            return (
              <li
                key={r.id}
                className="flex items-start gap-3 px-4 py-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors"
              >
                <div
                  className={cn(
                    "shrink-0 mt-0.5 inline-flex items-center justify-center h-7 w-7 rounded-full",
                    returned
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
                        {r.apartment_id ? (
                          <ApartmentLink id={r.apartment_id} isNewTab>
                            דירה {r.apartment_number}
                          </ApartmentLink>
                        ) : (
                          <>דירה {r.apartment_number}</>
                        )}{" "}
                        ·
                      </span>
                    )}
                    <span className="font-medium">{borrowerNode(r)}</span>
                    <span className="text-xs opacity-70">
                      · {r.quantity} {typeLabel(r.type, r.quantity)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs opacity-70 flex flex-wrap gap-x-2">
                    <span>פקיד: {r.lobbyist_name}</span>
                    <span>· הושאלה: {formatTimestamp(r.created_at)}</span>
                    {returned && r.returned_at && (
                      <span className="text-emerald-700 dark:text-emerald-300">
                        · הוחזרה: {formatTimestamp(r.returned_at)}
                      </span>
                    )}
                    {returned && r.returned_by && (
                      <span>· קיבל בחזרה: {r.returned_by}</span>
                    )}
                    {!returned && (
                      <span className="text-amber-700 dark:text-amber-300">
                        · פתוחה
                      </span>
                    )}
                  </div>
                  {r.comment && (
                    <div className="mt-1 text-sm">{r.comment}</div>
                  )}
                </div>
                <div className="shrink-0 self-center flex items-center gap-1">
                  {!returned && (
                    <MarkReturnedButton
                      loanId={r.id}
                      onSuccess={onMarkReturned}
                      compact
                    />
                  )}
                  {isManager && (
                    <DeleteEventButton
                      id={r.id}
                      action={deleteEquipmentLoan}
                      successMessage="ההשאלה נמחקה"
                      confirmTitle="מחיקת השאלה"
                      confirmDescription="האם למחוק את רישום ההשאלה? פעולה זו אינה ניתנת לביטול."
                      ariaLabel="מחק השאלה"
                      onDeleted={onDeleted}
                    />
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
