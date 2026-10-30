"use client";

import {
  Activity,
  Car,
  Cctv,
  ChevronDown,
  FunnelX,
  PawPrint,
  Pencil,
  PersonStanding,
  Plus,
  ScanEye,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { CameraGroup as SavedGroup } from "@/app/cameras/actions";
import { CameraGroupEditor } from "@/components/camera/CameraGroupEditor";
import { CameraTile } from "@/components/camera/CameraTile";
import { PageHeading } from "@/components/PageHeading";
import {
  useMotionExcluded,
  useSetMotionExcluded,
} from "@/components/PreferencesProvider";
import { cn } from "@/lib/cn";

export type CameraInfo = { id: string; name: string };
// A registry group that feeds the side menu (entrance / network / DVR).
export type CameraGroup = { key: string; label: string; cameras: CameraInfo[] };

// What's currently in the spotlight / wall: one camera, or a saved group.
type Selection = { kind: "camera"; id: string } | { kind: "group"; id: number };

// How many columns to lay a wall of n cameras out in — kept squarish so each
// feed stays as large as possible while all fit on one screen.
function gridCols(n: number): number {
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

// Motion-follow mode: polls /api/motion (the cameras' own motion detection)
// and keeps the wall of cameras that moved recently. Tiles keep their place in
// order of arrival so the layout doesn't reshuffle under the viewer.
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

// The cameras explorer: a scrollable side menu of every camera (grouped,
// collapsible) plus the user's own saved camera groups. Picking a single camera
// fills the center spotlight; picking a group tiles all its cameras as a live
// wall. Groups are created/edited in a modal. Pinned to a definite viewport
// height so the menu scrolls within it and the view always fits the screen.
export function CameraExplorer({
  registryGroups,
  savedGroups,
}: {
  registryGroups: CameraGroup[];
  savedGroups: SavedGroup[];
}) {
  const router = useRouter();
  const all = registryGroups.flatMap((g) => g.cameras);

  const [sel, setSel] = useState<Selection>(() =>
    savedGroups[0]
      ? { kind: "group", id: savedGroups[0].id }
      : { kind: "camera", id: all[0]?.id ?? "" }
  );
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(registryGroups.map((g, i) => [g.key, i === 0]))
  );
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<SavedGroup | null>(null);
  const [follow, setFollow] = useState(true);
  const [filters, setFilters] = useState<MotionKind[]>(["person", "vehicle", "animal"]);
  const [wallDetect, setWallDetect] = useState(true);
  const excluded = useMotionExcluded();
  const setExcluded = useSetMotionExcluded();
  const motion = useMotionFollow(follow, filters, excluded);
  const toggleFilter = (kind: MotionKind) =>
    setFilters((f) => (f.includes(kind) ? f.filter((k) => k !== kind) : [...f, kind]));
  const nameOf = (id: string) => all.find((c) => c.id === id)?.name ?? id;

  const activeGroup =
    sel.kind === "group" ? savedGroups.find((g) => g.id === sel.id) ?? null : null;
  const activeCamera =
    sel.kind === "camera" ? all.find((c) => c.id === sel.id) ?? all[0] : null;

  function pickCamera(cam: CameraInfo, groupKey: string) {
    setSel({ kind: "camera", id: cam.id });
    setFollow(false);
    setOpen((o) => ({ ...o, [groupKey]: true }));
  }

  function openCreate() {
    setEditing(null);
    setEditorOpen(true);
  }

  function openEdit(group: SavedGroup) {
    setEditing(group);
    setEditorOpen(true);
  }

  const pickGroups = registryGroups.map((g) => ({ label: g.label, cameras: g.cameras }));

  return (
    <div className="flex h-[calc(100dvh-10rem)] flex-col">
      <div className="mb-3 flex shrink-0 items-center gap-2">
        <Cctv size={22} aria-hidden="true" className="text-foreground/70" />
        <PageHeading href="/cameras" fallback="מצלמות" className="text-xl" />
        <span className="text-sm text-foreground/50">({all.length})</span>
        {follow && (
          <div className="ms-auto flex items-center gap-1">
            <div
              className="flex items-center gap-1"
              title="בחר מה להציג — בלי סינון מוצגת כל תנועה"
            >
              {MOTION_FILTERS.map(({ kind, label, Icon }) => {
                const on = filters.includes(kind);
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => toggleFilter(kind)}
                    aria-pressed={on}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors",
                      on
                        ? "border-emerald-500/40 bg-emerald-500/15 font-semibold text-emerald-700 dark:text-emerald-300"
                        : "border-black/10 text-foreground/70 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
                    )}
                  >
                    <Icon className="size-4" />
                    {label}
                  </button>
                );
              })}
            </div>
            <span className="mx-1 h-5 w-px bg-black/10 dark:bg-white/10" aria-hidden />
            {/* Object detection on every tile in the wall — boxes make far-off
                people and cars easy to spot. A tile's own eye button overrides. */}
            <button
              type="button"
              onClick={() => setWallDetect((d) => !d)}
              aria-pressed={wallDetect}
              title="הצג זיהוי אובייקטים בכל המצלמות במעקב"
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors",
                wallDetect
                  ? "border-emerald-500/40 bg-emerald-500/15 font-semibold text-emerald-700 dark:text-emerald-300"
                  : "border-black/10 text-foreground/70 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
              )}
            >
              <ScanEye className="size-4" />
              זיהוי אובייקטים
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => setFollow((f) => !f)}
          aria-pressed={follow}
          className={cn(
            !follow && "ms-auto",
            "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors",
            follow
              ? "border-red-500/40 bg-red-500/15 font-semibold text-red-600 dark:text-red-300"
              : "border-black/10 text-foreground/70 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
          )}
        >
          <Activity className={cn("size-4", follow && "animate-pulse")} />
          מעקב תנועה
        </button>
      </div>

      {all.length === 0 ? (
        <div className="grid flex-1 place-items-center rounded-xl border border-black/10 text-sm text-foreground/50 dark:border-white/10">
          אין מצלמות מוגדרות
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-3">
          <nav className="flex w-64 shrink-0 flex-col gap-2 overflow-y-auto rounded-xl border border-black/10 bg-black/[0.02] p-2 dark:border-white/10 dark:bg-white/[0.02]">
            {/* My groups — the user-built multi-camera walls. */}
            <div className="flex flex-col">
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
                  הקבוצות שלי ({savedGroups.length})
                </span>
                <button
                  type="button"
                  onClick={openCreate}
                  className="rounded-md p-1 text-foreground/50 transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5"
                  title="קבוצה חדשה"
                  aria-label="קבוצה חדשה"
                >
                  <Plus className="size-4" />
                </button>
              </div>
              {savedGroups.length === 0 ? (
                <p className="px-2 pb-1 text-xs text-foreground/40">
                  צור קבוצה כדי לראות כמה מצלמות יחד
                </p>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {savedGroups.map((group) => {
                    const isActive = sel.kind === "group" && sel.id === group.id;
                    return (
                      <div
                        key={group.id}
                        className={cn(
                          "group flex items-center rounded-lg transition-colors",
                          isActive
                            ? "bg-emerald-500/15"
                            : "hover:bg-black/5 dark:hover:bg-white/5"
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setSel({ kind: "group", id: group.id });
                            setFollow(false);
                          }}
                          className={cn(
                            "min-w-0 flex-1 truncate px-3 py-1.5 text-right text-sm",
                            isActive
                              ? "font-semibold text-emerald-700 dark:text-emerald-300"
                              : "text-foreground/70"
                          )}
                          title={group.name}
                        >
                          {group.name}{" "}
                          <span className="text-xs opacity-60">({group.cameras.length})</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(group)}
                          className="shrink-0 rounded-md p-1.5 text-foreground/40 opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                          title="ערוך קבוצה"
                          aria-label="ערוך קבוצה"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Registry groups — every reachable camera, collapsible. */}
            {registryGroups.map((group) => {
              const isOpen = open[group.key];
              return (
                <div key={group.key} className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => setOpen((o) => ({ ...o, [group.key]: !o[group.key] }))}
                    className="flex items-center justify-between rounded-lg px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/50 transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                    aria-expanded={isOpen}
                  >
                    <span>
                      {group.label} ({group.cameras.length})
                    </span>
                    <ChevronDown
                      className={cn(
                        "size-4 shrink-0 transition-transform",
                        isOpen ? "rotate-180" : "rotate-0"
                      )}
                    />
                  </button>
                  {isOpen && (
                    <div className="mt-1 flex flex-col gap-0.5">
                      {group.cameras.map((cam) => (
                        <button
                          key={cam.id}
                          type="button"
                          onClick={() => pickCamera(cam, group.key)}
                          className={cn(
                            "truncate rounded-lg px-3 py-1.5 text-right text-sm transition-colors",
                            sel.kind === "camera" && cam.id === activeCamera?.id
                              ? "bg-emerald-500/15 font-semibold text-emerald-700 dark:text-emerald-300"
                              : "text-foreground/70 hover:bg-black/5 dark:hover:bg-white/5"
                          )}
                          title={cam.name}
                        >
                          {cam.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* View — a group's wall, or one camera's spotlight. */}
          <div className="min-h-0 flex-1">
            {follow ? (
              <div className="flex h-full flex-col gap-2">
                <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-1.5">
                  {motion.wall.length === 0 ? (
                    <span className="text-sm text-foreground/50">אין תנועה כרגע…</span>
                  ) : (
                    motion.wall.map((id) => {
                      const kinds = motion.active.get(id);
                      return (
                        <span
                          key={id}
                          className={cn(
                            "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs",
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
                          {MOTION_FILTERS.filter((f) => kinds?.includes(f.kind)).map(
                            ({ kind, Icon }) => (
                              <Icon key={kind} className="size-3.5" />
                            )
                          )}
                        </span>
                      );
                    })
                  )}
                  {/* Cameras hidden from follow — X brings one back. */}
                  {excluded.length > 0 && (
                    <div className="ms-auto flex flex-wrap items-center gap-1.5">
                      <span className="flex items-center gap-1 text-xs text-foreground/50">
                        <FunnelX className="size-3.5" aria-hidden />
                        מוסתרות ממעקב:
                      </span>
                      {excluded.map((id) => (
                        <span
                          key={id}
                          className="flex items-center gap-1 rounded-full border border-black/10 py-0.5 pe-1 ps-2.5 text-xs text-foreground/70 dark:border-white/10"
                        >
                          {nameOf(id)}
                          <button
                            type="button"
                            onClick={() => setExcluded(id, false)}
                            aria-label={`החזר את ${nameOf(id)} למעקב`}
                            title="החזר למעקב"
                            className="rounded-full p-0.5 text-foreground/50 transition-colors hover:bg-black/10 hover:text-foreground dark:hover:bg-white/10"
                          >
                            <X className="size-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="min-h-0 flex-1">
                  {motion.wall.length > 0 ? (
                    <div
                      className="grid h-full gap-2"
                      style={{
                        gridTemplateColumns: `repeat(${gridCols(
                          motion.wall.length
                        )}, minmax(0, 1fr))`,
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
                          autoDetect={wallDetect}
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
                  ) : (
                    <div className="grid h-full place-items-center rounded-xl border border-black/10 text-sm text-foreground/50 dark:border-white/10">
                      ממתין לתנועה במצלמות…
                    </div>
                  )}
                </div>
              </div>
            ) : activeGroup ? (
              activeGroup.cameras.length === 0 ? (
                <div className="grid h-full place-items-center rounded-xl border border-black/10 text-sm text-foreground/50 dark:border-white/10">
                  אין מצלמות בקבוצה זו
                </div>
              ) : (
                <div
                  className="grid h-full gap-2"
                  style={{
                    gridTemplateColumns: `repeat(${gridCols(
                      activeGroup.cameras.length
                    )}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${Math.ceil(
                      activeGroup.cameras.length / gridCols(activeGroup.cameras.length)
                    )}, minmax(0, 1fr))`,
                  }}
                >
                  {activeGroup.cameras.map((cam) => (
                    <CameraTile
                      key={cam.id}
                      camId={cam.id}
                      title={cam.name}
                      detectLite={activeGroup.cameras.length > 1}
                    />
                  ))}
                </div>
              )
            ) : activeCamera ? (
              <CameraTile key="spotlight" camId={activeCamera.id} title={activeCamera.name} />
            ) : (
              <div className="grid h-full place-items-center rounded-xl border border-black/10 text-sm text-foreground/50 dark:border-white/10">
                בחר מצלמה או קבוצה מהתפריט
              </div>
            )}
          </div>
        </div>
      )}

      <CameraGroupEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        pickGroups={pickGroups}
        editing={editing}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}
