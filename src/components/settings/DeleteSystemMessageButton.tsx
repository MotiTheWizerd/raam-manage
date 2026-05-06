"use client";

import { Trash2 } from "lucide-react";
import { useActionState, useEffect } from "react";
import {
  deleteSystemMessage,
  type SystemMessageFormState,
} from "@/app/settings/actions";
import { Button } from "@/components/ui/Button";
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

  useFormToasts(state, "ההודעה נמחקה");

  useEffect(() => {
    if (!state.submittedAt) return;
    notifySystemMessagesChanged();
  }, [state.submittedAt]);

  return (
    <form action={action} className="inline">
      <input type="hidden" name="id" value={messageId} />
      <Button
        type="submit"
        variant="ghost"
        size="icon-sm"
        aria-label="מחק"
        disabled={pending}
      >
        <Trash2 size={14} />
      </Button>
    </form>
  );
}
