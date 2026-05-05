"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90"
      >
        הוסף אזור
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="אזור חדש">
        <form ref={formRef} action={action} className="space-y-3">
          <div>
            <label htmlFor="zone-name" className="block text-sm mb-1">
              שם
            </label>
            <input
              id="zone-name"
              name="name"
              required
              autoFocus
              placeholder="צפון B"
              className="w-full px-3 py-2 rounded-md border border-black/15 dark:border-white/15 bg-transparent focus:outline-none focus:ring-2 focus:ring-foreground/30"
            />
          </div>
          {state.error && (
            <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 py-1.5 rounded-md text-sm hover:bg-black/5 dark:hover:bg-white/10"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={pending}
              className="px-3 py-1.5 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "שומר..." : "שמור"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
