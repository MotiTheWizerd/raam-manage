"use server";

import { CALL_POLICY_CODES, parseCallPolicy } from "@/lib/call-policy";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

export type ApartmentFormState = {
  error?: string;
  errorAt?: number;
  submittedAt?: number;
};

function fail(error: string): ApartmentFormState {
  return { error, errorAt: Date.now() };
}

type AssetInput = {
  floor: unknown;
  number: unknown;
  notes?: unknown;
};

type CleanedAsset = {
  floor: number;
  number: string;
  notes: string | null;
};

type KeyInput = {
  nickname: unknown;
  is_default?: unknown;
  is_active?: unknown;
  is_in_lobby?: unknown;
};

type CleanedKey = {
  nickname: string;
  is_default: 0 | 1;
  is_active: 0 | 1;
  is_in_lobby: 0 | 1;
};

type VehicleInput = {
  license_plate: unknown;
  color?: unknown;
  model?: unknown;
  notes?: unknown;
};

type CleanedVehicle = {
  license_plate: string;
  color: string | null;
  model: string | null;
  notes: string | null;
};

type ParsedFields = {
  number: string;
  floor: number | null;
  zone_id: number | null;
  notes: string | null;
  keys_comment: string | null;
  // Contact-policy code stored in apartments.must_call (0=none,1=call,2=message).
  must_call: number;
  parking: CleanedAsset[];
  storage: CleanedAsset[];
  keys: CleanedKey[];
  vehicles: CleanedVehicle[];
};

function parseAssets(formData: FormData, key: string): CleanedAsset[] {
  let raw: AssetInput[] = [];
  try {
    const parsed = JSON.parse(String(formData.get(key) ?? "[]"));
    if (Array.isArray(parsed)) raw = parsed;
  } catch {
    raw = [];
  }
  return raw
    .map((a) => ({
      floor: typeof a.floor === "number" ? a.floor : Number.NaN,
      number: typeof a.number === "string" ? a.number.trim() : "",
      notes:
        typeof a.notes === "string" && a.notes.trim() ? a.notes.trim() : null,
    }))
    .filter((a) => !Number.isNaN(a.floor) && a.number !== "");
}

function parseKeys(formData: FormData): CleanedKey[] | { error: string } {
  let raw: KeyInput[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("keys") ?? "[]"));
    if (Array.isArray(parsed)) raw = parsed;
  } catch {
    raw = [];
  }
  const keys: CleanedKey[] = raw.map((k) => ({
    nickname: typeof k.nickname === "string" ? k.nickname.trim() : "",
    is_default: (k.is_default === true || k.is_default === 1 ? 1 : 0) as 0 | 1,
    is_active: (k.is_active === false || k.is_active === 0 ? 0 : 1) as 0 | 1,
    is_in_lobby: (k.is_in_lobby === false || k.is_in_lobby === 0
      ? 0
      : 1) as 0 | 1,
  }));

  if (keys.some((k) => k.nickname === "")) {
    return { error: "חובה להוסיף כינוי למפתח" };
  }

  if (keys.length > 0 && !keys.some((k) => k.is_default)) {
    keys[0].is_default = 1;
  }
  let foundDefault = false;
  for (const k of keys) {
    if (k.is_default) {
      if (foundDefault) k.is_default = 0;
      else foundDefault = true;
    }
  }
  return keys;
}

