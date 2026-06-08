"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

type Props = {
  confirm: boolean;
  pending: boolean;
  onOpen: () => void;
  onClose: () => void;
  onConfirm: () => void;
  /** aria-label for the trash button. */
  buttonLabel: string;
  title: string;
  description: string;
};

/** Trash button + confirm dialog cell, shared by every enrolled-list row. */
export function DeleteFaceCell({
  confirm,
  pending,
  onOpen,
  onClose,
  onConfirm,
  buttonLabel,
  title,
  description,
}: Props) {
  return (
    <td className="px-4 py-2.5 text-left">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onOpen}
        aria-label={buttonLabel}
        className="text-red-600/70 hover:bg-red-50 hover:text-red-700 dark:text-red-400/70 dark:hover:bg-red-950/30 dark:hover:text-red-300"
      >
        <Trash2 size={14} />
      </Button>
      <ConfirmDialog
        open={confirm}
        onClose={() => {
          if (!pending) onClose();
        }}
        onConfirm={onConfirm}
        title={title}
        description={description}
        confirmLabel="מחק"
        pendingLabel="מוחק…"
        pending={pending}
      />
    </td>
  );
}
