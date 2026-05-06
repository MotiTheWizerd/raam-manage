"use client";

import { useActionState, useEffect, useRef } from "react";
import type {
  SuggestionCategory,
  SuggestionFormState,
  SuggestionStatus,
} from "@/app/settings/suggestions-actions";
import { useActiveLobbyist } from "@/components/PreferencesProvider";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useFormToasts } from "@/lib/hooks/useFormToasts";
import { notifySuggestionsChanged } from "@/lib/suggestions-events";

const initialState: SuggestionFormState = {};

const CATEGORY_OPTIONS = [
  { value: "bug", label: "באג" },
  { value: "improvement", label: "שיפור" },
  { value: "idea", label: "רעיון" },
];

const STATUS_OPTIONS = [
  { value: "open", label: "פתוח" },
  { value: "in_progress", label: "בטיפול" },
  { value: "done", label: "טופל" },
  { value: "wont_fix", label: "לא יטופל" },
];

type CreateMode = {
  mode: "create";
};

type EditMode = {
  mode: "edit";
  id: number;
  initialValues: {
    title: string;
    body: string;
    category: SuggestionCategory;
    status: SuggestionStatus;
    resolution_notes: string | null;
  };
};

type Props = (CreateMode | EditMode) & {
  action: (
    prev: SuggestionFormState,
    formData: FormData
  ) => Promise<SuggestionFormState>;
  onCancel?: () => void;
  onSuccess: () => void;
  submitLabel?: string;
};

export function SuggestionForm(props: Props) {
  const { action, onCancel, onSuccess, submitLabel = "שמור" } = props;
  const [state, formAction, pending] = useActionState(action, initialState);
  const activeLobbyist = useActiveLobbyist();
  const lastHandledRef = useRef<number | undefined>(undefined);

  useFormToasts(state);

  useEffect(() => {
    if (!state.submittedAt || state.submittedAt === lastHandledRef.current) return;
    lastHandledRef.current = state.submittedAt;
    notifySuggestionsChanged();
    Promise.resolve().then(onSuccess);
  }, [state.submittedAt, onSuccess]);

  const isEdit = props.mode === "edit";

  return (
    <form action={formAction} className="space-y-4">
      {isEdit && <input type="hidden" name="id" value={props.id} />}

      <Field label="כותרת" htmlFor="sug-title" required>
        <Input
          id="sug-title"
          name="title"
          required
          autoFocus
          defaultValue={isEdit ? props.initialValues.title : ""}
          placeholder="לדוגמה: שדה חיפוש לא מסתנכרן"
        />
      </Field>

      <Field label="תוכן" htmlFor="sug-body" required>
        <Textarea
          id="sug-body"
          name="body"
          required
          rows={4}
          defaultValue={isEdit ? props.initialValues.body : ""}
          placeholder="תיאור מלא של הבעיה או השיפור"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="קטגוריה" htmlFor="sug-category" required>
          <Dropdown
            id="sug-category"
            name="category"
            defaultValue={isEdit ? props.initialValues.category : "idea"}
            options={CATEGORY_OPTIONS}
          />
        </Field>

        {isEdit ? (
          <Field label="סטטוס" htmlFor="sug-status" required>
            <Dropdown
              id="sug-status"
              name="status"
              defaultValue={props.initialValues.status}
              options={STATUS_OPTIONS}
            />
          </Field>
        ) : (
          <Field label="הוגש על ידי" htmlFor="sug-submitted-by" required>
            <Input
              id="sug-submitted-by"
              name="submitted_by"
              required
              defaultValue={activeLobbyist?.lobbyist_name ?? ""}
              placeholder="שם המגיש"
            />
          </Field>
        )}
      </div>

      {isEdit && (
        <Field label="הערות טיפול" htmlFor="sug-resolution">
          <Textarea
            id="sug-resolution"
            name="resolution_notes"
            rows={2}
            defaultValue={props.initialValues.resolution_notes ?? ""}
            placeholder="מה תוקן / למה לא יטופל"
          />
        </Field>
      )}

      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            ביטול
          </Button>
        )}
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "שומר..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
