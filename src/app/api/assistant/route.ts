import { NextResponse } from "next/server";
import {
  ASSISTANT_MODEL,
  MAX_HISTORY_MESSAGES,
  OPENROUTER_URL,
  buildSystemPrompt,
  type ChatMessage,
} from "@/lib/assistant";
import { getCurrentUser } from "@/lib/auth";

// The lobby assistant endpoint. Auth-gated (the /api/* paths bypass the proxy
// redirect, so we re-check here). Takes the chat history, prepends the system
// prompt, and streams the model's reply back as plain UTF-8 text chunks — the
// OpenRouter SSE framing is parsed here on the server so the client just reads
// text off the response body.

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return new Response("Assistant not configured (missing API key)", {
      status: 503,
    });
  }

  let history: ChatMessage[];
  try {
    const body = await request.json();
    if (!Array.isArray(body?.messages)) throw new Error("bad shape");
    history = body.messages
      .filter(
        (m: ChatMessage) =>
          (m?.role === "user" || m?.role === "assistant") &&
          typeof m?.content === "string" &&
          m.content.trim() !== ""
      )
      .slice(-MAX_HISTORY_MESSAGES);
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (history.length === 0) {
    return NextResponse.json({ error: "Empty conversation" }, { status: 400 });
  }

  const upstream = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ASSISTANT_MODEL,
      messages: [{ role: "system", content: buildSystemPrompt() }, ...history],
      // DeepSeek v4 is a reasoning model — keep the thinking short so answers
      // land fast (lobbyists ask under pressure). Only content deltas are
      // forwarded to the client; reasoning deltas are dropped below.
      reasoning: { effort: "low" },
      stream: true,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    console.error("[assistant] OpenRouter error", upstream.status, detail);
    return new Response("Assistant upstream error", { status: 502 });
  }

  // Re-stream: decode the SSE lines ("data: {json}" / ": comment" keep-alives /
  // "data: [DONE]") and forward only the text deltas.
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  // An active pump loop (not a pull()-driven stream): DeepSeek streams many
  // reasoning/keep-alive frames that produce no output, and Next's dev server
  // stops calling pull() after a no-enqueue round — the response then never
  // flushes. Pumping in start() reads upstream to the end regardless.
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? ""; // keep the trailing partial line
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue; // skip comments/blanks
            const payload = trimmed.slice(6);
            if (payload === "[DONE]") continue;
            try {
              const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
              if (typeof delta === "string" && delta !== "") {
                controller.enqueue(encoder.encode(delta));
              }
            } catch {
              // ignore malformed frames — the next line resyncs
            }
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
    cancel(reason) {
      void reader.cancel(reason);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
