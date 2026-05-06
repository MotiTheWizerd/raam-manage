"use client";

import { Plus } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { useFormToasts } from "@/lib/hooks/useFormToasts";
import { createZone, type ZoneFormState } from "./actions";

const initialState: ZoneFormState = {};

export function AddZoneButton() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createZone, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useFormToasts(state);

  useEffect(() => {
    if (!state.submittedAt) return;
    formRef.current?.reset();
    Promise.resolve().then(() => setOpen(false));
  }, [state.submittedAt]);

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm">
        <Plus size={16} />
        הוסף אזור
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="אזור חדש">
        <form ref={formRef} action={action} className="space-y-4">
          <Field label="שם" htmlFor="zone-name" required>
            <Input
              id="zone-name"
              name="name"
              required
              autoFocus
              placeholder="צפון B"
            />
          </Field>

          {state.error && (
            <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              ביטול
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "שומר..." : "שמור"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
