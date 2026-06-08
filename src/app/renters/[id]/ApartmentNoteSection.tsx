"use client";

import { useActionState } from "react";
import { updateApartmentNotes } from "@/app/apartments/actions";
import type { ApartmentFormState } from "@/app/apartments/actions";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { useFormToasts } from "@/lib/hooks/useFormToasts";

type Props = {
  apartmentId: number;
  apartmentNumber: string | null;
  initialNote: string | null;
  canEdit: boolean;
};

const initialState: ApartmentFormState = {};

/**
 * The apartment's general note, shown on the resident detail page. The note
 * belongs to the apartment (shared by everyone living there), so editing it
 * here updates it building-wide — managers can save it from this page too.
 */
export function ApartmentNoteSection({
  apartmentId,
  apartmentNumber,
  initialNote,
  canEdit,
}: Props) {
  const [state, formAction, pending] = useActionState(
    updateApartmentNotes,
    initialState
  );
  useFormToasts(state);

  // No apartment linked → nothing to show.
  if (!apartmentNumber) return null;

  const heading = (
    <div className="text-xs uppercase tracking-wide opacity-60">
      הערת דירה — דירה {apartmentNumber}
    </div>
  );

  if (!canEdit) {
    // Read-only: only surface the block when there's actually a note.
    if (!initialNote) return null;
    return (
      <div className="rounded-lg border border-black/10 dark:border-white/10 p-4 space-y-1">
        {heading}
        <p className="text-sm whitespace-pre-wrap">{initialNote}</p>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="rounded-lg border border-black/10 dark:border-white/10 p-4 space-y-2"
    >
      <input type="hidden" name="id" value={apartmentId} />
      {heading}
      <Textarea
        name="notes"
        rows={2}
        defaultValue={initialNote ?? ""}
        placeholder="הערה כללית על הדירה (משותפת לכל הדיירים בדירה)"
      />
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "שומר..." : "שמור הערת דירה"}
        </Button>
      </div>
    </form>
  );
}
