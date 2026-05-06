import { db } from "@/lib/db";
import { AddUserButton } from "./AddUserButton";
import { EditUserButton } from "./EditUserButton";

export const dynamic = "force-dynamic";

type User = {
  id: number;
  lobbyist_name: string;
  is_active: number;
};

export default function UsersPage() {
  const users = db
    .prepare(
      `SELECT id, lobbyist_name, is_active
       FROM users
       ORDER BY is_active DESC, lobbyist_name`
    )
    .all() as User[];

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">סדרנים</h1>
        <AddUserButton />
      </div>

      {users.length === 0 ? (
        <p className="text-sm opacity-70">אין סדרנים עדיין. הוסף את הראשון.</p>
      ) : (
        <div className="rounded-lg border border-black/10 dark:border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.02] dark:bg-white/[0.03] text-xs uppercase tracking-wide">
              <tr className="border-b border-black/10 dark:border-white/10 opacity-70">
                <th className="px-4 py-2.5 font-medium text-start">שם</th>
                <th className="px-4 py-2.5 font-medium text-start">סטטוס</th>
                <th className="px-4 py-2.5 font-medium text-start"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 dark:divide-white/5">
              {users.map((u) => (
                <tr
                  key={u.id}
                  className="hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors"
                >
                  <td className="px-4 py-2.5 font-medium">{u.lobbyist_name}</td>
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
