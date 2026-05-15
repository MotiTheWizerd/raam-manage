"use client";

import { useActionState, useEffect, useState } from "react";
import {
  markPackageDelivered,
  type PackageFormState,
} from "@/app/events/packages-actions";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { useFormToasts } from "@/lib/hooks/useFormToasts";

const initialState: PackageFormState = {};

type Props = {
  packageId: number;
  onSuccess: () => void;
};

export function MarkDeliveredButton({ packageId, onSuccess }: Props) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    markPackageDelivered,
    initialState
  );

  useFormToasts(state, "החבילה נמסרה");

  useEffect(() => {
    if (!state.submittedAt) return;
    Promise.resolve().then(() => {
      setOpen(false);
      onSuccess();
    });
  }, [state.submittedAt, onSuccess]);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
      >
        סמן נמסרה
      </Button>

      <Modal
        open={open}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        title="מסירת חבילה"
        size="sm"
      >
        {open && (
          <form action={action} className="space-y-4">
            <input type="hidden" name="id" value={packageId} />

            <Field label="נמסרה ל" htmlFor={`package-delivered-to-${packageId}`} required>
              <Input
                id={`package-delivered-to-${packageId}`}
                name="delivered_to"
                required
                autoFocus
                defaultValue="דייר"
              />
            </Field>

            {state.error && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {state.error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                ביטול
              </Button>
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "שומר..." : "שמור"}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
