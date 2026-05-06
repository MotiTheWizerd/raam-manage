"use client";

import { Pencil } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { useFormToasts } from "@/lib/hooks/useFormToasts";
import { updateUser, type UserFormState } from "./actions";

const initialState: UserFormState = {};

type Props = {
  user: { id: number; lobbyist_name: string; is_active: number };
};

export function EditUserButton({ user }: Props) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(updateUser, initialState);

  useFormToasts(state);

  useEffect(() => {
    if (!state.submittedAt) return;
    Promise.resolve().then(() => setOpen(false));
  }, [state.submittedAt]);

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setOpen(true)}
        aria-label={`ערוך ${user.lobbyist_name}`}
      >
        <Pencil size={14} />
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`עריכת סדרן — ${user.lobbyist_name}`}
      >
        {open && (
          <form action={action} className="space-y-4">
            <input type="hidden" name="id" value={user.id} />

            <Field label="שם" htmlFor={`user-name-${user.id}`} required>
              <Input
                id={`user-name-${user.id}`}
                name="lobbyist_name"
                required
                autoFocus
                defaultValue={user.lobbyist_name}
              />
            </Field>

            <Field label="סטטוס" htmlFor={`user-active-${user.id}`} required>
              <Dropdown
                id={`user-active-${user.id}`}
                name="is_active"
                defaultValue={user.is_active === 1 ? "1" : "0"}
                options={[
                  { value: "1", label: "פעיל" },
                  { value: "0", label: "לא פעיל" },
                ]}
              />
            </Field>

            {state.error && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {state.error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                ביטול
              </Button>
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "שומר..." : "שמור שינויים"}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
