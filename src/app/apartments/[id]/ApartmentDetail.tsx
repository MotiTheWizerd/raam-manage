"use client";

import { updateApartment } from "../actions";
import { ApartmentForm, type Zone } from "../ApartmentForm";
import type { AssetInit } from "../AssetsFields";

type Apartment = {
  id: number;
  number: string;
  floor: number | null;
  zone_id: number | null;
  zone_name: string | null;
  notes: string | null;
};

type Asset = {
  id: number;
  type: "parking" | "storage";
  floor: number;
  number: string;
  notes: string | null;
};

export function ApartmentDetail({
  apartment,
  parking,
  storage,
  zones,
}: {
  apartment: Apartment;
  parking: Asset[];
  storage: Asset[];
  zones: Zone[];
}) {
  const toInit = (assets: Asset[]): AssetInit[] =>
    assets.map((a) => ({
      floor: a.floor,
      number: a.number,
      notes: a.notes,
    }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        עריכת דירה {apartment.number}
      </h1>
      <ApartmentForm
        zones={zones}
        initialValues={{
          number: apartment.number,
          floor: apartment.floor !== null ? String(apartment.floor) : "",
          zone_id:
            apartment.zone_id !== null ? String(apartment.zone_id) : "",
          notes: apartment.notes ?? "",
        }}
        initialParking={toInit(parking)}
        initialStorage={toInit(storage)}
        hiddenIdValue={apartment.id}
        action={updateApartment}
        submitLabel="שמור שינויים"
      />
    </div>
  );
}
