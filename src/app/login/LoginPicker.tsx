"use client";

import { LogIn } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import type { UserRole } from "@/lib/auth";
import { login, type LoginState } from "./actions";

const initialState: LoginState = {};

type Lobbyist = { id: number; lobbyist_name: string; user_role: UserRole };

const roleLabel: Record<UserRole, string> = {
  lobbyist: "פקיד",
  manager: "פקיד - הרשאות",
};

type Props = {
  lobbyists: Lobbyist[];
};

export function LoginPicker({ lobbyists }: Props) {
  const [picked, setPicked] = useState<Lobbyist | null>(null);
  const [state, action, pending] = useActionState(login, initialState);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (picked) {
      const t = setTimeout(() => passwordRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [picked]);

  if (lobbyists.length === 0) {
    return (
      <p className="text-center text-sm text-foreground/70">
        אין משתמשים פעילים. יש להוסיף משתמשים בטרם הכניסה.
      </p>
    );
  }

  return (
    <>
      <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {lobbyists.map((l) => (
          <li key={l.id}>
            <button
              type="button"
              onClick={() => setPicked(l)}
              className="w-full rounded-xl border border-black/10 dark:border-white/10 px-4 py-5 flex flex-col items-center gap-1.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.05] hover:border-red-500/40 transition-colors"
            >
              <span className="text-base font-medium">{l.lobbyist_name}</span>
              <span
                className={
                  l.user_role === "manager"
                    ? "inline-flex items-center rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:text-red-300"
                    : "inline-flex items-center rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-300"
                }
              >
                {roleLabel[l.user_role]}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <Modal
        open={picked !== null}
        onClose={() => setPicked(null)}
        title={picked ? `כניסה — ${picked.lobbyist_name}` : "כניסה"}
        size="sm"
      >
        {picked && (
          <form action={action} className="space-y-4">
            <input type="hidden" name="user_id" value={picked.id} />

            <Field label="סיסמה" htmlFor="login-password" required>
              <Input
                ref={passwordRef}
                id="login-password"
                name="password"
                type="password"
                required
                submitOnEnter
                placeholder="••••"
                autoComplete="current-password"
              />
            </Field>

            {state.error && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {state.error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPicked(null)}
                type="button"
              >
                ביטול
              </Button>
              <Button type="submit" size="sm" disabled={pending}>
                <LogIn size={16} />
                {pending ? "מתחבר…" : "כניסה"}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
