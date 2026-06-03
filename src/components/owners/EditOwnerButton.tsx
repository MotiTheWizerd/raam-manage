"use client";

import { Pencil } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { updateOwner, type ApartmentOption, type OwnerFormState } from "@/app/owners/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Modal } from "@/components/Modal";
import { useFormToasts } from "@/lib/hooks/useFormToasts";

const initial: OwnerFormState = {};

type Props = {
  id: number;
  firstName: string;
  lastName: string;
  apartmentId: number | null;
  apartments: ApartmentOption[];
  comments: string | null;
  onUpdated: () => void;
};

export function EditOwnerButton({ id, firstName, lastName, apartmentId, apartments, comments, onUpdated }: Props) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(updateOwner, initial);

  useFormToasts(state, "הפרטים עודכנו");

  useEffect(() => {
    if (!state.submittedAt) return;
    setOpen(false);
    Promise.resolve().then(onUpdated);
  }, [state.submittedAt, onUpdated]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="ערוך בעלים"
        className="inline-flex items-center justify-center h-7 w-7 rounded opacity-40 hover:opacity-100 hover:bg-black/[0.05] dark:hover:bg-white/[0.06] transition-all"
      >
        <Pencil size={14} />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="עריכת בעלים" size="sm">
        <form action={action} className="space-y-4">
          <input type="hidden" name="id" value={id} />

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="edit-owner-first" className="text-xs opacity-70">
                שם פרטי
              </label>
              <Input
                id="edit-owner-first"
                name="first_name"
                required
                defaultValue={firstName}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="edit-owner-last" className="text-xs opacity-70">
                שם משפחה
              </label>
              <Input
                id="edit-owner-last"
                name="last_name"
                required
                defaultValue={lastName}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="edit-owner-apt" className="text-xs opacity-70">דירה</label>
            <select
              id="edit-owner-apt"
              name="apartment_id"
              defaultValue={apartmentId ?? ""}
              className="h-9 w-full rounded-md border border-black/15 dark:border-white/15 bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="">— ללא דירה —</option>
              {apartments.map((a) => (
                <option key={a.id} value={a.id}>דירה {a.number}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="edit-owner-comments" className="text-xs opacity-70">הערות</label>
            <Textarea
              id="edit-owner-comments"
              name="comments"
              defaultValue={comments ?? ""}
              placeholder="הערות נוספות..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              ביטול
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "שומר..." : "שמור"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
