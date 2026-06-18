"use server";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export type SuggestionFormState = {
  error?: string;
  errorAt?: number;
  submittedAt?: number;
};

function fail(error: string): SuggestionFormState {
  return { error, errorAt: Date.now() };
}

export type SuggestionCategory = "bug" | "improvement" | "idea";
export type SuggestionStatus = "open" | "in_progress" | "done" | "wont_fix";

export type SuggestionRow = {
  id: number;
  title: string;
  body: string;
  category: SuggestionCategory;
  status: SuggestionStatus;
  submitted_by: string;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

const STATUS_ORDER = `
  CASE status
    WHEN 'open'        THEN 0
    WHEN 'in_progress' THEN 1
    WHEN 'done'        THEN 2
    WHEN 'wont_fix'    THEN 3
  END
`;

export async function getAllSuggestions(): Promise<SuggestionRow[]> {
  return db
    .prepare(
      `SELECT id, title, body, category, status, submitted_by,
              resolution_notes, created_at, updated_at, resolved_at
       FROM suggestions
       ORDER BY ${STATUS_ORDER}, created_at DESC`
    )
    .all() as SuggestionRow[];
}

export async function getOpenSuggestionCount(): Promise<number> {
  const row = db
    .prepare(`SELECT COUNT(*) AS c FROM suggestions WHERE status = 'open'`)
    .get() as { c: number };
  return row.c;
}

function parseCategory(v: unknown): SuggestionCategory | null {
  return v === "bug" || v === "improvement" || v === "idea" ? v : null;
}

function parseStatus(v: unknown): SuggestionStatus | null {
  return v === "open" || v === "in_progress" || v === "done" || v === "wont_fix"
    ? v
    : null;
}

async function parseFields(formData: FormData): Promise<
  | {
      title: string;
      body: string;
      category: SuggestionCategory;
      submitted_by: string;
    }
  | { error: string }
> {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "כותרת נדרשת" };

  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "תוכן נדרש" };

  const category = parseCategory(formData.get("category"));
  if (!category) return { error: "קטגוריה לא חוקית" };

  // Pre-filled client-side with the current lobbyist; fall back to the session
  // user so the submitter is always recorded even if the field is blank.
  const submitted_by =
    String(formData.get("submitted_by") ?? "").trim() ||
    (await getCurrentUser())?.lobbyist_name?.trim() ||
    "";
  if (!submitted_by) return { error: "שם המגיש נדרש" };

  return { title, body, category, submitted_by };
}

export async function createSuggestion(
  _prev: SuggestionFormState,
  formData: FormData
): Promise<SuggestionFormState> {
  const parsed = await parseFields(formData);
  if ("error" in parsed) return fail(parsed.error);

  db.prepare(
    `INSERT INTO suggestions (title, body, category, submitted_by)
     VALUES (?, ?, ?, ?)`
  ).run(parsed.title, parsed.body, parsed.category, parsed.submitted_by);

  return { submittedAt: Date.now() };
}

// Full edit — title, body, category, status, resolution_notes.
// Updates resolved_at automatically when transitioning to done/wont_fix.
export async function updateSuggestion(
  _prev: SuggestionFormState,
  formData: FormData
): Promise<SuggestionFormState> {
  const idRaw = String(formData.get("id") ?? "").trim();
  const id = parseInt(idRaw, 10);
  if (Number.isNaN(id)) return fail("מזהה לא חוקי");

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return fail("כותרת נדרשת");

  const body = String(formData.get("body") ?? "").trim();
  if (!body) return fail("תוכן נדרש");

  const category = parseCategory(formData.get("category"));
  if (!category) return fail("קטגוריה לא חוקית");

  const status = parseStatus(formData.get("status"));
  if (!status) return fail("סטטוס לא חוקי");

  const resolution_notes =
    String(formData.get("resolution_notes") ?? "").trim() || null;

  const isResolved = status === "done" || status === "wont_fix";

  const result = db
    .prepare(
      `UPDATE suggestions
       SET title = ?, body = ?, category = ?, status = ?,
           resolution_notes = ?,
           resolved_at = CASE
             WHEN ? = 1 AND resolved_at IS NULL THEN CURRENT_TIMESTAMP
             WHEN ? = 0 THEN NULL
             ELSE resolved_at
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
    .run(
      title,
      body,
      category,
      status,
      resolution_notes,
      isResolved ? 1 : 0,
      isResolved ? 1 : 0,
      id
    );

  if (result.changes === 0) return fail("ההצעה לא נמצאה");
  return { submittedAt: Date.now() };
}

export async function deleteSuggestion(
  _prev: SuggestionFormState,
  formData: FormData
): Promise<SuggestionFormState> {
  const idRaw = String(formData.get("id") ?? "").trim();
  const id = parseInt(idRaw, 10);
  if (Number.isNaN(id)) return fail("מזהה לא חוקי");

  const result = db.prepare(`DELETE FROM suggestions WHERE id = ?`).run(id);
  if (result.changes === 0) return fail("ההצעה לא נמצאה");
  return { submittedAt: Date.now() };
}
