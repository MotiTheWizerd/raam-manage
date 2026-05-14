"use client";

import { Check } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useFormToasts } from "@/lib/hooks/useFormToasts";
import type { UserRole } from "@/lib/auth";
import { resetUserPassword, type UserFormState } from "./actions";

const initialState: UserFormState = {};

type Props = {
  userId: number;
  currentPassword: string | null;
  userRole: UserRole;
};

export function PasswordResetInput({
  userId,
  currentPassword,
  userRole,
}: Props) {
  const [state, action, pending] = useActionState(
    resetUserPassword,
    initialState
  );

  useFormToasts(state, "הסיסמה עודכנה");

  return (
    <form action={action} className="flex items-center gap-1.5">
      <input type="hidden" name="id" value={userId} />
      <Input
        name="password"
        type={userRole === "manager" ? "text" : "password"}
        defaultValue={currentPassword ?? ""}
        placeholder="סיסמה"
        submitOnEnter
        autoComplete="off"
        className="h-8 w-28 text-sm"
      />
      <Button
        type="submit"
        variant="ghost"
        size="icon-sm"
        aria-label="עדכן סיסמה"
        title="עדכן סיסמה"
        disabled={pending}
      >
        <Check size={16} aria-hidden="true" />
      </Button>
    </form>
  );
}
