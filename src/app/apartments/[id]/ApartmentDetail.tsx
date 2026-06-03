"use client";

import { useIsManager } from "@/components/AuthProvider";
import { updateApartment, updateApartmentKeys } from "../actions";
import { ApartmentForm, type Zone } from "../ApartmentForm";
import type { AssetInit } from "../AssetsFields";
import { KeysFields, type KeyInit } from "../KeysFields";
import type { VehicleInit } from "../VehiclesFields";
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { useFormToasts } from "@/lib/hooks/useFormToasts";
import type { ApartmentFormState } from "../actions";

type Apartment = {
  id: number;
  number: string;
  floor: number | null;
  zone_id: number | null;
  zone_name: string | null;
  notes: string | null;
  keys_comment: string | null;
};

type Asset = {
  id: number;
  type: "parking" | "storage";
  floor: number;
  number: string;
  notes: string | null;
};

type KeyRow = {
  id: number;
  nickname: string;
  is_default: number;
  is_active: number;
  is_in_lobby: number;
};

type VehicleRow = {
  id: number;
  license_plate: string;
  color: string | null;
  model: string | null;
  notes: string | null;
};

export function ApartmentDetail({
  apartment,
  parking,
  storage,
  keys,
  vehicles,
  zones,
}: {
  apartment: Apartment;
  parking: Asset[];
  storage: Asset[];
  keys: KeyRow[];
  vehicles: VehicleRow[];
  zones: Zone[];
}) {
  const toAssetInit = (assets: Asset[]): AssetInit[] =>
    assets.map((a) => ({
      floor: a.floor,
      number: a.number,
      notes: a.notes,
    }));

  const toKeyInit = (rows: KeyRow[]): KeyInit[] =>
    rows.map((k) => ({
      nickname: k.nickname,
      is_default: k.is_default === 1,
      is_active: k.is_active === 1,
      is_in_lobby: k.is_in_lobby === 1,
    }));

  const toVehicleInit = (rows: VehicleRow[]): VehicleInit[] =>
    rows.map((v) => ({
      license_plate: v.license_plate,
      color: v.color,
      model: v.model,
      notes: v.notes,
    }));

  const canEdit = useIsManager();

  const [keysState, keysAction, keysPending] = useActionState(
    updateApartmentKeys,
    {} as ApartmentFormState
  );
  useFormToasts(keysState, "מפתחות עודכנו");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        {canEdit ? "עריכת דירה" : "פרטי דירה"} {apartment.number}
      </h1>

      {canEdit ? (
        <ApartmentForm
          zones={zones}
          initialValues={{
            number: apartment.number,
            floor: apartment.floor !== null ? String(apartment.floor) : "",
            zone_id:
              apartment.zone_id !== null ? String(apartment.zone_id) : "",
            notes: apartment.notes ?? "",
          }}
          initialParking={toAssetInit(parking)}
          initialStorage={toAssetInit(storage)}
          initialKeys={toKeyInit(keys)}
          initialKeysComment={apartment.keys_comment}
          initialVehicles={toVehicleInit(vehicles)}
          hiddenIdValue={apartment.id}
          action={updateApartment}
          submitLabel="שמור שינויים"
        />
      ) : (
        <>
          <fieldset disabled className="min-w-0 border-0 p-0 m-0">
            <ApartmentForm
              zones={zones}
              initialValues={{
                number: apartment.number,
                floor: apartment.floor !== null ? String(apartment.floor) : "",
                zone_id:
                  apartment.zone_id !== null ? String(apartment.zone_id) : "",
                notes: apartment.notes ?? "",
              }}
              initialParking={toAssetInit(parking)}
              initialStorage={toAssetInit(storage)}
              initialKeys={toKeyInit(keys)}
              initialKeysComment={apartment.keys_comment}
              initialVehicles={toVehicleInit(vehicles)}
              hiddenIdValue={apartment.id}
              action={updateApartment}
              submitLabel="שמור שינויים"
            />
          </fieldset>

          <form action={keysAction} className="space-y-3 pt-2 border-t border-black/10 dark:border-white/10">
            <input type="hidden" name="id" value={apartment.id} />
            <KeysFields
              initial={toKeyInit(keys)}
              initialComment={apartment.keys_comment}
            />
            <div className="flex justify-end pt-1">
              <Button type="submit" size="sm" disabled={keysPending}>
                {keysPending ? "שומר..." : "שמור מפתחות"}
              </Button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
