import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { setSessionCookie } from "@/lib/auth";
import { redeemEnterKey } from "@/lib/follow-screen";

export const dynamic = "force-dynamic";

// Where the follow-wall window lands first: swaps its one-time key (see
// lib/follow-screen.ts) for a session, then shows the wall. A spent or unknown
// key just goes on — the window's profile may still be signed in from before,
// and if not, the proxy sends it to /login.
export async function GET(request: NextRequest) {
  const userId = redeemEnterKey(request.nextUrl.searchParams.get("t") ?? "");
  if (userId !== null) await setSessionCookie(userId);
  redirect("/follow");
}
