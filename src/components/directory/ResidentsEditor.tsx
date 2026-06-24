"use client";

import { ChevronDown, Plus } from "lucide-react";
import { useState } from "react";
import {
  createResident,
  updateResident,
} from "@/app/renters/actions";
import type { EditResident, EditApartmentOption } from "@/app/directory/actions";
import {
  ResidentForm,
  type ApartmentOption,
} from "@/app/renters/ResidentForm";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

const TYPE_LABEL: Record<EditResident["type"], string> = {
  owner: "בעלים",
  renter: "שוכר",
};

// Editor for the apartment's current residents (residents + phones, incl. po_box).
// Reuses the full ResidentForm. Only one form is mounted at a time (ResidentForm
// uses fixed field ids), so edit/add are mutually exclusive.
type Active =
  | { kind: "none" }
  | { kind: "edit"; id: number }
  | { kind: "add" };

type Props = {
  apartmentId: number;
  residents: EditResident[];
  apartmentOptions: EditApartmentOption[];
  onChanged: () => void;
};

export function ResidentsEditor({
  apartmentId,
  residents,
  apartmentOptions,
  onChanged,
}: Props) {
  const [active, setActive] = useState<Active>({ kind: "none" });

  const apartments: ApartmentOption[] = apartmentOptions.map((a) => ({
    id: a.id,
    number: a.number,
    zone_name: a.zone_name,
  }));

  return (
    <div className="space-y-3">
      {residents.length === 0 && active.kind !== "add" && (
        <p className="text-sm opacity-60">אין דיירים פעילים לדירה זו.</p>
      )}

      <div className="space-y-2">
        {residents.map((resident) => {
          const expanded =
            active.kind === "edit" && active.id === resident.id;
          return (
            <div
              key={resident.id}
              className="rounded-lg border border-black/10 dark:border-white/10"
            >
              <button
                type="button"
                onClick={() =>
                  setActive((a) =>
                    a.kind === "edit" && a.id === resident.id
                      ? { kind: "none" }
                      : { kind: "edit", id: resident.id }
                  )
                }
                aria-expanded={expanded}
                className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm"
              >
                <ChevronDown
                  size={14}
                  className={cn(
                    "shrink-0 opacity-60 transition-transform",
                    expanded && "rotate-180"
                  )}
                />
                <span className="font-medium">
                  {resident.first_name} {resident.last_name}
                </span>
                <span className="text-xs opacity-50">
                  · {TYPE_LABEL[resident.type]}
                </span>
                {resident.phones.length > 0 && (
                  <span className="text-xs opacity-40">
                    · {resident.phones.length} טלפונים
                  </span>
                )}
              </button>

              {expanded && (
                <div className="border-t border-black/10 p-3 dark:border-white/10">
                  <ResidentForm
                    apartments={apartments}
                    initialValues={{
                      first_name: resident.first_name,
                      last_name: resident.last_name,
                      apartment_id: String(apartmentId),
                      type: resident.type,
                      id_number: resident.id_number ?? "",
                      po_box: resident.po_box ?? "",
                      notes: resident.notes ?? "",
                    }}
                    initialPhones={resident.phones.map((p) => ({
                      number: p.number,
                      label: p.label,
                      comment: p.comment,
                      is_primary: p.is_primary,
                    }))}
                    hiddenIdValue={resident.id}
                    action={updateResident}
                    submitLabel="שמור דייר"
                    onCancel={() => setActive({ kind: "none" })}
                    onSuccess={() => {
                      setActive({ kind: "none" });
                      onChanged();
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {active.kind === "add" ? (
        <div className="rounded-lg border border-dashed border-black/15 p-3 dark:border-white/15">
          <p className="mb-3 text-xs font-medium opacity-70">דייר חדש</p>
          <ResidentForm
            apartments={apartments}
            initialValues={{
              apartment_id: String(apartmentId),
              type: "renter",
            }}
            action={createResident}
            submitLabel="הוסף דייר"
            onCancel={() => setActive({ kind: "none" })}
            onSuccess={() => {
              setActive({ kind: "none" });
              onChanged();
            }}
          />
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setActive({ kind: "add" })}
        >
          <Plus size={14} />
          הוסף דייר
        </Button>
      )}
    </div>
  );
}
