"use client";

import { Loader2, MessageSquarePlus, RotateCcw, RotateCw, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";

type Cam = { id: string; name: string };
type Selection = { cameras: string[]; from: string; to: string };
type Span = { start: string; end: string };
type Found = { cameras: Record<string, Span[]>; errors: Record<string, string> };
/** A recording file ready to play; start/end are its real wall-clock span. */
type Clip = { cam: string; file: string; start: number; end: number };

// Recorder times are naive building-local strings ("2026-10-30T14:00:00"). The
// math runs as if they were UTC so the browser's own zone never shifts them.
const ms = (t: string) => Date.parse(`${t}Z`);
const local = (t: number) => new Date(t).toISOString().slice(0, 19);
const clock = (t: number, seconds = false) => new Date(t).toISOString().slice(11, seconds ? 19 : 16);
const SPEEDS = [1, 2, 4, 8];
const date = (t: number) => {
  const d = new Date(t);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
};

function windowLabel(sel: Selection) {
  const a = ms(sel.from);
  const b = ms(sel.to);
  return sel.from.slice(0, 10) === sel.to.slice(0, 10)
    ? `${date(a)} · ${clock(a)}–${clock(b)}`
    : `${date(a)} ${clock(a)} – ${date(b)} ${clock(b)}`;
}

export function RecordingsView({ cameras }: { cameras: Cam[] }) {
  const names = useMemo(() => new Map(cameras.map((c) => [c.id, c.name])), [cameras]);
  const [text, setText] = useState("");
  const [asking, setAsking] = useState(false);
  const [reply, setReply] = useState<string | null>(null);
  // The conversation so far, sent with each request so the AI remembers it.
  const [history, setHistory] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [found, setFound] = useState<Found | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);

  // Playback: clicking a camera's row plays its recording from that moment.
  const [clip, setClip] = useState<Clip | null>(null);
  const [loading, setLoading] = useState<string | null>(null); // camera being fetched
  const [waited, setWaited] = useState(0);
  const [playError, setPlayError] = useState<string | null>(null);
  const [rate, setRate] = useState(1);
  const videoRef = useRef<HTMLVideoElement>(null);
  const seekTo = useRef<number | null>(null);
  const playToken = useRef(0);

  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setWaited((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [loading]);

  async function play(cam: string, at: number) {
    const v = videoRef.current;
    if (clip && v && cam === clip.cam && at >= clip.start && at < clip.end) {
      v.currentTime = (at - clip.start) / 1000; // same file: just seek
      return;
    }
    const token = ++playToken.current;
    setLoading(cam);
    setWaited(0);
    setPlayError(null);
    try {
      const res = await fetch(`/api/recordings/clip?${new URLSearchParams({ cam, at: local(at) })}`);
      const data = await res.json().catch(() => null);
      if (token !== playToken.current) return; // a newer click won
      if (!res.ok) throw new Error(res.status === 404 ? "אין הקלטה מהרגע הזה והלאה" : (data?.error ?? res.statusText));
      seekTo.current = at;
      setClip({ cam, file: data.file, start: ms(data.start), end: ms(data.end) });
    } catch (e) {
      if (token === playToken.current) setPlayError((e as Error).message);
    } finally {
      if (token === playToken.current) setLoading(null);
    }
  }

  function changeRate(r: number) {
    setRate(r);
    if (videoRef.current) videoRef.current.playbackRate = r;
  }

  function jump(seconds: number) {
    const v = videoRef.current;
    if (v) v.currentTime = Math.max(0, v.currentTime + seconds);
  }

  async function search(sel: Selection, query: string) {
    setSelection(sel);
    setFound(null);
    setCursor(null);
    setSearching(true);
    try {
      const params = new URLSearchParams({ cams: sel.cameras.join(","), from: sel.from, to: sel.to, q: query });
      const res = await fetch(`/api/recordings/search?${params}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? res.statusText);
      setFound(data);
    } catch (e) {
      setError(`החיפוש במקליטים נכשל (${(e as Error).message})`);
    } finally {
      setSearching(false);
    }
  }

  async function ask(e: FormEvent) {
    e.preventDefault();
    const message = text.trim();
    if (!message || asking) return;
    setAsking(true);
    setError(null);
    try {
      const res = await fetch("/api/recordings/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, selection, history }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? res.statusText);
      setReply(data.reply || null);
      setText("");
      // The AI sees its own past answers as the JSON it gave.
      const answer = { cameras: [], ...data.selection, reply: data.reply };
      setHistory((h) => [...h, { role: "user", content: message }, { role: "assistant", content: JSON.stringify(answer) }]);
      if (data.selection) await search(data.selection, message);
    } catch (e) {
      setError(`לא הצלחתי לעבד את הבקשה (${(e as Error).message})`);
    } finally {
      setAsking(false);
    }
  }

  function startOver() {
    setHistory([]);
    setReply(null);
    setError(null);
    setSelection(null);
    setFound(null);
    setCursor(null);
  }

  function removeCamera(id: string) {
    if (!selection) return;
    const rest = selection.cameras.filter((c) => c !== id);
    setSelection(rest.length ? { ...selection, cameras: rest } : null);
    if (!rest.length) setFound(null);
  }

  const busy = asking || searching;

  return (
    <div className="space-y-4">
      <form onSubmit={ask} className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          submitOnEnter
          autoFocus
          placeholder='למשל: "הלובי והחניון היום בין 14:00 ל-16:00"'
          className="h-10 text-base"
        />
        <Button type="submit" size="lg" disabled={busy || !text.trim()} aria-label="חיפוש">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
        </Button>
        {history.length > 0 && (
          <Button variant="ghost" size="lg" onClick={startOver} disabled={busy} title="שיחה חדשה" aria-label="שיחה חדשה">
            <MessageSquarePlus className="size-4" />
          </Button>
        )}
      </form>

      {reply && <p className="text-sm text-zinc-600 dark:text-zinc-400">{reply}</p>}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {(clip || loading || playError) && (
        <div className="overflow-hidden rounded-lg border border-black/10 dark:border-white/10">
          <div className="flex flex-wrap items-center gap-3 border-b border-black/10 px-4 py-2 dark:border-white/10">
            <span className="font-medium">{names.get(loading ?? clip?.cam ?? "") ?? ""}</span>
            {clip && !loading && cursor !== null && (
              <span className="text-lg font-semibold tabular-nums" dir="ltr">
                {clock(cursor, true)}
              </span>
            )}
            {clip && (
              <div className="ms-auto flex items-center gap-1" dir="ltr">
                <Button variant="ghost" size="icon-sm" onClick={() => jump(-10)} aria-label="10 שניות אחורה">
                  <RotateCcw className="size-4" />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => jump(10)} aria-label="10 שניות קדימה">
                  <RotateCw className="size-4" />
                </Button>
                {SPEEDS.map((s) => (
                  <Button
                    key={s}
                    variant={rate === s ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => changeRate(s)}
                    className="px-2 tabular-nums"
                  >
                    {s}×
                  </Button>
                ))}
              </div>
            )}
          </div>
          <div className="relative bg-black">
            {clip && (
              <video
                ref={videoRef}
                key={clip.file}
                src={`/api/recordings/file?${new URLSearchParams({ f: clip.file })}`}
                autoPlay
                muted
                playsInline
                controls
                className="max-h-[65vh] w-full"
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  v.playbackRate = rate;
                  const at = seekTo.current;
                  seekTo.current = null;
                  if (at !== null && at > clip.start) v.currentTime = (at - clip.start) / 1000;
                }}
                onTimeUpdate={(e) => setCursor(clip.start + e.currentTarget.currentTime * 1000)}
                onEnded={() => {
                  // carry on with the camera's next recording inside the window
                  if (selection && clip.end < ms(selection.to)) void play(clip.cam, clip.end + 1000);
                }}
              />
            )}
            {(loading || playError) && (
              <div
                className={cn(
                  "flex items-center justify-center gap-2 p-6 text-sm text-white",
                  clip ? "absolute inset-0 bg-black/60" : "aspect-video max-h-[65vh] w-full"
                )}
              >
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    מוריד את ההקלטה מהמקליט… {waited > 0 && <span className="tabular-nums">{waited} שנ׳</span>}
                  </>
                ) : (
                  <span className="text-red-300">{playError}</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {selection && (
        <div className="rounded-lg border border-black/10 dark:border-white/10">
          <div className="flex flex-wrap items-center gap-2 border-b border-black/10 px-4 py-2 dark:border-white/10">
            <span className="font-medium tabular-nums">{windowLabel(selection)}</span>
            <span className="text-zinc-400">·</span>
            {selection.cameras.map((id) => (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-full bg-black/5 py-0.5 ps-2.5 pe-1 text-xs dark:bg-white/10"
              >
                {names.get(id) ?? id}
                <button
                  type="button"
                  onClick={() => removeCamera(id)}
                  className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/15"
                  aria-label={`הסר ${names.get(id) ?? id}`}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
          <Timeline
            selection={selection}
            found={found}
            searching={searching}
            names={names}
            cursor={cursor}
            active={loading ?? clip?.cam ?? null}
            onPick={(id, t) => {
              setCursor(t);
              void play(id, t);
            }}
          />
        </div>
      )}
    </div>
  );
}

function tickMinutes(spanMs: number) {
  const min = spanMs / 60_000;
  return min <= 60 ? 10 : min <= 180 ? 15 : min <= 360 ? 30 : min <= 720 ? 60 : 120;
}

// One row per camera: where it has recordings inside the window. Time runs
// left to right like the iVMS bar, inside the RTL page. Clicking a row plays
// that camera from the clicked moment.
function Timeline({
  selection,
  found,
  searching,
  names,
  cursor,
  active,
  onPick,
}: {
  selection: Selection;
  found: Found | null;
  searching: boolean;
  names: Map<string, string>;
  cursor: number | null;
  active: string | null;
  onPick: (camera: string, t: number) => void;
}) {
  const t0 = ms(selection.from);
  const t1 = ms(selection.to);
  const span = t1 - t0;
  const pct = (t: number) => ((t - t0) / span) * 100;

  const step = tickMinutes(span) * 60_000;
  const ticks: number[] = [];
  for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) ticks.push(t);

  const withFootage = found ? selection.cameras.filter((id) => found.cameras[id]?.length).length : 0;

  function pick(id: string, e: React.MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    onPick(id, t0 + ((e.clientX - r.left) / r.width) * span);
  }

  return (
    <div className="space-y-1 px-4 py-3">
      <div className="grid grid-cols-[12rem_1fr_4.5rem] items-end gap-3 text-xs text-zinc-500">
        <span>
          {searching
            ? "מחפש במקליטים…"
            : found && `הקלטות ב-${withFootage} מתוך ${selection.cameras.length} מצלמות`}
        </span>
        <div dir="ltr" className="relative h-5">
          {ticks.map((t) => (
            <span key={t} className="absolute -translate-x-1/2 tabular-nums" style={{ left: `${pct(t)}%` }}>
              {clock(t)}
            </span>
          ))}
          {cursor !== null && (
            <span
              className="absolute -top-1 -translate-x-1/2 rounded bg-red-600 px-1 font-medium text-white tabular-nums"
              style={{ left: `${pct(cursor)}%` }}
            >
              {clock(cursor, true)}
            </span>
          )}
        </div>
      </div>

      {selection.cameras.map((id) => {
        const spans = found?.cameras[id];
        const failed = found?.errors[id];
        const total = spans?.reduce((s, x) => s + ms(x.end) - ms(x.start), 0) ?? 0;
        return (
          <div key={id} className="grid grid-cols-[12rem_1fr_4.5rem] items-center gap-3">
            <span
              className={cn("truncate text-sm", id === active && "font-semibold text-red-600 dark:text-red-400")}
              title={names.get(id) ?? id}
            >
              {names.get(id) ?? id}
            </span>
            <div
              dir="ltr"
              onClick={(e) => pick(id, e)}
              className={cn(
                "relative h-7 cursor-crosshair overflow-hidden rounded bg-black/5 dark:bg-white/5",
                searching && "animate-pulse"
              )}
            >
              {ticks.map((t) => (
                <span key={t} className="absolute inset-y-0 w-px bg-black/10 dark:bg-white/10" style={{ left: `${pct(t)}%` }} />
              ))}
              {spans?.map((s) => (
                <span
                  key={s.start}
                  title={`${clock(ms(s.start), true)}–${clock(ms(s.end), true)}`}
                  className="absolute inset-y-1 min-w-0.5 rounded-sm bg-sky-500 hover:bg-sky-400"
                  style={{ left: `${pct(ms(s.start))}%`, width: `${pct(ms(s.end)) - pct(ms(s.start))}%` }}
                />
              ))}
              {cursor !== null && (
                <span className="absolute inset-y-0 w-0.5 bg-red-600" style={{ left: `${pct(cursor)}%` }} />
              )}
            </div>
            <span className="text-xs text-zinc-500 tabular-nums" title={failed}>
              {failed ? "אין חיבור" : spans ? (spans.length ? `${Math.round(total / 60_000)} דק׳` : "אין") : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}
