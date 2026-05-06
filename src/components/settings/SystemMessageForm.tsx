"use client";

import { useActionState, useEffect } from "react";
import type {
  SystemMessageFormState,
  SystemMessagePriority,
} from "@/app/settings/actions";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useFormToasts } from "@/lib/hooks/useFormToasts";
import { notifySystemMessagesChanged } from "@/lib/system-messages-events";

const initialState: SystemMessageFormState = {};

type Props = {
  action: (
    prev: SystemMessageFormState,
    formData: FormData
  ) => Promise<SystemMessageFormState>;
  initialValues?: {
    title: string;
    body: string;
    start_at: string;
    end_at: string;
    priority: SystemMessagePriority;
  };
  hiddenIdValue?: number;
  onCancel?: () => void;
  onSuccess: () => void;
  submitLabel?: string;
};

const PRIORITY_OPTIONS = [
  { value: "low", label: "נמוכה" },
  { value: "med", label: "בינונית" },
  { value: "high", label: "גבוהה" },
];

export function SystemMessageForm({
  action,
  initialValues,
  hiddenIdValue,
  onCancel,
  onSuccess,
  submitLabel = "שמור",
}: Props) {
  const [state, formAction, pending] = useActionState(action, initialState);

  useFormToasts(state);

  useEffect(() => {
    if (!state.submittedAt) return;
    notifySystemMessagesChanged();
    Promise.resolve().then(onSuccess);
  }, [state.submittedAt, onSuccess]);

  return (
    <form action={formAction} className="space-y-4">
      {hiddenIdValue !== undefined && (
        <input type="hidden" name="id" value={hiddenIdValue} />
      )}

      <Field label="כותרת" htmlFor="msg-title" required>
        <Input
          id="msg-title"
          name="title"
          required
          autoFocus
          defaultValue={initialValues?.title ?? ""}
          placeholder="תקלה בדלת ראשית"
        />
      </Field>

      <Field label="תוכן" htmlFor="msg-body" required>
        <Textarea
          id="msg-body"
          name="body"
          required
          rows={3}
          defaultValue={initialValues?.body ?? ""}
          placeholder="פרטים מלאים שיופיעו על המסך"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="התחלה" htmlFor="msg-start" required>
          <Input
            id="msg-start"
            name="start_at"
            type="datetime-local"
            required
            dir="ltr"
            defaultValue={initialValues?.start_at ?? ""}
          />
        </Field>
        <Field label="סיום" htmlFor="msg-end" required>
          <Input
            id="msg-end"
            name="end_at"
            type="datetime-local"
            required
            dir="ltr"
            defaultValue={initialValues?.end_at ?? ""}
          />
        </Field>
      </div>

      <Field label="עדיפות" htmlFor="msg-priority" required>
        <Dropdown
          id="msg-priority"
          name="priority"
          defaultValue={initialValues?.priority ?? "med"}
          options={PRIORITY_OPTIONS}
        />
      </Field>

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
