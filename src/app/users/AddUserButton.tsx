"use client";

import { Plus } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { useFormToasts } from "@/lib/hooks/useFormToasts";
import { createUser, type UserFormState } from "./actions";

const initialState: UserFormState = {};

export function AddUserButton() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createUser, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useFormToasts(state);

  useEffect(() => {
    if (!state.submittedAt) return;
    formRef.current?.reset();
    Promise.resolve().then(() => setOpen(false));
  }, [state.submittedAt]);

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm">
        <Plus size={16} />
        הוסף פקיד
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="פקיד חדש">
        <form ref={formRef} action={action} className="space-y-4">
          <Field label="שם" htmlFor="user-name" required>
            <Input
              id="user-name"
              name="lobbyist_name"
              required
              autoFocus
              placeholder="ישראל ישראלי"
            />
          </Field>

          <Field label="תפקיד" htmlFor="user-role" required>
            <Dropdown
              id="user-role"
              name="user_role"
              defaultValue="lobbyist"
              options={[
                { value: "lobbyist", label: "פקיד" },
                { value: "manager", label: "פקיד - הרשאות" },
              ]}
            />
          </Field>

          <Field
            label="סיסמה"
            htmlFor="user-password"
            hint="ברירת מחדל: 1234"
          >
            <Input
              id="user-password"
              name="password"
              type="text"
              placeholder="1234"
              defaultValue="1234"
              autoComplete="off"
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
              {pending ? "שומר..." : "שמור"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
