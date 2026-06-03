"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

export type OwnerFormState = {
  error?: string;
  errorAt?: number;
  submittedAt?: number;
};

function fail(error: string): OwnerFormState {
  return { error, errorAt: Date.now() };
}

export type OwnerMobileRow = {
  id: number;
  owner_id: number;
  phone: string;
  comment: string | null;
  created_at: string;
};

export type ApartmentOption = {
  id: number;
  number: string;
};

export async function getApartmentOptions(): Promise<ApartmentOption[]> {
  return db
    .prepare(`SELECT id, number FROM apartments ORDER BY number`)
    .all() as ApartmentOption[];
}

export type OwnerRow = {
  id: number;
  first_name: string;
  last_name: string;
  apartment_id: number | null;
  apartment_number: string | null;
  comments: string | null;
  created_at: string;
  mobiles: OwnerMobileRow[];
};

export async function getOwners(): Promise<OwnerRow[]> {
  const owners = db
    .prepare(
      `SELECT o.id, o.first_name, o.last_name, o.apartment_id,
              a.number AS apartment_number, o.comments, o.created_at
       FROM apartment_owners o
       LEFT JOIN apartments a ON a.id = o.apartment_id`
    )
    .all() as Omit<OwnerRow, "mobiles">[];

  if (owners.length === 0) return [];

  owners.sort((a, b) => {
    if (a.apartment_number == null && b.apartment_number == null) return 0;
    if (a.apartment_number == null) return 1;
    if (b.apartment_number == null) return -1;
    return a.apartment_number.localeCompare(b.apartment_number, "he", {
      numeric: true,
    });
  });

  const mobiles = db
    .prepare(
      `SELECT id, owner_id, phone, comment, created_at
       FROM owners_mobiles
       ORDER BY id`
    )
    .all() as OwnerMobileRow[];

  const mobilesByOwner = new Map<number, OwnerMobileRow[]>();
  for (const m of mobiles) {
    const list = mobilesByOwner.get(m.owner_id) ?? [];
    list.push(m);
    mobilesByOwner.set(m.owner_id, list);
  }

  return owners.map((o) => ({ ...o, mobiles: mobilesByOwner.get(o.id) ?? [] }));
}

export async function createOwner(
  _prev: OwnerFormState,
  formData: FormData
): Promise<OwnerFormState> {
  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  if (!firstName) return fail("שם פרטי נדרש");
  if (!lastName) return fail("שם משפחה נדרש");

  const apartmentIdRaw = String(formData.get("apartment_id") ?? "").trim();
  const apartmentId = apartmentIdRaw ? parseInt(apartmentIdRaw, 10) : null;
  if (apartmentIdRaw && Number.isNaN(apartmentId)) return fail("דירה לא חוקית");

  const phones = formData.getAll("phone[]").map(String);
  const comments = formData.getAll("comment[]").map(String);

  const ownerComments = String(formData.get("comments") ?? "").trim() || null;

  const insertOwner = db.prepare(
    `INSERT INTO apartment_owners (first_name, last_name, apartment_id, comments) VALUES (?, ?, ?, ?)`
  );
  const insertMobile = db.prepare(
    `INSERT INTO owners_mobiles (owner_id, phone, comment) VALUES (?, ?, ?)`
  );

  db.transaction(() => {
    const result = insertOwner.run(firstName, lastName, apartmentId, ownerComments);
    const ownerId = result.lastInsertRowid;
    for (let i = 0; i < phones.length; i++) {
      const phone = phones[i].trim();
      if (!phone) continue;
      const comment = (comments[i] ?? "").trim() || null;
      insertMobile.run(ownerId, phone, comment);
    }
  })();

  revalidatePath("/owners");
  return { submittedAt: Date.now() };
}

export async function updateOwner(
  _prev: OwnerFormState,
  formData: FormData
): Promise<OwnerFormState> {
  const id = parseInt(String(formData.get("id") ?? ""), 10);
  if (Number.isNaN(id)) return fail("מזהה לא חוקי");

  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  if (!firstName) return fail("שם פרטי נדרש");
  if (!lastName) return fail("שם משפחה נדרש");

  const apartmentIdRaw = String(formData.get("apartment_id") ?? "").trim();
  const apartmentId = apartmentIdRaw ? parseInt(apartmentIdRaw, 10) : null;
  if (apartmentIdRaw && Number.isNaN(apartmentId)) return fail("דירה לא חוקית");

  const ownerComments = String(formData.get("comments") ?? "").trim() || null;

  const result = db
    .prepare(`UPDATE apartment_owners SET first_name = ?, last_name = ?, apartment_id = ?, comments = ? WHERE id = ?`)
    .run(firstName, lastName, apartmentId, ownerComments, id);

  if (result.changes === 0) return fail("הבעלים לא נמצא");

  revalidatePath("/owners");
  return { submittedAt: Date.now() };
}

export async function deleteOwner(
  _prev: OwnerFormState,
  formData: FormData
): Promise<OwnerFormState> {
  const id = parseInt(String(formData.get("id") ?? ""), 10);
  if (Number.isNaN(id)) return fail("מזהה לא חוקי");

  const result = db.prepare("DELETE FROM apartment_owners WHERE id = ?").run(id);
  if (result.changes === 0) return fail("הבעלים לא נמצא");

  revalidatePath("/owners");
  return { submittedAt: Date.now() };
}

export async function addOwnerMobile(
  _prev: OwnerFormState,
  formData: FormData
): Promise<OwnerFormState> {
  const ownerId = parseInt(String(formData.get("owner_id") ?? ""), 10);
  if (Number.isNaN(ownerId)) return fail("בעלים לא חוקי");

  const phone = String(formData.get("phone") ?? "").trim();
  if (!phone) return fail("מספר טלפון נדרש");

  const comment = String(formData.get("comment") ?? "").trim() || null;

  try {
    db.prepare(
      `INSERT INTO owners_mobiles (owner_id, phone, comment) VALUES (?, ?, ?)`
    ).run(ownerId, phone, comment);
  } catch (e) {
    if ((e as { code?: string }).code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
      return fail("בעלים לא חוקי");
    }
    throw e;
  }

  revalidatePath("/owners");
  return { submittedAt: Date.now() };
}

export async function deleteOwnerMobile(
  _prev: OwnerFormState,
  formData: FormData
): Promise<OwnerFormState> {
  const id = parseInt(String(formData.get("id") ?? ""), 10);
  if (Number.isNaN(id)) return fail("מזהה לא חוקי");

  const result = db.prepare("DELETE FROM owners_mobiles WHERE id = ?").run(id);
  if (result.changes === 0) return fail("הטלפון לא נמצא");

  revalidatePath("/owners");
  return { submittedAt: Date.now() };
}
