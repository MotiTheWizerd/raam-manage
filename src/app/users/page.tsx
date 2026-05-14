import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { isManager } from "@/lib/auth";
import { AddUserButton } from "./AddUserButton";
import { UsersList, type UsersListUser } from "./UsersList";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  if (!(await isManager())) redirect("/");

  const users = db
    .prepare(
      `SELECT id, lobbyist_name, is_active, user_role, password
       FROM users
       ORDER BY is_active DESC, lobbyist_name`
    )
    .all() as UsersListUser[];

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">פקידים</h1>
        <AddUserButton />
      </div>

      {users.length === 0 ? (
        <p className="text-sm opacity-70">אין פקידים עדיין. הוסף את הראשון.</p>
      ) : (
        <UsersList users={users} />
      )}
    </div>
  );
}
