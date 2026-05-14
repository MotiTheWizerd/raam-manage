"use client";

import { useMemo, useState } from "react";
import { Dropdown } from "@/components/ui/Dropdown";
import type { UserRole } from "@/lib/auth";
import { EditUserButton } from "./EditUserButton";
import { PasswordResetInput } from "./PasswordResetInput";

export type UsersListUser = {
  id: number;
  lobbyist_name: string;
  is_active: number;
  user_role: UserRole;
  password: string | null;
};

type StatusFilter = "all" | "active" | "inactive";

type Props = {
  users: UsersListUser[];
};

export function UsersList({ users }: Props) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");

  const filtered = useMemo(() => {
    if (statusFilter === "all") return users;
    const want = statusFilter === "active" ? 1 : 0;
    return users.filter((u) => u.is_active === want);
  }, [users, statusFilter]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Dropdown
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as StatusFilter)}
          options={[
            { value: "active", label: "פעילים" },
            { value: "inactive", label: "לא פעילים" },
            { value: "all", label: "הכל" },
          ]}
          className="w-32"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-black/10 dark:border-white/10 p-8 text-center text-sm opacity-60">
          אין פקידים תואמים
        </div>
      ) : (
        <div className="rounded-lg border border-black/10 dark:border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.02] dark:bg-white/[0.03] text-xs uppercase tracking-wide">
              <tr className="border-b border-black/10 dark:border-white/10 opacity-70">
                <th className="px-4 py-2.5 font-medium text-start">שם</th>
                <th className="px-4 py-2.5 font-medium text-start">תפקיד</th>
                <th className="px-4 py-2.5 font-medium text-start">סטטוס</th>
                <th className="px-4 py-2.5 font-medium text-start">סיסמה</th>
                <th className="px-4 py-2.5 font-medium text-start"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 dark:divide-white/5">
              {filtered.map((u) => (
                <tr
                  key={u.id}
                  className="hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors"
                >
                  <td className="px-4 py-2.5 font-medium">{u.lobbyist_name}</td>
                  <td className="px-4 py-2.5 opacity-80">
                    {u.user_role === "manager" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-300">
                        פקיד - הרשאות
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-300">
                        פקיד
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 opacity-80">
                    {u.is_active === 1 ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                        פעיל
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-500/10 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                        לא פעיל
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <PasswordResetInput
                      userId={u.id}
                      currentPassword={u.password}
                      userRole={u.user_role}
                    />
                  </td>
                  <td className="px-4 py-2.5 text-end">
                    <EditUserButton user={u} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
