"use client";

import { Trash2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  deleteSystemMessage,
  type SystemMessageFormState,
} from "@/app/lobby-messages/actions";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useFormToasts } from "@/lib/hooks/useFormToasts";
import { notifySystemMessagesChanged } from "@/lib/system-messages-events";

const initialState: SystemMessageFormState = {};

type Props = {
  messageId: number;
};

export function DeleteSystemMessageButton({ messageId }: Props) {
  const [state, action, pending] = useActionState(
    deleteSystemMessage,
    initialState
  );
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useFormToasts(state, "ההודעה נמחקה");

  useEffect(() => {
    if (!state.submittedAt) return;
    Promise.resolve().then(() => setOpen(false));
    notifySystemMessagesChanged();
  }, [state.submittedAt]);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="מחק"
        disabled={pending}
        onClick={() => setOpen(true)}
      >
        <Trash2 size={14} />
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        onConfirm={() => formRef.current?.requestSubmit()}
        title="מחיקת הודעה"
        description="למחוק את ההודעה? פעולה זו אינה הפיכה."
        confirmLabel="מחק"
        pendingLabel="מוחק..."
        pending={pending}
      />
      <form ref={formRef} action={action} className="hidden">
        <input type="hidden" name="id" value={messageId} />
      </form>
    </>
  );
}
