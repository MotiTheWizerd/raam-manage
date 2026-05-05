"use client";

import { Plus } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/Button";
import { createZone, type ZoneFormState } from "./actions";

const initialState: ZoneFormState = {};

export function AddZoneButton() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createZone, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.submittedAt) {
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state.submittedAt]);

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm">
        <Plus size={16} />
        הוסף אזור
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="אזור חדש">
        <form ref={formRef} action={action} className="space-y-4">
          <div>
            <label htmlFor="zone-name" className="block text-sm mb-1.5">
              שם
            </label>
            <input
              id="zone-name"
              name="name"
              required
              autoFocus
              placeholder="צפון B"
              className="w-full px-3 py-2 rounded-md border border-black/15 dark:border-white/15 bg-transparent focus:outline-none focus:ring-2 focus:ring-foreground/30 focus:border-transparent"
            />
          </div>

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
