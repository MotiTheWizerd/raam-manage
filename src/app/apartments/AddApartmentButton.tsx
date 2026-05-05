"use client";

import { Plus } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { createApartment, type ApartmentFormState } from "./actions";

type Zone = { id: number; name: string };

const initialState: ApartmentFormState = {};

export function AddApartmentButton({ zones }: { zones: Zone[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createApartment, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.submittedAt) {
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state.submittedAt]);

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm">
        <Plus size={16} />
        הוסף דירה
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="דירה חדשה">
        <form ref={formRef} action={action} className="space-y-4">
          <Field label="מספר דירה" htmlFor="apt-number" required>
            <Input
              id="apt-number"
              name="number"
              required
              autoFocus
              placeholder="5א"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="קומה" htmlFor="apt-floor">
              <Input id="apt-floor" name="floor" type="number" placeholder="5" />
            </Field>

            <Field label="אזור" htmlFor="apt-zone">
              <Dropdown
                id="apt-zone"
                name="zone_id"
                placeholder="— ללא —"
                options={[
                  { value: "", label: "— ללא —" },
                  ...zones.map((z) => ({
                    value: String(z.id),
                    label: z.name,
                  })),
                ]}
              />
            </Field>
          </div>

          <Field label="הערות" htmlFor="apt-notes">
            <Textarea
              id="apt-notes"
              name="notes"
              rows={2}
              placeholder="פרטים נוספים על הדירה"
            />
          </Field>

          {state.error && (
            <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              ביטול
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "שומר..." : "שמור"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
