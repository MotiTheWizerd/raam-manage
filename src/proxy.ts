import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/session-config";

export function proxy(request: NextRequest) {
  const session = request.cookies.get(SESSION_COOKIE_NAME);
  const hasSession = session !== undefined;
  const isLogin = request.nextUrl.pathname === "/login";

  if (!hasSession && !isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (hasSession && isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next();
  // Sliding refresh: re-stamp the session cookie's lifetime on every authed
  // request so an already-open session also becomes persistent and survives
  // browser/Windows restarts (otherwise a stale tab's red door/gate buttons
  // return "לא מחובר" until a full reload). See session-config.ts.
  if (hasSession) {
    res.cookies.set(SESSION_COOKIE_NAME, session.value, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
  }
  return res;
}

export const config = {
  matcher: [
    // Run on every route except API routes, _next internals, and common static assets.
    "/((?!api|_next/static|_next/image|favicon.ico|logo.png|.*\\.png$|.*\\.svg$|.*\\.jpg$).*)",
  ],
};
