"use client";

import { Loader2, MessageSquarePlus, Send } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Gallery, type GalleryImage } from "@/components/ui/Gallery";
import { cn } from "@/lib/cn";

// "Talk to the cameras": a conversation with the camera investigation agent
// (vision/tracing/chat_service.py via /api/camera-chat). The agent answers in
// text; its tool results arrive as structured events and render here as
// cards with the people's pictures — the agent itself never sees an image.

type Person = {
  person: number;
  best_sighting_id: number;
  first_seen: string;
  last_seen: string;
  cameras: string[];
  sightings: number;
};
type Stay = {
  place: string;
  from: string;
  to: string;
  cameras: string[];
  confidence: "high" | "medium";
  best_sighting_id: number;
};
type Possible = { camera_name: string; from: string; to: string; best_sighting_id: number };

type Part =
  | { kind: "text"; text: string }
  | { kind: "people"; window: string[]; people: Person[] }
  | { kind: "trace"; label?: string; stays: Stay[]; possible: Possible[] }
  | { kind: "notice"; text: string; tone: "warn" | "info" | "error" };

type Item = { role: "user"; text: string } | { role: "assistant"; parts: Part[] };

const TOOL_STATUS: Record<string, string> = {
  list_places: "בודק מיקומים…",
  coverage: "בודק אילו הקלטות מאונדקסות…",
  find_people: "מחפש אנשים…",
  trace_person: "עוקב אחרי האדם…",
  index_window: "מתחיל אינדוקס…",
  job_status: "בודק סטטוס…",
};

const EXAMPLES = [
  "מי היה בלובי הראשי אתמול בין 08:00 ל-08:15?",
  "מי היה בחדר הכושר אתמול בין 08:00 ל-08:15?",
];

const hms = (t: string) => t.slice(11, 19);

// Gallery entry for a sighting: the full camera frame (person boxed) on the
// stage, the small crop in the thumbnail strip.
const galleryImage = (sightingId: number, title: string, detail: string): GalleryImage => ({
  src: `/api/tracing/frame?s=${sightingId}`,
  thumbSrc: `/api/tracing/crop?s=${sightingId}`,
  alt: title,
  caption: (
    <div className="text-sm">
      <span className="font-semibold">{title}</span> · <span dir="ltr">{detail}</span>
    </div>
  ),
});

// One gallery per card: clicking any picture opens it at that picture.
function useCardGallery(images: GalleryImage[]) {
  const [start, setStart] = useState<number | null>(null);
  const gallery = (
    <Gallery images={images} open={start !== null} startIndex={start ?? 0} onClose={() => setStart(null)} />
  );
  return { open: setStart, gallery };
}

