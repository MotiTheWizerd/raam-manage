import { NextResponse } from "next/server";
import { ASSISTANT_MODEL, OPENROUTER_URL } from "@/lib/assistant";
import { isManager } from "@/lib/auth";
import { listRecordableCameras, nowLocal, type RecSelection } from "@/lib/recordings";

// הקלטות: turn a free-text request ("הלובי והחניון היום בין 14:00 ל-16:00",
// then "גם שעה אחרי") into cameras + a time window. No streaming — the page
// then searches the recorders with the result. The page sends the conversation
// so far, so an answer ("הלובי") completes an earlier request ("בין 10 ל-11").

const MAX_CAMERAS = 16;
const MAX_SPAN_MS = 24 * 3600_000;
const MAX_HISTORY = 12;
const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

type Turn = { role: "user" | "assistant"; content: string };

export async function POST(request: Request) {
  if (!(await isManager())) return new Response("Forbidden", { status: 403 });
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return new Response("AI not configured (missing API key)", { status: 503 });

  const body = await request.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, 1000) : "";
  if (!message) return NextResponse.json({ error: "Empty request" }, { status: 400 });
  const current: RecSelection | null = body?.selection ?? null;
  const history: Turn[] = (Array.isArray(body?.history) ? body.history : [])
    .filter(
      (t: Turn) => (t?.role === "user" || t?.role === "assistant") && typeof t?.content === "string" && t.content
    )
    .slice(-MAX_HISTORY)
    .map((t: Turn) => ({ role: t.role, content: t.content.slice(0, 2000) }));

  const cameras = await listRecordableCameras();
  const lines = cameras.map((c) =>
    [c.id, c.name, c.deviceName !== c.name ? c.deviceName : null, c.location, c.groups.join(", "), c.records]
      .map((v) => v ?? "")
      .join(" | ")
  );
  const system = `You turn a building security manager's request (usually Hebrew) into a search over the building's CCTV recordings.
Now: ${nowLocal()}, building-local time. All times are building-local, no time zone.

Cameras — id | name | recorder's own name | location | places (groups) | records (motion = only when something moves, continuous = always):
${lines.join("\n")}

Current selection on screen: ${current ? JSON.stringify(current) : "none"}

Reply at once with ONLY one JSON object, nothing else:
{"cameras": ["<id>", ...], "from": "YYYY-MM-DDTHH:MM:SS", "to": "YYYY-MM-DDTHH:MM:SS", "reply": "<one short Hebrew sentence>"}
Rules:
- A search needs a PLACE (cameras) and a TIME. Take them from the new message, the conversation so far and the current selection — an answer to your question completes the earlier request, and a follow-up ("גם החניון", "שעה אחרי", "בלי הלובי") changes the current selection.
- If the place or the time is still missing or unclear: don't guess and don't deliberate — return "cameras": [] and ask in "reply" for exactly what's missing (e.g. "איזה מקום?" / "באיזה שעות?").
- Only ids from the list, at most ${MAX_CAMERAS}. A place name (לובי, חניון…) means every camera whose name or places match it.
- "from" before "to", at most 24 hours apart. Recordings only exist in the past: a time with no date means today, or yesterday if that window hasn't happened yet today.
- "reply" says briefly what you picked: the place and the hours, without the date (the screen shows it).`;

  const upstream = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ASSISTANT_MODEL,
      messages: [{ role: "system", content: system }, ...history, { role: "user", content: message }],
      // A lookup, not a puzzle: no thinking step, so the answer lands in seconds.
      reasoning: { enabled: false },
    }),
    signal: AbortSignal.timeout(30_000),
  }).catch((e: unknown) => e as Error);
  if (upstream instanceof Error || !upstream.ok) {
    const detail = upstream instanceof Error ? upstream.message : await upstream.text().catch(() => "");
    console.error("[recordings/ask] OpenRouter error", detail);
    const timedOut = upstream instanceof Error && upstream.name === "TimeoutError";
    return NextResponse.json({ error: timedOut ? "ה-AI לא ענה בזמן, נסה שוב" : "ה-AI לא זמין" }, { status: 502 });
  }

  const content: string = (await upstream.json())?.choices?.[0]?.message?.content ?? "";
  let parsed: { cameras?: unknown; from?: unknown; to?: unknown; reply?: unknown };
  try {
    parsed = JSON.parse(content.slice(content.indexOf("{"), content.lastIndexOf("}") + 1));
  } catch {
    // Answered in words instead of JSON — that's a question back; show it.
    if (!content.trim()) return NextResponse.json({ error: "ה-AI לא החזיר תשובה" }, { status: 502 });
    return NextResponse.json({ selection: null, reply: content.trim().slice(0, 300) });
  }

  const known = new Set(cameras.map((c) => c.id));
  const picked = Array.isArray(parsed.cameras)
    ? [...new Set(parsed.cameras.filter((id): id is string => typeof id === "string" && known.has(id)))]
    : [];
  let from = typeof parsed.from === "string" && LOCAL.test(parsed.from) ? parsed.from : null;
  let to = typeof parsed.to === "string" && LOCAL.test(parsed.to) ? parsed.to : null;
  // Recordings are all in the past: "today 14:00-16:00" asked at 01:30 means
  // yesterday. The model (no thinking step) doesn't always catch that.
  const now = Date.parse(`${nowLocal().slice(0, 19)}Z`);
  const local = (t: number) => new Date(t).toISOString().slice(0, 19);
  if (from && to && Date.parse(`${from}Z`) > now) {
    from = local(Date.parse(`${from}Z`) - 24 * 3600_000);
    to = local(Date.parse(`${to}Z`) - 24 * 3600_000);
  }
  const span = from && to ? Date.parse(`${to}Z`) - Date.parse(`${from}Z`) : 0;
  const selection: RecSelection | null =
    picked.length > 0 && from && to && span > 0 && span <= MAX_SPAN_MS
      ? { cameras: picked.slice(0, MAX_CAMERAS), from, to }
      : null;

  return NextResponse.json({
    selection,
    reply: typeof parsed.reply === "string" ? parsed.reply : "",
  });
}
