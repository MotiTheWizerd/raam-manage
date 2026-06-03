"use client";

import { Download, Phone, Search, Trash2, X } from "lucide-react";
import { useActionState, useCallback, useEffect, useState } from "react";
import {
  deleteOwnerMobile,
  getOwners,
  type ApartmentOption,
  type OwnerFormState,
  type OwnerRow,
} from "@/app/owners/actions";
import { useIsManager } from "@/components/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useFormToasts } from "@/lib/hooks/useFormToasts";
import { AddOwnerButton } from "./AddOwnerButton";
import { AddOwnerMobileForm } from "./AddOwnerMobileForm";
import { EditOwnerButton } from "./EditOwnerButton";

const initial: OwnerFormState = {};

function DeleteMobileButton({ id, onDeleted }: { id: number; onDeleted: () => void }) {
  const [state, action, pending] = useActionState(deleteOwnerMobile, initial);
  useFormToasts(state, "הטלפון נמחק");
  useEffect(() => {
    if (state.submittedAt) Promise.resolve().then(onDeleted);
  }, [state.submittedAt, onDeleted]);

  return (
    <form action={action} className="inline-flex">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        aria-label="מחק טלפון"
        className="inline-flex items-center justify-center h-5 w-5 rounded opacity-30 hover:opacity-100 hover:text-red-600 transition-all"
      >
        <Trash2 size={11} />
      </button>
    </form>
  );
}

type Props = { initial: OwnerRow[]; apartments: ApartmentOption[] };

export function OwnersView({ initial: initialOwners, apartments }: Props) {
  const [owners, setOwners] = useState<OwnerRow[]>(initialOwners);
  const [query, setQuery] = useState("");
  const [exporting, setExporting] = useState(false);
  const isManager = useIsManager();

  const refresh = useCallback(() => {
    getOwners().then(setOwners);
  }, []);

  const q = query.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, "");
  const filtered = q
    ? owners.filter((o) => {
        if (`${o.first_name} ${o.last_name}`.toLowerCase().includes(q)) return true;
        if ((o.apartment_number ?? "").toLowerCase().includes(q)) return true;
        if (qDigits && o.mobiles.some((m) => m.phone.replace(/\D/g, "").includes(qDigits))) {
          return true;
        }
        return false;
      })
    : owners;

  async function exportToExcel() {
    if (filtered.length === 0) return;
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const rows = filtered.map((o) => ({
        "שם פרטי": o.first_name,
        "שם משפחה": o.last_name,
        דירה: o.apartment_number ?? "",
        טלפונים: o.mobiles
          .map((m) => (m.comment ? `${m.phone} (${m.comment})` : m.phone))
          .join(" | "),
        הערות: o.comments ?? "",
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "בעלי דירות");
      const today = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `owners-${today}.xlsx`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">בעלי דירות</h1>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={exportToExcel}
            disabled={exporting || filtered.length === 0}
          >
            <Download size={14} />
            {exporting ? "מייצא..." : "ייצוא לאקסל"}
          </Button>
          {isManager && <AddOwnerButton onCreated={refresh} apartments={apartments} />}
        </div>
      </header>

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
          placeholder="חיפוש לפי שם, דירה או טלפון"
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

      {owners.length === 0 ? (
        <div className="rounded-lg border border-dashed border-black/10 dark:border-white/10 p-10 text-center text-sm opacity-60">
          אין בעלי דירות עדיין
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-black/10 dark:border-white/10 p-8 text-center text-sm opacity-60">
          לא נמצאו תוצאות עבור &quot;{query}&quot;
        </div>
      ) : (
        <div className="rounded-lg border border-black/10 dark:border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.02] dark:bg-white/[0.03] text-xs uppercase tracking-wide">
              <tr className="border-b border-black/10 dark:border-white/10 opacity-70">
                <th className="px-4 py-2.5 font-medium text-start">שם</th>
                <th className="px-4 py-2.5 font-medium text-start w-20">דירה</th>
                <th className="px-4 py-2.5 font-medium text-start">טלפונים</th>
                <th className="px-4 py-2.5 font-medium text-start">הערות</th>
                <th className="px-4 py-2.5 font-medium text-end w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 dark:divide-white/5">
              {filtered.map((owner) => (
                <tr
                  key={owner.id}
                  className="hover:bg-black/[0.015] dark:hover:bg-white/[0.02] transition-colors align-top"
                >
                  <td className="px-4 py-3 font-medium">
                    {owner.first_name} {owner.last_name}
                  </td>
                  <td className="px-4 py-3 opacity-80">
                    {owner.apartment_number ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      {owner.mobiles.length === 0 && !isManager && (
                        <span className="text-xs opacity-40">—</span>
                      )}
                      {owner.mobiles.map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center gap-2 text-xs"
                        >
                          <Phone size={11} className="opacity-40 shrink-0" />
                          <span dir="ltr" className="font-mono">
                            {m.phone}
                          </span>
                          {m.comment && (
                            <span className="opacity-50">· {m.comment}</span>
                          )}
                          {isManager && (
                            <DeleteMobileButton id={m.id} onDeleted={refresh} />
                          )}
                        </div>
                      ))}
                      {isManager && (
                        <AddOwnerMobileForm
                          ownerId={owner.id}
                          onAdded={refresh}
                        />
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs opacity-70 max-w-xs">
                    {owner.comments ? (
                      <div
                        className="line-clamp-2 whitespace-pre-wrap"
                        title={owner.comments}
                      >
                        {owner.comments}
                      </div>
                    ) : (
                      <span className="opacity-40">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-end">
                    {isManager && (
                      <EditOwnerButton
                        id={owner.id}
                        firstName={owner.first_name}
                        lastName={owner.last_name}
                        apartmentId={owner.apartment_id}
                        apartments={apartments}
                        comments={owner.comments}
                        onUpdated={refresh}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
