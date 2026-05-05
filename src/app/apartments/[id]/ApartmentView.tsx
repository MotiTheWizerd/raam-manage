"use client";

import { Pencil } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

type Apartment = {
  id: number;
  number: string;
  floor: number | null;
  zone_id: number | null;
  zone_name: string | null;
  notes: string | null;
};

type ResidentRow = {
  id: number;
  first_name: string;
  last_name: string;
  type: "owner" | "renter";
  primary_phone: string | null;
};

type Asset = {
  id: number;
  type: "parking" | "storage";
  floor: number;
  number: string;
  notes: string | null;
};

const TYPE_LABEL: Record<ResidentRow["type"], string> = {
  owner: "בעלים",
  renter: "שוכר",
};

export function ApartmentView({
  apartment,
  residents,
  parking,
  storage,
  onEdit,
}: {
  apartment: Apartment;
  residents: ResidentRow[];
  parking: Asset[];
  storage: Asset[];
  onEdit: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            דירה {apartment.number}
          </h1>
          <p className="text-sm opacity-60 mt-1">
            {apartment.zone_name ?? "ללא אזור"}
            {apartment.floor !== null && ` · קומה ${apartment.floor}`}
          </p>
        </div>
        <Button onClick={onEdit} variant="secondary" size="sm">
          <Pencil size={14} />
          ערוך
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-4 max-w-xl">
        <Info label="מספר" value={apartment.number} />
        <Info label="קומה" value={apartment.floor} />
        <Info label="אזור" value={apartment.zone_name} />
      </div>

      <div>
        <div className="text-sm font-medium mb-2">דיירים</div>
        {residents.length === 0 ? (
          <p className="text-sm opacity-50">—</p>
        ) : (
          <ul className="space-y-1.5">
            {residents.map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-sm">
                <Link
                  href={`/renters/${r.id}`}
                  className="font-medium hover:text-red-600 dark:hover:text-red-400 transition-colors"
                >
                  {r.first_name} {r.last_name}
                </Link>
                <span className="opacity-60">— {TYPE_LABEL[r.type]}</span>
                {r.primary_phone && (
                  <span className="opacity-60 font-mono">· {r.primary_phone}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <AssetList label="חניות" assets={parking} emptyHint="אין חניות" />
      <AssetList label="מחסנים" assets={storage} emptyHint="אין מחסנים" />

      {apartment.notes && (
        <div>
          <div className="text-sm font-medium mb-2">הערות</div>
          <p className="text-sm whitespace-pre-wrap opacity-80">
            {apartment.notes}
          </p>
        </div>
      )}
    </div>
  );
}

function AssetList({
  label,
  assets,
  emptyHint,
}: {
  label: string;
  assets: Asset[];
  emptyHint: string;
}) {
  return (
    <div>
      <div className="text-sm font-medium mb-2">{label}</div>
      {assets.length === 0 ? (
        <p className="text-sm opacity-50">{emptyHint}</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {assets.map((a) => (
            <li key={a.id} className="flex items-baseline gap-2">
              <span className="font-mono opacity-80 min-w-[3.5rem]">
                קומה {a.floor}
              </span>
              <span className="font-medium">{a.number}</span>
              {a.notes && <span className="opacity-60">— {a.notes}</span>}
            </li>
          ))}
        </ul>
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