export function CameraChat() {
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const [items, setItems] = useState<Item[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [items, status]);

  // Append a part to the assistant message currently streaming (the last item).
  const addPart = (part: Part) =>
    setItems((prev) => {
      const last = prev[prev.length - 1];
      if (!last || last.role !== "assistant") return prev;
      return [...prev.slice(0, -1), { role: "assistant", parts: [...last.parts, part] }];
    });

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    setBusy(true);
    setStatus("חושב…");
    setItems((prev) => [...prev, { role: "user", text: message }, { role: "assistant", parts: [] }]);
    try {
      const res = await fetch("/api/camera-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, message }),
      });
      if (!res.ok || !res.body) throw new Error(res.status === 502 ? "שירות השיחה לא זמין" : `שגיאה ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (line) handleEvent(JSON.parse(line));
        }
      }
    } catch (e) {
      addPart({ kind: "notice", tone: "error", text: e instanceof Error ? e.message : "שגיאה" });
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  function handleEvent(ev: Record<string, unknown> & { type: string }) {
    switch (ev.type) {
      case "text":
        setStatus(null);
        addPart({ kind: "text", text: String(ev.text) });
        break;
      case "tool":
        setStatus(TOOL_STATUS[String(ev.name)] ?? "עובד…");
        break;
      case "people":
        addPart({ kind: "people", window: ev.window as string[], people: (ev.people as Person[]) ?? [] });
        break;
      case "trace":
        addPart({
          kind: "trace",
          label: ev.label as string | undefined,
          stays: (ev.stays as Stay[]) ?? [],
          possible: (ev.possible as Possible[]) ?? [],
        });
        break;
      case "coverage": {
        const missing = (ev.unindexed as string[]) ?? [];
        if (missing.length) addPart({ kind: "notice", tone: "warn", text: `מצלמות שלא אונדקסו בחלון: ${missing.join(", ")}` });
        break;
      }
      case "job":
        addPart({ kind: "notice", tone: "info", text: `אינדוקס ${String(ev.job_id)}: ${ev.status === "done" ? "הסתיים" : ev.status === "failed" ? "נכשל" : "רץ"}` });
        break;
      case "error":
        addPart({ kind: "notice", tone: "error", text: String(ev.message) });
        break;
    }
  }

  return (
    <div className="flex h-[calc(100vh-14rem)] min-h-[28rem] flex-col rounded-lg border border-black/10 dark:border-white/10">
      <div className="flex items-center justify-between border-b border-black/10 dark:border-white/10 px-4 py-2">
        <h2 className="text-sm font-medium">שיחה עם המצלמות</h2>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setItems([]);
            setSessionId(crypto.randomUUID());
          }}
        >
          <MessageSquarePlus className="size-4" /> שיחה חדשה
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {items.length === 0 && (
          <div className="space-y-3 py-8 text-center text-sm opacity-70">
            <p>שאל על אנשים בהקלטות — מי היה איפה ומתי, ולאן הלך.</p>
            <div className="flex flex-wrap justify-center gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => send(ex)}
                  className="rounded-full border border-zinc-300 dark:border-zinc-700 px-3 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/10"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {items.map((item, i) =>
          item.role === "user" ? (
            <div key={i} className="flex justify-start">
              <div className="max-w-[80%] rounded-2xl bg-zinc-800 px-4 py-2 text-sm text-white dark:bg-zinc-700">{item.text}</div>
            </div>
          ) : (
            <div key={i} className="space-y-3">
              {item.parts.map((p, j) => (
                <PartView key={j} part={p} />
              ))}
            </div>
          )
        )}

        {status && (
          <div className="flex items-center gap-2 text-xs opacity-60">
            <Loader2 className="size-3.5 animate-spin" /> {status}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="flex items-end gap-2 border-t border-black/10 dark:border-white/10 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={1}
          placeholder="לדוגמה: מי נכנס ללובי הראשי אתמול בין 17:00 ל-17:30?"
          className="max-h-32 min-h-9 flex-1 resize-none rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/30"
        />
        <Button type="submit" size="icon" disabled={busy || !input.trim()} title="שלח">
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}

function PartView({ part }: { part: Part }) {
  if (part.kind === "text") return <RichText text={part.text} />;
  if (part.kind === "notice")
    return (
      <div
        className={cn(
          "rounded-md px-3 py-2 text-xs",
          part.tone === "error" && "bg-red-500/10 text-red-600 dark:text-red-300",
          part.tone === "warn" && "bg-amber-500/10 text-amber-700 dark:text-amber-300",
          part.tone === "info" && "bg-sky-500/10 text-sky-700 dark:text-sky-300"
        )}
      >
        {part.text}
      </div>
    );
  if (part.kind === "people") return <PeopleView part={part} />;
  return <TraceView part={part} />;
}

function PeopleView({ part }: { part: Extract<Part, { kind: "people" }> }) {
  const { open, gallery } = useCardGallery(
    part.people.map((p) =>
      galleryImage(p.best_sighting_id, `#${p.person}`, `${hms(p.first_seen)}–${hms(p.last_seen)} · ${p.cameras.join(", ")}`)
    )
  );
  return (
    <div className="space-y-2">
      <div className="text-xs opacity-60">
        {part.people.length} אנשים · {part.window[0]} – {part.window[1].slice(11)}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7">
        {part.people.map((p, i) => (
          <div key={p.person} className="overflow-hidden rounded-md border border-black/10 dark:border-white/10">
            <Crop sightingId={p.best_sighting_id} onClick={() => open(i)} />
            <div className="space-y-0.5 p-1.5 text-[11px] leading-tight">
              <div className="font-semibold">#{p.person}</div>
              <div dir="ltr" className="text-end opacity-80">
                {hms(p.first_seen)}–{hms(p.last_seen)}
              </div>
              <div className="truncate opacity-60" title={p.cameras.join(", ")}>
                {p.cameras.join(", ")}
              </div>
            </div>
          </div>
        ))}
      </div>
      {gallery}
    </div>
  );
}

