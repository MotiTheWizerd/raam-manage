"use client";

import { Trash2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useFormToasts } from "@/lib/hooks/useFormToasts";

type DeleteState = {
  error?: string;
  errorAt?: number;
  submittedAt?: number;
};

type DeleteAction = (
  prev: DeleteState,
  formData: FormData
) => Promise<DeleteState>;

type Props = {
  id: number;
  action: DeleteAction;
  successMessage: string;
  confirmTitle: string;
  confirmDescription?: string;
  ariaLabel?: string;
  onDeleted: () => void;
};

const initialState: DeleteState = {};

export function DeleteEventButton({
  id,
  action,
  successMessage,
  confirmTitle,
  confirmDescription,
  ariaLabel = "מחק",
  onDeleted,
}: Props) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useFormToasts(state, successMessage);

  useEffect(() => {
    if (!state.submittedAt) return;
    Promise.resolve().then(() => {
      setOpen(false);
      onDeleted();
    });
  }, [state.submittedAt, onDeleted]);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => setOpen(true)}
        aria-label={ariaLabel}
        className="text-red-600/70 hover:text-red-700 hover:bg-red-50 dark:text-red-400/70 dark:hover:text-red-300 dark:hover:bg-red-950/30"
      >
        <Trash2 size={14} />
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        onConfirm={() => formRef.current?.requestSubmit()}
        title={confirmTitle}
        description={confirmDescription}
        confirmLabel="מחק"
        pendingLabel="מוחק..."
        pending={pending}
      />
      <form ref={formRef} action={formAction} className="hidden">
        <input type="hidden" name="id" value={id} />
      </form>
    </>
  );
}