function parseFields(formData: FormData): ParsedFields | { error: string } {
  const number = String(formData.get("number") ?? "").trim();
  const floorRaw = String(formData.get("floor") ?? "").trim();
  const zoneIdRaw = String(formData.get("zone_id") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const keys_comment =
    String(formData.get("keys_comment") ?? "").trim() || null;
  const must_call = CALL_POLICY_CODES[parseCallPolicy(formData.get("call_policy"))];

  if (!number) return { error: "מספר דירה נדרש" };

  let floor: number | null = null;
  if (floorRaw) {
    const parsed = parseInt(floorRaw, 10);
    if (Number.isNaN(parsed)) return { error: "קומה חייבת להיות מספר" };
    floor = parsed;
  }

  let zone_id: number | null = null;
  if (zoneIdRaw) {
    const parsed = parseInt(zoneIdRaw, 10);
    if (Number.isNaN(parsed)) return { error: "אזור לא חוקי" };
    zone_id = parsed;
  }

  const parking = parseAssets(formData, "parking");
  const storage = parseAssets(formData, "storage");
  const keys = parseKeys(formData);
  if ("error" in keys) return { error: keys.error };
  const vehicles = parseVehicles(formData);
  if ("error" in vehicles) return { error: vehicles.error };

  return {
    number,
    floor,
    zone_id,
    notes,
    keys_comment,
    must_call,
    parking,
    storage,
    keys,
    vehicles,
  };
}

function insertAssets(
  apartmentId: number,
  type: "parking" | "storage",
  assets: CleanedAsset[]
) {
  const stmt = db.prepare(
    `INSERT INTO apartment_assets (type, floor, number, apartment_id, notes)
     VALUES (?, ?, ?, ?, ?)`
  );
  for (const a of assets) {
    stmt.run(type, a.floor, a.number, apartmentId, a.notes);
  }
}

function insertKeys(apartmentId: number, keys: CleanedKey[]) {
  const stmt = db.prepare(
    `INSERT INTO apartment_keys (apartment_id, nickname, is_default, is_active, is_in_lobby)
     VALUES (?, ?, ?, ?, ?)`
  );
  for (const k of keys) {
    stmt.run(
      apartmentId,
      k.nickname,
      k.is_default,
      k.is_active,
      k.is_in_lobby
    );
  }
}

function parseVehicles(
  formData: FormData
): CleanedVehicle[] | { error: string } {
  let raw: VehicleInput[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("vehicles") ?? "[]"));
    if (Array.isArray(parsed)) raw = parsed;
  } catch {
    raw = [];
  }
  const vehicles: CleanedVehicle[] = raw.map((v) => ({
    license_plate:
      typeof v.license_plate === "string" ? v.license_plate.trim() : "",
    color:
      typeof v.color === "string" && v.color.trim() ? v.color.trim() : null,
    model:
      typeof v.model === "string" && v.model.trim() ? v.model.trim() : null,
    notes:
      typeof v.notes === "string" && v.notes.trim() ? v.notes.trim() : null,
  }));

  if (vehicles.some((v) => v.license_plate === "")) {
    return { error: "חובה להזין מספר רישוי לרכב" };
  }
  return vehicles;
}

function insertVehicles(apartmentId: number, vehicles: CleanedVehicle[]) {
  const stmt = db.prepare(
    `INSERT INTO apartment_vehicles (apartment_id, license_plate, color, model, notes)
     VALUES (?, ?, ?, ?, ?)`
  );
  for (const v of vehicles) {
    stmt.run(apartmentId, v.license_plate, v.color, v.model, v.notes);
  }
}

function assetConflictMessage(e: unknown): string | null {
  const code = (e as { code?: string }).code;
  const msg = (e as { message?: string }).message ?? "";
  if (code === "SQLITE_CONSTRAINT_UNIQUE" && msg.includes("apartment_assets")) {
    return "חניה או מחסן עם אותה קומה ומספר כבר קיימים";
  }
  return null;
}

export async function createApartment(
  _prev: ApartmentFormState,
  formData: FormData
): Promise<ApartmentFormState> {
  const parsed = parseFields(formData);
  if ("error" in parsed) return fail(parsed.error);

  try {
    const insertApt = db.prepare(
      `INSERT INTO apartments (number, floor, zone_id, notes, keys_comment, must_call)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id`
    );

    const tx = db.transaction(() => {
      const { id } = insertApt.get(
        parsed.number,
        parsed.floor,
        parsed.zone_id,
        parsed.notes,
        parsed.keys_comment,
        parsed.must_call
      ) as { id: number };
      insertAssets(id, "parking", parsed.parking);
      insertAssets(id, "storage", parsed.storage);
      insertKeys(id, parsed.keys);
      insertVehicles(id, parsed.vehicles);
    });
    tx();
  } catch (e) {
    const code = (e as { code?: string }).code;
    const assetErr = assetConflictMessage(e);
    if (assetErr) return fail(assetErr);
    if (code === "SQLITE_CONSTRAINT_UNIQUE") {
      return fail("דירה עם מספר זה כבר קיימת");
    }
    if (code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
      return fail("אזור לא חוקי");
    }
    throw e;
  }

  revalidatePath("/apartments");
  revalidatePath("/");
  return { submittedAt: Date.now() };
}

