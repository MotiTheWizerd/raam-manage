"use client";

import { Plus } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { addOwnerMobile, type OwnerFormState } from "@/app/owners/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useFormToasts } from "@/lib/hooks/useFormToasts";

const initial: OwnerFormState = {};

type Props = { ownerId: number; onAdded: () => void };

export function AddOwnerMobileForm({ ownerId, onAdded }: Props) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(addOwnerMobile, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useFormToasts(state, "הטלפון נוסף");

  useEffect(() => {
    if (!state.submittedAt) return;
    formRef.current?.reset();
    setOpen(false);
    Promise.resolve().then(onAdded);
  }, [state.submittedAt, onAdded]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs opacity-60 hover:opacity-100 transition-opacity"
      >
        <Plus size={12} />
        הוסף טלפון
      </button>
    );
  }

  return (
    <form ref={formRef} action={action} className="flex flex-wrap items-end gap-2 mt-2">
      <input type="hidden" name="owner_id" value={ownerId} />
      <div className="flex flex-col gap-1">
        <label className="text-xs opacity-70">מספר טלפון</label>
        <Input name="phone" required placeholder="050-0000000" dir="ltr" className="w-36 text-end font-mono" />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs opacity-70">הערה</label>
        <Input name="comment" placeholder="נייד, בית..." className="w-32" />
      </div>
      <div className="flex gap-1">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "..." : "שמור"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          ביטול
        </Button>
      </div>
    </form>
  );
}
