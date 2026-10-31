"use client";

import { Car, ChevronDown, FunnelX, PawPrint, PersonStanding, ScanEye, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CameraTile } from "@/components/camera/CameraTile";
import {
  useMotionExcluded,
  useSetMotionExcluded,
} from "@/components/PreferencesProvider";
import { cn } from "@/lib/cn";

// The motion-follow wall: the cameras that moved recently, as a live grid.
// Shared by /cameras (inside the explorer) and /follow (the bare page the dock
// opens full screen on the camera computer's screen).

// How many columns to lay a wall of n cameras out in — kept squarish so each
// feed stays as large as possible while all fit on one screen.
export function gridCols(n: number): number {
  if (n <= 1) return 1;
  if (n <= 4) return 2;
  if (n <= 9) return 3;
  if (n <= 16) return 4;
  return 5;
}

type MotionKind = "person" | "vehicle" | "animal";
// Mirrors lib/motion.ts (server-only, so not importable here).
type ActiveMotion = {
  id: string;
  startedAt: number;
  lastAt: number;
  kinds: MotionKind[];
  deviceKinds: MotionKind[];
  events: number;
  description: string | null;
  channelName: string | null;
};

// The object filters, in button order. None selected = any motion at all.
const MOTION_FILTERS: { kind: MotionKind; label: string; Icon: typeof PersonStanding }[] = [
  { kind: "person", label: "אנשים", Icon: PersonStanding },
  { kind: "vehicle", label: "רכבים", Icon: Car },
  { kind: "animal", label: "בעלי חיים", Icon: PawPrint },
];

const MOTION_POLL_MS = 1000;
// A camera stays on the wall this long after its last motion, so tiles don't
// pop in and out every time someone pauses.
const MOTION_LINGER_MS = 8000;
// Most tiles the wall shows at once (the most recently moving win).
const MOTION_MAX_TILES = 9;

// Polls /api/motion (the cameras' own motion detection) and keeps the wall of
// cameras that moved recently. Tiles keep their place in order of arrival so
// the layout doesn't reshuffle under the viewer.
function useMotionFollow(enabled: boolean, filters: MotionKind[], excluded: string[]) {
  const [active, setActive] = useState<ActiveMotion[]>([]);
  const [wall, setWall] = useState<string[]>([]);
  // Each camera's latest event, kept after it goes quiet (the lingering tiles).
  const [info, setInfo] = useState(new Map<string, ActiveMotion>());
  // The server's clock — the times in the events are on it.
  const [now, setNow] = useState(0);
  const lastSeen = useRef(new Map<string, number>());

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const res = await fetch("/api/motion", { cache: "no-store" });
        if (res.ok && alive) {
          const body: { now: number; active: ActiveMotion[] } = await res.json();
          const shown = body.active.filter(
            (m) =>
              !excluded.includes(m.id) &&
              (filters.length === 0 || m.kinds.some((k) => filters.includes(k)))
          );
          setActive(shown);
          setNow(body.now);
          setInfo((prev) => {
            const next = new Map(prev);
            for (const m of shown) next.set(m.id, m);
            return next;
          });
        }
      } catch {
        // Transient — keep the last picture.
      }
      if (alive) timer = setTimeout(poll, MOTION_POLL_MS);
    };
    poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [enabled, filters, excluded]);

  useEffect(() => {
    if (!enabled) return;
    const now = Date.now();
    const seen = lastSeen.current;
    for (const m of active) seen.set(m.id, now);
    setWall((prev) => {
      const kept = prev.filter((id) => now - (seen.get(id) ?? 0) <= MOTION_LINGER_MS);
      const added = active.map((m) => m.id).filter((id) => !kept.includes(id));
      const next = [...kept, ...added];
      // Over the cap: drop whichever has been quiet the longest.
      while (next.length > MOTION_MAX_TILES) {
        let oldest = 0;
        for (let i = 1; i < next.length; i++) {
          if ((seen.get(next[i]) ?? 0) < (seen.get(next[oldest]) ?? 0)) oldest = i;
        }
        next.splice(oldest, 1);
      }
      return next.length === prev.length && next.every((id, i) => id === prev[i])
        ? prev
        : next;
    });
  }, [active, enabled]);

  return {
    // camera id -> what it's showing right now (absent = lingering, quiet)
    active: new Map(enabled ? active.map((m) => [m.id, m.kinds]) : []),
    // A just-hidden camera leaves the wall at once, not after its linger.
    wall: enabled ? wall.filter((id) => !excluded.includes(id)) : [],
    info,
    now,
  };
}