function TraceView({ part }: { part: Extract<Part, { kind: "trace" }> }) {
  const [showPossible, setShowPossible] = useState(false);
  // one gallery for the whole route: the stays, then the possible sightings
  const { open, gallery } = useCardGallery([
    ...part.stays.map((s) => galleryImage(s.best_sighting_id, s.place, `${hms(s.from)}–${hms(s.to)} · ${s.cameras.join(", ")}`)),
    ...part.possible.map((v) => galleryImage(v.best_sighting_id, `אפשרי · ${v.camera_name}`, `${hms(v.from)}–${hms(v.to)}`)),
  ]);
  return (
    <div className="space-y-2 rounded-lg border border-black/10 dark:border-white/10 p-3">
      {gallery}
      <div className="text-xs font-medium opacity-70">מסלול {part.label ?? ""}</div>
      {part.stays.length === 0 && <div className="text-xs opacity-60">לא נמצאו שהיות ודאיות</div>}
      <ol className="space-y-2">
        {part.stays.map((s, i) => (
          <li key={i} className="flex items-center gap-3">
            <div className="w-14 shrink-0 overflow-hidden rounded">
              <Crop sightingId={s.best_sighting_id} onClick={() => open(i)} />
            </div>
            <div className="min-w-0 text-sm">
              <div className="font-semibold">{s.place}</div>
              <div dir="ltr" className="text-end text-xs opacity-80">
                {hms(s.from)} – {hms(s.to)}
              </div>
              <div className="truncate text-xs opacity-60">
                {s.cameras.join(", ")} · {s.confidence === "high" ? "ביטחון גבוה" : "ביטחון בינוני"}
              </div>
            </div>
          </li>
        ))}
      </ol>
      {part.possible.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowPossible((v) => !v)}
            className="text-xs opacity-60 underline-offset-2 hover:underline"
          >
            {showPossible ? "הסתר" : "הצג"} {part.possible.length} זיהויים אפשריים (ביטחון נמוך)
          </button>
          {showPossible && (
            <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-8">
              {part.possible.map((v, i) => (
                <div key={i} className="text-[10px] leading-tight opacity-80">
                  <Crop sightingId={v.best_sighting_id} onClick={() => open(part.stays.length + i)} />
                  <div dir="ltr" className="text-end">{hms(v.from)}</div>
                  <div className="truncate">{v.camera_name}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// A person crop; clicking opens the card's gallery at the full camera frame.
function Crop({ sightingId, onClick }: { sightingId: number; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="הצג בגודל מלא"
      className="block aspect-[3/5] w-full cursor-zoom-in bg-black/40 transition-opacity hover:opacity-85"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/tracing/crop?s=${sightingId}`}
        alt=""
        loading="lazy"
        className="h-full w-full object-contain"
      />
    </button>
  );
}

// The agent writes light markdown: **bold** and "- " bullet lines.
function RichText({ text }: { text: string }) {
  const bold = (line: string) =>
    line.split(/(\*\*[^*]+\*\*)/g).map((seg, k) =>
      seg.startsWith("**") && seg.endsWith("**") ? <strong key={k}>{seg.slice(2, -2)}</strong> : <Fragment key={k}>{seg}</Fragment>
    );
  return (
    <div className="space-y-1 text-sm leading-relaxed">
      {text.split("\n").map((line, i) => {
        const t = line.trim();
        if (!t) return <div key={i} className="h-1" />;
        if (t.startsWith("- ") || t.startsWith("• "))
          return (
            <div key={i} className="flex gap-2 ps-2">
              <span className="opacity-50">•</span>
              <span>{bold(t.slice(2))}</span>
            </div>
          );
        return <p key={i}>{bold(t)}</p>;
      })}
    </div>
  );
}