export async function updateApartment(
  _prev: ApartmentFormState,
  formData: FormData
): Promise<ApartmentFormState> {
  const idRaw = String(formData.get("id") ?? "").trim();
  const id = parseInt(idRaw, 10);
  if (Number.isNaN(id)) return fail("מזהה לא חוקי");

  const parsed = parseFields(formData);
  if ("error" in parsed) return fail(parsed.error);

  try {
    const updateApt = db.prepare(
      `UPDATE apartments
       SET number = ?, floor = ?, zone_id = ?, notes = ?, keys_comment = ?,
           must_call = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    );
    const deleteAssets = db.prepare(
      `DELETE FROM apartment_assets WHERE apartment_id = ? AND type = ?`
    );
    const deleteKeys = db.prepare(
      `DELETE FROM apartment_keys WHERE apartment_id = ?`
    );
    const deleteVehicles = db.prepare(
      `DELETE FROM apartment_vehicles WHERE apartment_id = ?`
    );

    const tx = db.transaction(() => {
      const result = updateApt.run(
        parsed.number,
        parsed.floor,
        parsed.zone_id,
        parsed.notes,
        parsed.keys_comment,
        parsed.must_call,
        id
      );
      if (result.changes === 0) {
        throw new Error("APARTMENT_NOT_FOUND");
      }
      deleteAssets.run(id, "parking");
      deleteAssets.run(id, "storage");
      deleteKeys.run(id);
      deleteVehicles.run(id);
      insertAssets(id, "parking", parsed.parking);
      insertAssets(id, "storage", parsed.storage);
      insertKeys(id, parsed.keys);
      insertVehicles(id, parsed.vehicles);
    });
    tx();
  } catch (e) {
    if ((e as Error).message === "APARTMENT_NOT_FOUND") {
      return fail("הדירה לא נמצאה");
    }
    const code = (e as { code?: string }).code;
    const assetErr = assetConflictMessage(e);
    if (assetErr) return fail(assetErr);
    if (code === "SQLITE_CONSTRAINT_UNIQUE") {
      return fail("דירה עם מספר זה כבר קיימת");
    }
    if (code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
      return fail("אזור לא חוקי");
    }
    throw e;
  }

  revalidatePath("/apartments");
  revalidatePath(`/apartments/${id}`);
  revalidatePath("/events");
  revalidatePath("/");
  return { submittedAt: Date.now() };
}

export async function updateApartmentKeys(
  _prev: ApartmentFormState,
  formData: FormData
): Promise<ApartmentFormState> {
  const idRaw = String(formData.get("id") ?? "").trim();
  const id = parseInt(idRaw, 10);
  if (Number.isNaN(id)) return fail("מזהה לא חוקי");

  const keys = parseKeys(formData);
  if ("error" in keys) return fail(keys.error);

  const keys_comment =
    String(formData.get("keys_comment") ?? "").trim() || null;

  try {
    const tx = db.transaction(() => {
      db.prepare(
        `UPDATE apartments SET keys_comment = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).run(keys_comment, id);
      db.prepare(`DELETE FROM apartment_keys WHERE apartment_id = ?`).run(id);
      insertKeys(id, keys);
    });
    tx();
  } catch (e) {
    if ((e as { code?: string }).code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
      return fail("דירה לא נמצאה");
    }
    throw e;
  }

  revalidatePath(`/apartments/${id}`);
  revalidatePath("/events");
  return { submittedAt: Date.now() };
}

// Update only an apartment's general note. Usable from anywhere that shows the
// note (e.g. the resident detail page), since the note belongs to the apartment.
export async function updateApartmentNotes(
  _prev: ApartmentFormState,
  formData: FormData
): Promise<ApartmentFormState> {
  const idRaw = String(formData.get("id") ?? "").trim();
  const id = parseInt(idRaw, 10);
  if (Number.isNaN(id)) return fail("מזהה לא חוקי");

  const notes = String(formData.get("notes") ?? "").trim() || null;

  const result = db
    .prepare(
      `UPDATE apartments SET notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    )
    .run(notes, id);
  if (result.changes === 0) return fail("דירה לא נמצאה");

  revalidatePath(`/apartments/${id}`);
  revalidatePath("/renters");
  revalidatePath("/renters/[id]", "page");
  return { submittedAt: Date.now() };
}
