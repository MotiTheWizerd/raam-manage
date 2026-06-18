import { db } from "@/lib/db";
import { DirectoryTable, type DirectoryRow } from "./DirectoryTable";

export const dynamic = "force-dynamic";

type ApartmentRow = {
  id: number;
  number: string;
  floor: number | null;
  notes: string | null;
  zone_name: string | null;
};

type ResidentRow = {
  id: number;
  apartment_id: number;
  first_name: string;
  last_name: string;
  type: "owner" | "renter";
  po_box: string | null;
};

type AssetRow = {
  apartment_id: number;
  type: "parking" | "storage";
  number: string;
  floor: number;
};

type PhoneRow = {
  apartment_id: number;
  first_name: string;
  last_name: string;
  number: string;
  label: string | null;
};

export default async function DirectoryPage() {
  const apartments = db
    .prepare(
      `SELECT a.id, a.number, a.floor, a.notes, z.name AS zone_name
       FROM apartments a
       LEFT JOIN zones z ON z.id = a.zone_id
       ORDER BY a.number`
    )
    .all() as ApartmentRow[];

  // Current residents only (move_out IS NULL), split by type downstream.
  const residents = db
    .prepare(
      `SELECT id, apartment_id, first_name, last_name, type, po_box
       FROM residents
       WHERE move_out IS NULL`
    )
    .all() as ResidentRow[];

  const assets = db
    .prepare(
      `SELECT apartment_id, type, number, floor
       FROM apartment_assets
       WHERE apartment_id IS NOT NULL
       ORDER BY floor, number`
    )
    .all() as AssetRow[];

  const phones = db
    .prepare(
      `SELECT r.apartment_id, r.first_name, r.last_name, p.number, p.label
       FROM phones p
       JOIN residents r ON r.id = p.resident_id
       WHERE r.move_out IS NULL
       ORDER BY p.is_primary DESC, p.id`
    )
    .all() as PhoneRow[];

  // Index the child rows by apartment so each apartment row is assembled in one pass.
  const byApartment = new Map<number, DirectoryRow>();
  for (const a of apartments) {
    byApartment.set(a.id, {
      apartment_id: a.id,
      number: a.number,
      zone_name: a.zone_name,
      floor: a.floor,
      owners: [],
      occupants: [],
      parking: [],
      storage: [],
      phones: [],
      po_boxes: [],
      notes: a.notes,
    });
  }

  for (const r of residents) {
    const row = byApartment.get(r.apartment_id);
    if (!row) continue;
    const person = { id: r.id, name: `${r.first_name} ${r.last_name}`.trim() };
    if (r.type === "owner") row.owners.push(person);
    else row.occupants.push(person);
    const poBox = r.po_box?.trim();
    if (poBox && !row.po_boxes.includes(poBox)) row.po_boxes.push(poBox);
  }

  for (const asset of assets) {
    const row = byApartment.get(asset.apartment_id);
    if (!row) continue;
    const label = `${asset.number} (${asset.floor})`;
    if (asset.type === "parking") row.parking.push(label);
    else row.storage.push(label);
  }

  for (const p of phones) {
    const row = byApartment.get(p.apartment_id);
    if (!row) continue;
    row.phones.push({
      name: `${p.first_name} ${p.last_name}`.trim(),
      number: p.number,
      label: p.label,
    });
  }

  const rows = [...byApartment.values()];

  return (
    <div className="space-y-6">
      <DirectoryTable rows={rows} />
    </div>
  );
}
