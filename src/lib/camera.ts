import "server-only";

import crypto from "node:crypto";

import type { CameraCreds } from "@/lib/gates";

// Live snapshot from a Hikvision camera (ISAPI over HTTP digest auth). Verified
// live (session 17): GET /ISAPI/Streaming/channels/101/picture returns an
// image/jpeg once the digest handshake is satisfied. Camera credentials stay
// server-side only — they never reach the browser.

const SNAPSHOT_PATH = "/ISAPI/Streaming/channels/101/picture"; // main stream

function md5(input: string): string {
  return crypto.createHash("md5").update(input).digest("hex");
}

function parseAuthHeader(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  const body = header.replace(/^Digest\s+/i, "");
  for (const match of body.matchAll(/(\w+)=(?:"([^"]*)"|([^,]*))/g)) {
    out[match[1]] = match[2] ?? match[3] ?? "";
  }
  return out;
}

function buildDigest(challenge: string, path: string, user: string, pass: string): string {
  const d = parseAuthHeader(challenge);
  const nc = "00000001";
  const cnonce = crypto.randomBytes(8).toString("hex");
  const ha1 = md5(`${user}:${d.realm}:${pass}`);
  const ha2 = md5(`GET:${path}`);
  const response = md5(`${ha1}:${d.nonce}:${nc}:${cnonce}:${d.qop}:${ha2}`);
  return (
    `Digest username="${user}", realm="${d.realm}", nonce="${d.nonce}", ` +
    `uri="${path}", qop=${d.qop}, nc=${nc}, cnonce="${cnonce}", ` +
    `response="${response}"` +
    (d.opaque ? `, opaque="${d.opaque}"` : "")
  );
}

// Returns a single JPEG frame from the camera, or null if unavailable. Most
// cams use the default main-stream path; a DVR-backed channel (e.g. cam 29 on
// the .137 DVR) overrides it via cam.path (/ISAPI/Streaming/channels/2901/...).
export async function fetchCameraSnapshot(cam: CameraCreds): Promise<ArrayBuffer | null> {
  const path = cam.path ?? SNAPSHOT_PATH;
  const url = `http://${cam.host}${path}`;

  const challenge = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(4000),
  });

  // Some cams may answer 200 with no auth — return directly if so.
  if (challenge.ok) return challenge.arrayBuffer();
  if (challenge.status !== 401) return null;

  const wwwAuth = challenge.headers.get("www-authenticate");
  if (!wwwAuth) return null;

  const authed = await fetch(url, {
    cache: "no-store",
    headers: { Authorization: buildDigest(wwwAuth, path, cam.user, cam.pass) },
    signal: AbortSignal.timeout(4000),
  });

  return authed.ok ? authed.arrayBuffer() : null;
}
