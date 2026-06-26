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
  // The most recent progress comment (null when the thread is empty), surfaced
  // in the list so the latest update is visible without expanding the card.
  last_comment_body: string | null;
  last_comment_by: string | null;
  last_comment_status: SuggestionStatus | null;
  last_comment_at: string | null;
};

// A single entry in a suggestion's progress thread. `status` is the status the
// post was moved TO with this comment (null = comment only, no status change).
export type SuggestionComment = {
  id: number;
  suggestion_id: number;
  body: string;
  status: SuggestionStatus | null;
  lobbyist_name: string;
  created_at: string;
};

const STATUS_ORDER = `
  CASE s.status
    WHEN 'open'        THEN 0
    WHEN 'in_progress' THEN 1
    WHEN 'done'        THEN 2
    WHEN 'wont_fix'    THEN 3
  END
`;

export async function getAllSuggestions(): Promise<SuggestionRow[]> {
  return db
    .prepare(
      `SELECT s.id, s.title, s.body, s.category, s.status, s.submitted_by,
              s.resolution_notes, s.created_at, s.updated_at, s.resolved_at,
              lc.body          AS last_comment_body,
              lc.lobbyist_name AS last_comment_by,
              lc.status        AS last_comment_status,
              lc.created_at    AS last_comment_at
       FROM suggestions s
       LEFT JOIN suggestion_comments lc ON lc.id = (
         SELECT c.id FROM suggestion_comments c
         WHERE c.suggestion_id = s.id
         ORDER BY c.created_at DESC, c.id DESC
         LIMIT 1
       )
       ORDER BY ${STATUS_ORDER}, s.created_at DESC`
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

// --- Progress thread (comments) ---------------------------------------------

export async function getSuggestionComments(
  suggestionId: number
): Promise<SuggestionComment[]> {
  return db
    .prepare(
      `SELECT id, suggestion_id, body, status, lobbyist_name, created_at
       FROM suggestion_comments
       WHERE suggestion_id = ?
       ORDER BY created_at ASC, id ASC`
    )
    .all(suggestionId) as SuggestionComment[];
}

// Add a progress comment. If a status is chosen that differs from the post's
// current status, the comment records that new status AND the parent post is
// moved to it (mirroring updateSuggestion's resolved_at handling).
export async function addSuggestionComment(
  _prev: SuggestionFormState,
  formData: FormData
): Promise<SuggestionFormState> {
  const id = parseInt(String(formData.get("suggestion_id") ?? "").trim(), 10);
  if (Number.isNaN(id)) return fail("מזהה לא חוקי");

  const body = String(formData.get("body") ?? "").trim();
  if (!body) return fail("תוכן נדרש");

  const lobbyist_name =
    String(formData.get("lobbyist_name") ?? "").trim() ||
    (await getCurrentUser())?.lobbyist_name?.trim() ||
    "";
  if (!lobbyist_name) return fail("שם הפקיד נדרש");

  const current = db
    .prepare(`SELECT status FROM suggestions WHERE id = ?`)
    .get(id) as { status: SuggestionStatus } | undefined;
  if (!current) return fail("ההצעה לא נמצאה");

  // Only treat it as a status change when the choice actually differs.
  const chosen = parseStatus(formData.get("status"));
  const changed = chosen && chosen !== current.status ? chosen : null;

  db.prepare(
    `INSERT INTO suggestion_comments (suggestion_id, body, status, lobbyist_name)
     VALUES (?, ?, ?, ?)`
  ).run(id, body, changed, lobbyist_name);

  if (changed) {
    const isResolved = changed === "done" || changed === "wont_fix";
    db.prepare(
      `UPDATE suggestions
       SET status = ?,
           resolved_at = CASE
             WHEN ? = 1 AND resolved_at IS NULL THEN CURRENT_TIMESTAMP
             WHEN ? = 0 THEN NULL
             ELSE resolved_at
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(changed, isResolved ? 1 : 0, isResolved ? 1 : 0, id);
  }

  return { submittedAt: Date.now() };
}
