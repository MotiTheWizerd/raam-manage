"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { createSystemMessage } from "@/app/settings/actions";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/Button";
import { SystemMessageForm } from "./SystemMessageForm";

export function AddSystemMessageButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm">
        <Plus size={16} />
        הודעה חדשה
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="הודעת מערכת חדשה"
        size="md"
      >
        {open && (
          <SystemMessageForm
            action={createSystemMessage}
            onCancel={() => setOpen(false)}
            onSuccess={() => setOpen(false)}
          />
        )}
      </Modal>
    </>
  );
}
