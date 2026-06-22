"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";
import {
  updateSystemMessage,
  type SystemMessageRow,
} from "@/app/lobby-messages/actions";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/Button";
import { SystemMessageForm } from "./SystemMessageForm";

type Props = {
  message: SystemMessageRow;
};

export function EditSystemMessageButton({ message }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setOpen(true)}
        aria-label={`ערוך ${message.title}`}
      >
        <Pencil size={14} />
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`עריכת הודעה — ${message.title}`}
        size="md"
      >
        {open && (
          <SystemMessageForm
            action={updateSystemMessage}
            initialValues={{
              title: message.title,
              body: message.body,
              start_at: message.start_at,
              end_at: message.end_at,
              priority: message.priority,
            }}
            hiddenIdValue={message.id}
            onCancel={() => setOpen(false)}
            onSuccess={() => setOpen(false)}
            submitLabel="שמור שינויים"
          />
        )}
      </Modal>
    </>
  );
}
