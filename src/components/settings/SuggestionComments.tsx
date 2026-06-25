"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useCallback, useEffect, useState } from "react";
import {
  addSuggestionComment,
  getSuggestionComments,
  type SuggestionComment,
  type SuggestionFormState,
  type SuggestionStatus,
} from "@/app/settings/suggestions-actions";
import { useActiveLobbyist } from "@/components/PreferencesProvider";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Textarea } from "@/components/ui/Textarea";
import { useFormToasts } from "@/lib/hooks/useFormToasts";
import { notifySuggestionsChanged } from "@/lib/suggestions-events";

const STATUS_LABEL: Record<SuggestionStatus, string> = {
  open: "פתוח",
  in_progress: "בטיפול",
  done: "טופל",
  wont_fix: "לא יטופל",
};

// "" = keep the current status (comment only).
const STATUS_CHANGE_OPTIONS = [
  { value: "", label: "ללא שינוי סטטוס" },
  { value: "open", label: "פתוח" },
  { value: "in_progress", label: "בטיפול" },
  { value: "done", label: "טופל" },
  { value: "wont_fix", label: "לא יטופל" },
];

function formatDate(iso: string): string {
  const d = new Date(iso.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const initialState: SuggestionFormState = {};

type Props = {
  suggestionId: number;
};

// Progress thread under a suggestion/bug. Any logged-in staff member can post an
// update and, optionally, move the post's status with it. Mounted lazily (only
// when the card is expanded), so it loads its own comments on mount.
export function SuggestionComments({ suggestionId }: Props) {
  const activeLobbyist = useActiveLobbyist();
  const [comments, setComments] = useState<SuggestionComment[] | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [state, formAction, pending] = useActionState(
    addSuggestionComment,
    initialState
  );

  useFormToasts(state, "העדכון נוסף");

  const load = useCallback(() => {
    getSuggestionComments(suggestionId).then(setComments);
  }, [suggestionId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!state.submittedAt) return;
    load();
    // A comment may have moved the post's status — refresh the parent list too.
    notifySuggestionsChanged();
    // Remount the form to clear the textarea + reset the status dropdown.
    setFormKey((k) => k + 1);
  }, [state.submittedAt, load]);

  return (
    <div className="space-y-3 border-t border-black/10 pt-4 dark:border-white/10">
      <h3 className="text-xs font-semibold tracking-wide uppercase opacity-50">
        עדכוני טיפול
      </h3>

      {comments === null ? (
        <div className="flex justify-center py-3 opacity-50">
          <Loader2 size={16} className="animate-spin" />
        </div>
      ) : comments.length === 0 ? (
        <p className="text-xs opacity-50">אין עדכונים עדיין.</p>
      ) : (
        <ul className="space-y-2">
          {comments.map((c) => (
            <li
              key={c.id}
              className="rounded-md border border-black/10 bg-background px-3 py-2 dark:border-white/10"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs opacity-60">
                <span className="font-medium opacity-90">
                  {c.lobbyist_name || "—"}
                </span>
                <span>·</span>
                <span>{formatDate(c.created_at)}</span>
                {c.status && (
                  <span className="ms-auto inline-flex items-center rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-300">
                    סטטוס שונה ל: {STATUS_LABEL[c.status]}
                  </span>
                )}
              </div>
              <div className="mt-1 text-sm whitespace-pre-wrap">{c.body}</div>
            </li>
          ))}
        </ul>
      )}

      <form key={formKey} action={formAction} className="space-y-2 pt-1">
        <input type="hidden" name="suggestion_id" value={suggestionId} />
        <input
          type="hidden"
          name="lobbyist_name"
          value={activeLobbyist?.lobbyist_name ?? ""}
        />
        <Textarea
          name="body"
          required
          rows={2}
          placeholder="הוסף עדכון טיפול..."
        />
        <div className="flex items-center justify-between gap-2">
          <Dropdown
            name="status"
            defaultValue=""
            options={STATUS_CHANGE_OPTIONS}
            className="w-44"
          />
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "מוסיף..." : "הוסף עדכון"}
          </Button>
        </div>
        {state.error && (
          <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
        )}
      </form>
    </div>
  );
}