// The wall's live state — called by the page, so the chips and the hidden
// list can sit on the page's title line while the grid fills the rest.
export function useMotionWall(enabled: boolean, options: MotionWallOptions) {
  const excluded = useMotionExcluded();
  return useMotionFollow(enabled, options.filters, excluded);
}

export type MotionWallState = ReturnType<typeof useMotionWall>;

const KIND_LABEL: Record<MotionKind, string> = {
  person: "אדם",
  vehicle: "רכב",
  animal: "בעל חיים",
};

// Hebrew for the devices' eventDescription; anything unknown shows as sent.
const EVENT_LABEL: Record<string, string> = { "Motion alarm": "התראת תנועה" };

function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString("he-IL", { hour12: false });
}

function span(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// The strip under a motion-wall tile: what moved and who said so (the
// camera/DVR's own detection, or our AI check on a snapshot), the event, when,
// and for how long. Times are the server's — the devices' clocks are off.
function MotionInfo({ info, live, now }: { info?: ActiveMotion; live: boolean; now: number }) {
  if (!info) return null;
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300">
      {info.kinds.length === 0 ? (
        <span className="text-zinc-500">תנועה — לא זוהה אובייקט</span>
      ) : (
        MOTION_FILTERS.filter((f) => info.kinds.includes(f.kind)).map(({ kind, Icon }) => (
          <span key={kind} className="flex items-center gap-1 font-semibold text-white">
            <Icon className="size-3.5" aria-hidden />
            {KIND_LABEL[kind]}
            <span className="rounded bg-white/10 px-1 text-[10px] font-normal text-zinc-300">
              {info.deviceKinds.includes(kind) ? "זיהוי מצלמה" : "זיהוי AI"}
            </span>
          </span>
        ))
      )}
      {info.description && <span>{EVENT_LABEL[info.description] ?? info.description}</span>}
      <span className={live ? "text-red-300" : "text-zinc-500"}>
        {live
          ? `פעיל ${span(now - info.startedAt)}`
          : `שקט · לפני ${span(now - info.lastAt)}`}
      </span>
      <span className="tabular-nums">{clock(info.lastAt)}</span>
      {info.events > 1 && <span>{info.events} אירועים</span>}
      {info.channelName && (
        <span className="text-zinc-500" dir="ltr">
          {info.channelName}
        </span>
      )}
    </div>
  );
}

// The wall's own options: object detection on every tile, and which kinds of
// object bring a camera onto the wall.
export function useMotionWallOptions() {
  const [filters, setFilters] = useState<MotionKind[]>(["person", "vehicle", "animal"]);
  const [wallDetect, setWallDetect] = useState(true);
  const toggleFilter = (kind: MotionKind) =>
    setFilters((f) => (f.includes(kind) ? f.filter((k) => k !== kind) : [...f, kind]));
  return { filters, toggleFilter, wallDetect, setWallDetect };
}

export type MotionWallOptions = ReturnType<typeof useMotionWallOptions>;

// The wall's controls as plain icons: detection, then the object filters.
// Colour = on.
export function MotionWallToggles({ options }: { options: MotionWallOptions }) {
  const { filters, toggleFilter, wallDetect, setWallDetect } = options;
  return (
    <>
      {/* Object detection on every tile in the wall — boxes make far-off
          people and cars easy to spot. A tile's own eye button overrides. */}
      <button
        type="button"
        onClick={() => setWallDetect((d) => !d)}
        aria-pressed={wallDetect}
        aria-label="זיהוי אובייקטים"
        title="זיהוי אובייקטים בכל המצלמות במעקב"
        className={cn(
          "rounded-md p-1.5 transition-colors",
          wallDetect
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-foreground/40 hover:text-foreground/70"
        )}
      >
        <ScanEye className="size-5" />
      </button>
      <span className="mx-1 h-5 w-px bg-black/10 dark:bg-white/10" aria-hidden />
      {MOTION_FILTERS.toReversed().map(({ kind, label, Icon }) => {
        const on = filters.includes(kind);
        return (
          <button
            key={kind}
            type="button"
            onClick={() => toggleFilter(kind)}
            aria-pressed={on}
            aria-label={label}
            title={`${label} — בלי סינון מוצגת כל תנועה`}
            className={cn(
              "rounded-md p-1.5 transition-colors",
              on
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-foreground/40 hover:text-foreground/70"
            )}
          >
            <Icon className="size-5" />
          </button>
        );
      })}
    </>
  );
}

