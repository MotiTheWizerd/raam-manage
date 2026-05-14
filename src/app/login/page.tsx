import Image from "next/image";
import { db } from "@/lib/db";
import type { UserRole } from "@/lib/auth";
import { LoginPicker } from "./LoginPicker";

export const dynamic = "force-dynamic";

type Lobbyist = { id: number; lobbyist_name: string; user_role: UserRole };

export default function LoginPage() {
  const lobbyists = db
    .prepare(
      `SELECT id, lobbyist_name, user_role
       FROM users
       WHERE is_active = 1
       ORDER BY lobbyist_name`
    )
    .all() as Lobbyist[];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-2xl space-y-10">
        <header className="flex flex-col items-center gap-3 text-center">
          <Image
            src="/logo.png"
            alt="רעם בטחון"
            width={279}
            height={91}
            priority
            unoptimized
            className="h-14 w-auto"
          />
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">רעם בטחון</h1>
            <p className="text-sm text-foreground/60">בחר את שמך כדי להתחבר</p>
          </div>
        </header>

        <LoginPicker lobbyists={lobbyists} />
      </div>
    </div>
  );
}
