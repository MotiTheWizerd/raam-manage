"use client";

import { Pencil, Star } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

type Phone = {
  id: number;
  number: string;
  label: string | null;
  comment: string | null;
  is_primary: number;
};

type Resident = {
  id: number;
  first_name: string;
  last_name: string;
  type: "owner" | "renter";
  id_number: string | null;
  po_box: string | null;
  notes: string | null;
  apartment_number: string | null;
  zone_name: string | null;
};

const TYPE_LABEL: Record<Resident["type"], string> = {
  owner: "בעלים",
  renter: "שוכר",
};

export function ResidentView({
  resident,
  phones,
  onEdit,
}: {
  resident: Resident;
  phones: Phone[];
  onEdit: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {resident.first_name} {resident.last_name}
          </h1>
          <p className="text-sm opacity-60 mt-1">
            {TYPE_LABEL[resident.type]}
            {" · "}
            {resident.apartment_number ?? "—"}
            {resident.zone_name && ` · ${resident.zone_name}`}
          </p>
        </div>
        <Button onClick={onEdit} variant="secondary" size="sm">
          <Pencil size={14} />
          ערוך
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-4 max-w-xl">
        <Info label="דירה" value={resident.apartment_number} />
        <Info label="אזור" value={resident.zone_name} />
        <Info label="סוג" value={TYPE_LABEL[resident.type]} />
        <Info label='ת"ז' value={resident.id_number} mono />
        <Info label="תיבת דואר" value={resident.po_box} />
      </div>

      <div>
        <div className="text-sm font-medium mb-2">טלפונים</div>
        {phones.length === 0 ? (
          <p className="text-sm opacity-50">—</p>
        ) : (
          <ul className="space-y-1.5">
            {phones.map((p) => (
              <li key={p.id} className="flex items-center gap-2 text-sm">
                <Star
                  size={14}
                  className={cn(
                    "shrink-0",
                    p.is_primary
                      ? "fill-red-500 text-red-500"
                      : "text-zinc-300 dark:text-zinc-600"
                  )}
                  aria-hidden="true"
                />
                <span className="font-mono">{p.number}</span>
                {p.label && <span className="opacity-60">({p.label})</span>}
                {p.comment && (
                  <span className="opacity-60">— {p.comment}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {resident.notes && (
        <div>
          <div className="text-sm font-medium mb-2">הערות</div>
          <p className="text-sm whitespace-pre-wrap opacity-80">
            {resident.notes}
          </p>
        </div>
      )}
    </div>
  );
}

function Info({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | number | null | undefined;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-xs opacity-60 mb-0.5">{label}</div>
      <div className={cn("text-sm", mono && "font-mono")}>
        {value ?? <span className="opacity-50">—</span>}
      </div>
    </div>
  );
}
