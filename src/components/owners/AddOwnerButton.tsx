"use client";

import { Plus, Trash2 } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { createOwner, type ApartmentOption, type OwnerFormState } from "@/app/owners/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Modal } from "@/components/Modal";
import { useFormToasts } from "@/lib/hooks/useFormToasts";

const initial: OwnerFormState = {};

type PhoneEntry = { phone: string; comment: string };

type Props = { onCreated: () => void; apartments: ApartmentOption[] };

export function AddOwnerButton({ onCreated, apartments }: Props) {
  const [open, setOpen] = useState(false);
  const [phones, setPhones] = useState<PhoneEntry[]>([]);
  const [state, action, pending] = useActionState(createOwner, initial);

  useFormToasts(state, "הבעלים נוסף");

  useEffect(() => {
    if (!state.submittedAt) return;
    setOpen(false);
    setPhones([]);
    Promise.resolve().then(onCreated);
  }, [state.submittedAt, onCreated]);

  function addPhone() {
    setPhones((prev) => [...prev, { phone: "", comment: "" }]);
  }

  function removePhone(i: number) {
    setPhones((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updatePhone(i: number, field: keyof PhoneEntry, value: string) {
    setPhones((prev) =>
      prev.map((p, idx) => (idx === i ? { ...p, [field]: value } : p))
    );
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus size={14} />
        הוסף בעלים
      </Button>

      <Modal
        open={open}
        onClose={() => { setOpen(false); setPhones([]); }}
        title="הוספת בעלים"
        size="sm"
      >
        <form action={action} className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="owner-first" className="text-xs opacity-70">
                שם פרטי
              </label>
              <Input id="owner-first" name="first_name" required placeholder="ישראל" />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="owner-last" className="text-xs opacity-70">
                שם משפחה
              </label>
              <Input id="owner-last" name="last_name" required placeholder="ישראלי" />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="owner-apt" className="text-xs opacity-70">דירה</label>
            <select
              id="owner-apt"
              name="apartment_id"
              className="h-9 w-full rounded-md border border-black/15 dark:border-white/15 bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="">— ללא דירה —</option>
              {apartments.map((a) => (
                <option key={a.id} value={a.id}>דירה {a.number}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="owner-comments" className="text-xs opacity-70">הערות</label>
            <Textarea id="owner-comments" name="comments" placeholder="הערות נוספות..." rows={3} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium opacity-70">טלפונים</span>
              <button
                type="button"
                onClick={addPhone}
                className="inline-flex items-center gap-1 text-xs opacity-60 hover:opacity-100 transition-opacity"
              >
                <Plus size={12} />
                הוסף טלפון
              </button>
            </div>

            {phones.length === 0 && (
              <p className="text-xs opacity-40 text-center py-2">
                אין טלפונים — ניתן להוסיף לאחר השמירה
              </p>
            )}

            {phones.map((entry, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="hidden" name="phone[]" value={entry.phone} />
                <input type="hidden" name="comment[]" value={entry.comment} />
                <Input
                  dir="ltr"
                  placeholder="050-0000000"
                  value={entry.phone}
                  onChange={(e) => updatePhone(i, "phone", e.target.value)}
                  className="flex-1 text-end font-mono"
                />
                <Input
                  placeholder="הערה"
                  value={entry.comment}
                  onChange={(e) => updatePhone(i, "comment", e.target.value)}
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={() => removePhone(i)}
                  aria-label="הסר טלפון"
                  className="shrink-0 inline-flex items-center justify-center h-8 w-8 rounded opacity-50 hover:opacity-100 hover:text-red-600 transition-all"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => { setOpen(false); setPhones([]); }}>
              ביטול
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "שומר..." : "הוסף"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
