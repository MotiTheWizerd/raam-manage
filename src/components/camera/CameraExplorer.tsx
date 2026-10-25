"use client";

import { Cctv, ChevronDown, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CameraGroup as SavedGroup } from "@/app/cameras/actions";
import { CameraGroupEditor } from "@/components/camera/CameraGroupEditor";
import { CameraTile } from "@/components/camera/CameraTile";
import { PageHeading } from "@/components/PageHeading";
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

  const activeGroup =
    sel.kind === "group" ? savedGroups.find((g) => g.id === sel.id) ?? null : null;
  const activeCamera =
    sel.kind === "camera" ? all.find((c) => c.id === sel.id) ?? all[0] : null;

  function pickCamera(cam: CameraInfo, groupKey: string) {
    setSel({ kind: "camera", id: cam.id });
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
                          onClick={() => setSel({ kind: "group", id: group.id })}
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
            {activeGroup ? (
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
                    <CameraTile key={cam.id} camId={cam.id} title={cam.name} />
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
