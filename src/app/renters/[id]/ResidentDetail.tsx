"use client";

import { useIsManager } from "@/components/AuthProvider";
import { updateResident } from "../actions";
import { ResidentForm, type ApartmentOption } from "../ResidentForm";
import { type PhoneInit } from "../PhoneFields";
import { ResidentCars } from "./ResidentCars";

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
  apartment_id: number;
  type: "owner" | "renter";
  id_number: string | null;
  po_box: string | null;
  notes: string | null;
  apartment_number: string | null;
  apartment_comment: string | null;
  zone_name: string | null;
};

export function ResidentDetail({
  resident,
  phones,
  apartments,
}: {
  resident: Resident;
  phones: Phone[];
  apartments: ApartmentOption[];
}) {
  const initialPhones: PhoneInit[] = phones.map((p) => ({
    number: p.number,
    label: p.label,
    comment: p.comment,
    is_primary: p.is_primary === 1,
  }));

  const canEdit = useIsManager();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        {canEdit ? "עריכת דייר" : "פרטי דייר"} — {resident.first_name}{" "}
        {resident.last_name}
      </h1>
      <fieldset disabled={!canEdit} className="min-w-0 border-0 p-0 m-0">
        <ResidentForm
          apartments={apartments}
          initialValues={{
            first_name: resident.first_name,
            last_name: resident.last_name,
            apartment_id: String(resident.apartment_id),
            type: resident.type,
            id_number: resident.id_number ?? "",
            po_box: resident.po_box ?? "",
            notes: resident.notes ?? "",
          }}
          initialPhones={initialPhones}
          hiddenIdValue={resident.id}
          action={updateResident}
          submitLabel="שמור שינויים"
        />
      </fieldset>

      {resident.apartment_comment && (
        <div className="rounded-lg border border-black/10 dark:border-white/10 p-4 space-y-1">
          <div className="text-xs uppercase tracking-wide opacity-60">
            הערת דירה
            {resident.apartment_number ? ` — דירה ${resident.apartment_number}` : ""}
          </div>
          <p className="text-sm whitespace-pre-wrap">{resident.apartment_comment}</p>
        </div>
      )}

      <ResidentCars apartmentNumber={resident.apartment_number} />
    </div>
  );
}
