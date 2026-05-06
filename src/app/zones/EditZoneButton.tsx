"use client";

import { Pencil } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { useFormToasts } from "@/lib/hooks/useFormToasts";
import { updateZone, type ZoneFormState } from "./actions";

const initialState: ZoneFormState = {};

export function EditZoneButton({
  zone,
}: {
  zone: { id: number; name: string };
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(updateZone, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useFormToasts(state);

  useEffect(() => {
    if (!state.submittedAt) return;
    Promise.resolve().then(() => setOpen(false));
  }, [state.submittedAt]);

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setOpen(true)}
        aria-label={`ערוך ${zone.name}`}
      >
        <Pencil size={14} />
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`עריכת אזור — ${zone.name}`}
      >
        {open && (
          <form ref={formRef} action={action} className="space-y-4">
            <input type="hidden" name="id" value={zone.id} />
            <Field label="שם" htmlFor={`zone-name-${zone.id}`} required>
              <Input
                id={`zone-name-${zone.id}`}
                name="name"
                required
                autoFocus
                defaultValue={zone.name}
              />
            </Field>

            {state.error && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {state.error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                ביטול
              </Button>
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "שומר..." : "שמור שינויים"}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
