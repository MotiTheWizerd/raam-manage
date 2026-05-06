"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { createSuggestion } from "@/app/settings/suggestions-actions";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/Button";
import { SuggestionForm } from "./SuggestionForm";

export function AddSuggestionButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm">
        <Plus size={16} />
        הצעה חדשה
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="הצעת ייעול חדשה"
        size="md"
      >
        {open && (
          <SuggestionForm
            mode="create"
            action={createSuggestion}
            onCancel={() => setOpen(false)}
            onSuccess={() => setOpen(false)}
          />
        )}
      </Modal>
    </>
  );
}
