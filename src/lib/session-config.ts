// Shared session-cookie constants used by BOTH the server-only auth helpers
// (src/lib/auth.ts) and the edge proxy (src/proxy.ts). The proxy can't import
// the server-only auth module, so the cookie name + lifetime live here — in one
// place — so they never drift apart.

export const SESSION_COOKIE_NAME = "raam_session";

// Companion cookie: the epoch-ms timestamp of when the current session logged
// in. Read server-side by the shift-boundary auto-logout (ShiftGuard) so an
// incoming lobbyist who just signed in at a shift changeover isn't cycled by
// the shift they belong to — only sessions that began BEFORE the boundary are.
// Same lifetime as the session cookie.
export const SESSION_SINCE_COOKIE_NAME = "raam_session_since";

// Persistent session lifetime. This is a trusted, single-building lobby PC
// (not public, same reasoning as the plaintext passwords) so we keep staff
// logged in across browser/Windows restarts. A session-only cookie (no expiry)
// was being dropped whenever the browser/PC restarted, leaving a stale tab
// whose red door/gate buttons returned "לא מחובר" until a full reload.
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 90; // 90 days