// A chip per camera on the wall (red = moving now) — one line, for the page's
// title row. Nothing when the wall is empty.
export function MotionChips({
  motion,
  nameOf,
}: {
  motion: MotionWallState;
  nameOf: (id: string) => string;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
      {motion.wall.map((id) => {
        const kinds = motion.active.get(id);
        return (
          <span
            key={id}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs whitespace-nowrap",
              kinds
                ? "border-red-500/50 bg-red-500/15 font-semibold text-red-600 dark:text-red-300"
                : "border-black/10 text-foreground/50 dark:border-white/10"
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                kinds ? "animate-pulse bg-red-500" : "bg-zinc-500"
              )}
            />
            {nameOf(id)}
            {MOTION_FILTERS.filter((f) => kinds?.includes(f.kind)).map(({ kind, Icon }) => (
              <Icon key={kind} className="size-3.5" />
            ))}
          </span>
        );
      })}
    </div>
  );
}

// The cameras hidden from follow, as a dropdown at the end of the title row —
// X on a row brings that camera back. Nothing when none are hidden.
export function HiddenFromFollowMenu({ nameOf }: { nameOf: (id: string) => string }) {
  const excluded = useMotionExcluded();
  const setExcluded = useSetMotionExcluded();
  const [open, setOpen] = useState(false);
  if (excluded.length === 0) return null;
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "flex items-center gap-1.5 rounded-full border border-black/10 px-3 py-1 text-xs text-foreground/70 transition-colors",
          "hover:bg-black/5 hover:text-foreground dark:border-white/10 dark:hover:bg-white/5",
          open && "bg-black/5 text-foreground dark:bg-white/5"
        )}
      >
        <FunnelX className="size-3.5" aria-hidden />
        מוסתרות ממעקב ({excluded.length})
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="menu"
            className={cn(
              "absolute top-full left-0 z-50 mt-1 flex max-h-96 min-w-64 flex-col gap-0.5 overflow-y-auto rounded-xl p-1.5",
              "border border-zinc-200/80 bg-white/95 shadow-2xl backdrop-blur-md",
              "dark:border-zinc-700/80 dark:bg-zinc-900/95"
            )}
          >
            {excluded.map((id) => (
              <div
                key={id}
                className="flex items-center gap-2 rounded-lg py-1 ps-3 pe-1 text-sm text-foreground/80 hover:bg-black/5 dark:hover:bg-white/5"
              >
                <span className="min-w-0 flex-1 truncate" title={nameOf(id)}>
                  {nameOf(id)}
                </span>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => setExcluded(id, false)}
                  aria-label={`החזר את ${nameOf(id)} למעקב`}
                  title="החזר למעקב"
                  className="shrink-0 rounded-md p-1 text-foreground/50 transition-colors hover:bg-black/10 hover:text-foreground dark:hover:bg-white/10"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// The wall itself: the live grid of the cameras on it.
export function MotionWall({
  motion,
  nameOf,
  options,
}: {
  motion: MotionWallState;
  nameOf: (id: string) => string;
  options: MotionWallOptions;
}) {
  const setExcluded = useSetMotionExcluded();

  if (motion.wall.length === 0) {
    return (
      <div className="grid h-full place-items-center rounded-xl border border-black/10 text-sm text-foreground/50 dark:border-white/10">
        ממתין לתנועה במצלמות…
      </div>
    );
  }
  return (
    <div
      className="grid h-full gap-2"
      style={{
        gridTemplateColumns: `repeat(${gridCols(motion.wall.length)}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${Math.ceil(
          motion.wall.length / gridCols(motion.wall.length)
        )}, minmax(0, 1fr))`,
      }}
    >
      {motion.wall.map((id) => (
        <CameraTile
          key={id}
          camId={id}
          title={nameOf(id)}
          onExclude={() => setExcluded(id, true)}
          autoDetect={options.wallDetect}
          detectLite
          footer={
            <MotionInfo
              info={motion.info.get(id)}
              live={motion.active.has(id)}
              now={motion.now}
            />
          }
        />
      ))}
    </div>
  );
}
