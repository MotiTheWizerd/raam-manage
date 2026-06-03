"use client";

import { RotateCcw } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import {
  markEquipmentReturned,
  type EquipmentLoanFormState,
} from "@/app/events/equipment-actions";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useFormToasts } from "@/lib/hooks/useFormToasts";

const initialState: EquipmentLoanFormState = {};

type Props = {
  loanId: number;
  onSuccess: () => void;
  compact?: boolean;
};

export function MarkReturnedButton({ loanId, onSuccess, compact }: Props) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    markEquipmentReturned,
    initialState
  );

  useFormToasts(state, "סומן כהוחזר");

  useEffect(() => {
    if (!state.submittedAt) return;
    Promise.resolve().then(() => {
      setOpen(false);
      onSuccess();
    });
  }, [state.submittedAt, onSuccess]);

  function handleConfirm() {
    const fd = new FormData();
    fd.set("id", String(loanId));
    action(fd);
  }

  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="סמן כהוחזר"
          title="סמן כהוחזר"
          className="inline-flex items-center justify-center h-7 w-7 rounded opacity-50 hover:opacity-100 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all"
        >
          <RotateCcw size={15} />
        </button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setOpen(true)}
        >
          סמן כהוחזר
        </Button>
      )}

      <ConfirmDialog
        open={open}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        onConfirm={handleConfirm}
        title="החזרת ציוד"
        description="האם הציוד הוחזר?"
        confirmLabel="סמן כהוחזר"
        variant="primary"
        pending={pending}
      />
    </>
  );
}
