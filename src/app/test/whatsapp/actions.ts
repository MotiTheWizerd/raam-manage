"use server";

import { db } from "@/lib/db";
import { normalizePhoneOrNull } from "@/lib/whatsapp-test";
import type { SelectedResident } from "@/lib/preferences";

export type WhatsAppConversation = {
  phone: string;
  last_body: string;
  last_direction: "in" | "out";
  last_status: "pending" | "sent" | "delivered" | "read" | "failed";
  last_at: string;
  resident: SelectedResident | null;
};

export type WhatsAppMessageRow = {
  id: number;
  resident_id: number | null;
  phone: string;
  direction: "in" | "out";
  body: string;
  status: "pending" | "sent" | "delivered" | "read" | "failed";
  error: string | null;
  created_at: string;
};

export type ResidentPhoneOption = {
  id: number;
  number: string;
  label: string | null;
  comment: string | null;
  is_primary: number;
};

export async function getResidentPhoneOptions(
  residentId: number
): Promise<ResidentPhoneOption[]> {
  return db
    .prepare(
      `SELECT id, number, label, comment, is_primary
         FROM phones
        WHERE resident_id = ?
        ORDER BY is_primary DESC, id ASC`
    )
    .all(residentId) as ResidentPhoneOption[];
}

export async function getWhatsAppMessages(args: {
  residentId?: number | null;
  phone?: string | null;
}): Promise<WhatsAppMessageRow[]> {
  const residentId = args.residentId ?? null;
  const phone = args.phone ? normalizePhoneOrNull(args.phone) : null;

  if (!residentId && !phone) return [];

  let where = "";
  const params: (string | number)[] = [];
  if (residentId && phone) {
    where = "resident_id = ? OR phone = ?";
    params.push(residentId, phone);
  } else if (residentId) {
    where = "resident_id = ?";
    params.push(residentId);
  } else if (phone) {
    where = "phone = ?";
    params.push(phone);
  }

  return db
    .prepare(
      `SELECT id, resident_id, phone, direction, body, status, error, created_at
         FROM whatsapp_messages
        WHERE ${where}
        ORDER BY id ASC
        LIMIT 500`
    )
    .all(...params) as WhatsAppMessageRow[];
}

export async function getWhatsAppConversations(): Promise<WhatsAppConversation[]> {
  type Row = {
    phone: string;
    body: string;
    direction: "in" | "out";
    status: WhatsAppConversation["last_status"];
    created_at: string;
    resident_id: number | null;
    first_name: string | null;
    last_name: string | null;
    apartment_id: number | null;
    apartment_number: string | null;
    floor: number | null;
    zone_name: string | null;
  };

  const rows = db
    .prepare(
      `WITH last_per_phone AS (
         SELECT phone, MAX(id) AS last_id
           FROM whatsapp_messages
          GROUP BY phone
       )
       SELECT m.phone, m.body, m.direction, m.status, m.created_at,
              m.resident_id,
              r.first_name, r.last_name,
              a.id     AS apartment_id,
              a.number AS apartment_number,
              a.floor  AS floor,
              z.name   AS zone_name
         FROM last_per_phone l
         JOIN whatsapp_messages m ON m.id = l.last_id
         LEFT JOIN residents  r ON r.id = m.resident_id
         LEFT JOIN apartments a ON a.id = r.apartment_id
         LEFT JOIN zones      z ON z.id = a.zone_id
        ORDER BY m.created_at DESC
        LIMIT 200`
    )
    .all() as Row[];

  return rows.map((r) => ({
    phone: r.phone,
    last_body: r.body,
    last_direction: r.direction,
    last_status: r.status,
    last_at: r.created_at,
    resident:
      r.resident_id !== null &&
      r.first_name !== null &&
      r.last_name !== null &&
      r.apartment_id !== null &&
      r.apartment_number !== null
        ? {
            id: r.resident_id,
            first_name: r.first_name,
            last_name: r.last_name,
            apartment_id: r.apartment_id,
            apartment_number: r.apartment_number,
            floor: r.floor,
            zone_name: r.zone_name,
          }
        : null,
  }));
}
