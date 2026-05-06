"use server";

import { db } from "@/lib/db";

export type SystemMessageFormState = {
  error?: string;
  errorAt?: number;
  submittedAt?: number;
};

function fail(error: string): SystemMessageFormState {
  return { error, errorAt: Date.now() };
}

export type SystemMessagePriority = "low" | "med" | "high";

export type SystemMessageRow = {
  id: number;
  title: string;
  body: string;
  start_at: string;
  end_at: string;
  priority: SystemMessagePriority;
  created_at: string;
};

const PRIORITY_ORDER = `
  CASE priority
    WHEN 'high' THEN 2
    WHEN 'med'  THEN 1
    ELSE 0
  END
`;

export async function getAllSystemMessages(): Promise<SystemMessageRow[]> {
  return db
    .prepare(
      `SELECT id, title, body, start_at, end_at, priority, created_at
       FROM system_messages
       ORDER BY start_at DESC, id DESC`
    )
    .all() as SystemMessageRow[];
}

// Active = current local-clock time falls within [start_at, end_at].
// `datetime-local` stores wall-clock without TZ; we compare against local now.
export async function getActiveSystemMessages(): Promise<SystemMessageRow[]> {
  return db
    .prepare(
      `SELECT id, title, body, start_at, end_at, priority, created_at
       FROM system_messages
       WHERE start_at <= strftime('%Y-%m-%dT%H:%M', 'now', 'localtime')
         AND end_at   >= strftime('%Y-%m-%dT%H:%M', 'now', 'localtime')
       ORDER BY ${PRIORITY_ORDER} DESC, start_at DESC
       LIMIT 3`
    )
    .all() as SystemMessageRow[];
}

function parseFields(formData: FormData):
  | {
      title: string;
      body: string;
      start_at: string;
      end_at: string;
      priority: SystemMessagePriority;
    }
  | { error: string } {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "כותרת נדרשת" };

  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "תוכן נדרש" };

  const start_at = String(formData.get("start_at") ?? "").trim();
  if (!start_at) return { error: "תאריך התחלה נדרש" };

  const end_at = String(formData.get("end_at") ?? "").trim();
  if (!end_at) return { error: "תאריך סיום נדרש" };

  if (end_at <= start_at) {
    return { error: "תאריך סיום חייב להיות לאחר תאריך התחלה" };
  }

  const priority = String(formData.get("priority") ?? "med").trim();
  if (priority !== "low" && priority !== "med" && priority !== "high") {
    return { error: "עדיפות לא חוקית" };
  }

  return { title, body, start_at, end_at, priority };
}

export async function createSystemMessage(
  _prev: SystemMessageFormState,
  formData: FormData
): Promise<SystemMessageFormState> {
  const parsed = parseFields(formData);
  if ("error" in parsed) return fail(parsed.error);

  db.prepare(
    `INSERT INTO system_messages (title, body, start_at, end_at, priority)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    parsed.title,
    parsed.body,
    parsed.start_at,
    parsed.end_at,
    parsed.priority
  );

  return { submittedAt: Date.now() };
}

export async function updateSystemMessage(
  _prev: SystemMessageFormState,
  formData: FormData
): Promise<SystemMessageFormState> {
  const idRaw = String(formData.get("id") ?? "").trim();
  const id = parseInt(idRaw, 10);
  if (Number.isNaN(id)) return fail("מזהה לא חוקי");

  const parsed = parseFields(formData);
  if ("error" in parsed) return fail(parsed.error);

  const result = db
    .prepare(
      `UPDATE system_messages
       SET title = ?, body = ?, start_at = ?, end_at = ?, priority = ?
       WHERE id = ?`
    )
    .run(
      parsed.title,
      parsed.body,
      parsed.start_at,
      parsed.end_at,
      parsed.priority,
      id
    );

  if (result.changes === 0) return fail("ההודעה לא נמצאה");

  return { submittedAt: Date.now() };
}

export async function deleteSystemMessage(
  _prev: SystemMessageFormState,
  formData: FormData
): Promise<SystemMessageFormState> {
  const idRaw = String(formData.get("id") ?? "").trim();
  const id = parseInt(idRaw, 10);
  if (Number.isNaN(id)) return fail("מזהה לא חוקי");

  const result = db
    .prepare(`DELETE FROM system_messages WHERE id = ?`)
    .run(id);

  if (result.changes === 0) return fail("ההודעה לא נמצאה");

  return { submittedAt: Date.now() };
}
