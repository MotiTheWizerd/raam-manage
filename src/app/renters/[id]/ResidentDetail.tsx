"use client";

import { useState } from "react";
import { updateResident } from "../actions";
import { ResidentForm, type ApartmentOption } from "../ResidentForm";
import { type PhoneInit } from "../PhoneFields";
import { ResidentView } from "./ResidentView";

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
  const [mode, setMode] = useState<"view" | "edit">("view");

  if (mode === "edit") {
    const initialPhones: PhoneInit[] = phones.map((p) => ({
      number: p.number,
      label: p.label,
      comment: p.comment,
      is_primary: p.is_primary === 1,
    }));

    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          עריכת דייר — {resident.first_name} {resident.last_name}
        </h1>
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
          onCancel={() => setMode("view")}
          onSuccess={() => setMode("view")}
          submitLabel="שמור שינויים"
        />
      </div>
    );
  }

  return (
    <ResidentView
      resident={resident}
      phones={phones}
      onEdit={() => setMode("edit")}
    />
  );
}
