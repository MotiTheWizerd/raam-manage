"use server";

import { db } from "@/lib/db";

// Everything the directory row editor needs for one apartment, fetched lazily
// when the modal opens (keeps the directory page payload small + data fresh).
// All writes reuse the existing actions in apartments/owners/renters — this file
// only reads.

export type EditApartment = {
  id: number;
  number: string;
  floor: number | null;
  zone_id: number | null;
  zone_name: string | null;
  notes: string | null;
  keys_comment: string | null;
  must_call: number;
};

export type EditAsset = {
  id: number;
  type: "parking" | "storage";
  floor: number;
  number: string;
  notes: string | null;
};

export type EditKey = {
  id: number;
  nickname: string;
  is_default: number;
  is_active: number;
  is_in_lobby: number;
};

export type EditVehicle = {
  id: number;
  license_plate: string;
  color: string | null;
  model: string | null;
  notes: string | null;
};

export type EditOwnerMobile = {
  id: number;
  owner_id: number;
  phone: string;
  comment: string | null;
};

export type EditOwner = {
  id: number;
  first_name: string;
  last_name: string;
  apartment_id: number | null;
  comments: string | null;
  mobiles: EditOwnerMobile[];
};

export type EditPhone = {
  id: number;
  number: string;
  label: string | null;
  comment: string | null;
  is_primary: number;
};

export type EditResident = {
  id: number;
  first_name: string;
  last_name: string;
  type: "owner" | "renter";
  id_number: string | null;
  po_box: string | null;
  notes: string | null;
  phones: EditPhone[];
};

export type EditZone = { id: number; name: string };

export type EditApartmentOption = {
  id: number;
  number: string;
  zone_name: string | null;
};

export type ApartmentEditData = {
  apartment: EditApartment;
  parking: EditAsset[];
  storage: EditAsset[];
  keys: EditKey[];
  vehicles: EditVehicle[];
  owners: EditOwner[];
  residents: EditResident[];
  zones: EditZone[];
  apartmentOptions: EditApartmentOption[];
};

export async function getApartmentEditData(
  apartmentId: number
): Promise<ApartmentEditData | null> {
  const apartment = db
    .prepare(
      `SELECT a.id, a.number, a.floor, a.zone_id, a.notes, a.keys_comment,
              a.must_call, z.name AS zone_name
       FROM apartments a
       LEFT JOIN zones z ON z.id = a.zone_id
       WHERE a.id = ?`
    )
    .get(apartmentId) as EditApartment | undefined;

  if (!apartment) return null;

  const assets = db
    .prepare(
      `SELECT id, type, floor, number, notes
       FROM apartment_assets
       WHERE apartment_id = ?
       ORDER BY type, floor, number`
    )
    .all(apartmentId) as EditAsset[];

  const keys = db
    .prepare(
      `SELECT id, nickname, is_default, is_active, is_in_lobby
       FROM apartment_keys
       WHERE apartment_id = ?
       ORDER BY is_default DESC, id`
    )
    .all(apartmentId) as EditKey[];

  const vehicles = db
    .prepare(
      `SELECT id, license_plate, color, model, notes
       FROM apartment_vehicles
       WHERE apartment_id = ?
       ORDER BY id`
    )
    .all(apartmentId) as EditVehicle[];

  const owners = db
    .prepare(
      `SELECT id, first_name, last_name, apartment_id, comments
       FROM apartment_owners
       WHERE apartment_id = ?
       ORDER BY id`
    )
    .all(apartmentId) as Omit<EditOwner, "mobiles">[];

  const ownerMobiles =
    owners.length === 0
      ? []
      : (db
          .prepare(
            `SELECT id, owner_id, phone, comment
             FROM owners_mobiles
             WHERE owner_id IN (${owners.map(() => "?").join(",")})
             ORDER BY id`
          )
          .all(...owners.map((o) => o.id)) as EditOwnerMobile[]);

  const mobilesByOwner = new Map<number, EditOwnerMobile[]>();
  for (const m of ownerMobiles) {
    const list = mobilesByOwner.get(m.owner_id) ?? [];
    list.push(m);
    mobilesByOwner.set(m.owner_id, list);
  }

  const residents = db
    .prepare(
      `SELECT id, first_name, last_name, type, id_number, po_box, notes
       FROM residents
       WHERE apartment_id = ? AND move_out IS NULL
       ORDER BY id`
    )
    .all(apartmentId) as Omit<EditResident, "phones">[];

  const phones =
    residents.length === 0
      ? []
      : (db
          .prepare(
            `SELECT id, resident_id, number, label, comment, is_primary
             FROM phones
             WHERE resident_id IN (${residents.map(() => "?").join(",")})
             ORDER BY is_primary DESC, id`
          )
          .all(...residents.map((r) => r.id)) as (EditPhone & {
          resident_id: number;
        })[]);

  const phonesByResident = new Map<number, EditPhone[]>();
  for (const p of phones) {
    const list = phonesByResident.get(p.resident_id) ?? [];
    list.push({
      id: p.id,
      number: p.number,
      label: p.label,
      comment: p.comment,
      is_primary: p.is_primary,
    });
    phonesByResident.set(p.resident_id, list);
  }

  const zones = db
    .prepare("SELECT id, name FROM zones ORDER BY name")
    .all() as EditZone[];

  const apartmentOptions = db
    .prepare(
      `SELECT a.id, a.number, z.name AS zone_name
       FROM apartments a
       LEFT JOIN zones z ON z.id = a.zone_id
       ORDER BY a.number`
    )
    .all() as EditApartmentOption[];

  return {
    apartment,
    parking: assets.filter((a) => a.type === "parking"),
    storage: assets.filter((a) => a.type === "storage"),
    keys,
    vehicles,
    owners: owners.map((o) => ({
      ...o,
      mobiles: mobilesByOwner.get(o.id) ?? [],
    })),
    residents: residents.map((r) => ({
      ...r,
      phones: phonesByResident.get(r.id) ?? [],
    })),
    zones,
    apartmentOptions,
  };
}
