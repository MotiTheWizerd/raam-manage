"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, MessageSquareText, Trash2 } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import {
  deleteSuggestion,
  getAllSuggestions,
  updateSuggestion,
  type SuggestionCategory,
  type SuggestionFormState,
  type SuggestionRow,
  type SuggestionStatus,
} from "@/app/settings/suggestions-actions";
import { useIsManager } from "@/components/AuthProvider";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { useFormToasts } from "@/lib/hooks/useFormToasts";
import {
  notifySuggestionsChanged,
  onSuggestionsChanged,
} from "@/lib/suggestions-events";
import { AddSuggestionButton } from "./AddSuggestionButton";
import { SuggestionComments } from "./SuggestionComments";
import { SuggestionForm } from "./SuggestionForm";

const CATEGORY_LABEL: Record<SuggestionCategory, string> = {
  bug: "באג",
  improvement: "שיפור",
  idea: "רעיון",
};

const CATEGORY_BADGE: Record<SuggestionCategory, string> = {
  bug: "bg-red-500/10 text-red-700 dark:text-red-300",
  improvement: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  idea: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
};

const STATUS_LABEL: Record<SuggestionStatus, string> = {
  open: "פתוח",
  in_progress: "בטיפול",
  done: "טופל",
  wont_fix: "לא יטופל",
};

const STATUS_BADGE: Record<SuggestionStatus, string> = {
  open: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  in_progress: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  done: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
  wont_fix: "bg-zinc-500/10 text-zinc-500 dark:text-zinc-500 line-through",
};

function formatDate(iso: string): string {
  // sqlite CURRENT_TIMESTAMP gives "YYYY-MM-DD HH:MM:SS" in UTC
  const d = new Date(iso.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function SuggestionsTab() {
  const isManager = useIsManager();
  const [items, setItems] = useState<SuggestionRow[] | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    getAllSuggestions().then((rows) => {
      if (active) setItems(rows);
    });
    return () => {
      active = false;
    };
  }, [refreshTick]);

  useEffect(() => {
    const bump = () => setRefreshTick((t) => t + 1);
    window.addEventListener("focus", bump);
    const unsubscribe = onSuggestionsChanged(bump);
    return () => {
      window.removeEventListener("focus", bump);
      unsubscribe();
    };
  }, []);

  if (items === null) {
    return <div className="text-sm opacity-60 py-8 text-center">טוען...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium opacity-80">
          {items.length === 0
            ? "אין הצעות"
            : `${items.length} הצעות`}
        </h2>
        <AddSuggestionButton />
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-black/10 dark:border-white/10 p-8 text-center text-sm opacity-60">
          אין הצעות עדיין. הצוות יכול להוסיף הצעות, באגים ושיפורים.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((s) => (
            <SuggestionCard
              key={s.id}
              suggestion={s}
              expanded={expandedId === s.id}
              onToggle={() =>
                setExpandedId((cur) => (cur === s.id ? null : s.id))
              }
              onClose={() => setExpandedId(null)}
              canManage={isManager}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type CardProps = {
  suggestion: SuggestionRow;
  expanded: boolean;
  onToggle: () => void;
  onClose: () => void;
  canManage: boolean;
};

function SuggestionCard({
  suggestion,
  expanded,
  onToggle,
  onClose,
  canManage,
}: CardProps) {
  const dimmed =
    suggestion.status === "done" || suggestion.status === "wont_fix";

  return (
    <div
      className={cn(
        "rounded-lg border border-black/10 dark:border-white/10 overflow-hidden transition-colors",
        dimmed && !expanded && "opacity-70"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-start px-4 py-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors"
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                  CATEGORY_BADGE[suggestion.category]
                )}
              >
                {CATEGORY_LABEL[suggestion.category]}
              </span>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                  STATUS_BADGE[suggestion.status]
                )}
              >
                {STATUS_LABEL[suggestion.status]}
              </span>
            </div>
            <div className="font-medium">{suggestion.title}</div>
            {!expanded && (
              <div className="text-xs opacity-60 line-clamp-2">
                {suggestion.body}
              </div>
            )}
            {!expanded && suggestion.last_comment_body && (
              <div className="rounded-md border-s-2 border-sky-400 bg-sky-500/5 px-2.5 py-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-700 dark:text-sky-300">
                  <MessageSquareText size={12} className="shrink-0" />
                  עדכון אחרון
                  {suggestion.last_comment_status && (
                    <span className="inline-flex items-center rounded-full bg-sky-500/15 px-1.5 py-0.5">
                      ← {STATUS_LABEL[suggestion.last_comment_status]}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 line-clamp-2 text-xs opacity-80">
                  {suggestion.last_comment_body}
                </div>
                <div className="mt-0.5 text-[11px] opacity-50">
                  {suggestion.last_comment_by}
                  {suggestion.last_comment_at &&
                    ` · ${formatDate(suggestion.last_comment_at)}`}
                </div>
              </div>
            )}
            <div className="text-xs opacity-50">
              {suggestion.submitted_by} · {formatDate(suggestion.created_at)}
            </div>
          </div>
          <ChevronDown
            size={18}
            className={cn(
              "shrink-0 mt-0.5 opacity-50 transition-transform",
              expanded && "rotate-180"
            )}
          />
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 py-4 border-t border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] space-y-4">
              <fieldset
                disabled={!canManage}
                className="min-w-0 border-0 p-0 m-0"
              >
                <SuggestionForm
                  mode="edit"
                  id={suggestion.id}
                  initialValues={{
                    title: suggestion.title,
                    body: suggestion.body,
                    category: suggestion.category,
                    status: suggestion.status,
                    resolution_notes: suggestion.resolution_notes,
                  }}
                  action={updateSuggestion}
                  onCancel={onClose}
                  onSuccess={onClose}
                  submitLabel="שמור שינויים"
                />
              </fieldset>

              <SuggestionComments suggestionId={suggestion.id} />

              <div className="flex items-center justify-between pt-2 border-t border-black/5 dark:border-white/5">
                <div className="text-xs opacity-50">
                  {suggestion.resolved_at
                    ? `נסגר: ${formatDate(suggestion.resolved_at)}`
                    : `עודכן: ${formatDate(suggestion.updated_at)}`}
                </div>
                {canManage && (
                  <DeleteSuggestionButton suggestionId={suggestion.id} />
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const initialDeleteState: SuggestionFormState = {};

function DeleteSuggestionButton({ suggestionId }: { suggestionId: number }) {
  const [state, action, pending] = useActionState(
    deleteSuggestion,
    initialDeleteState
  );

  useFormToasts(state, "ההצעה נמחקה");

  useEffect(() => {
    if (!state.submittedAt) return;
    notifySuggestionsChanged();
  }, [state.submittedAt]);

  return (
    <form action={action}>
      <input type="hidden" name="id" value={suggestionId} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pending}
        aria-label="מחק"
      >
        <Trash2 size={14} />
        מחק
      </Button>
    </form>
  );
}
