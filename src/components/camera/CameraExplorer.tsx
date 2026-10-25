"use client";

import { Cctv, ChevronDown } from "lucide-react";
import { useState } from "react";
import { CameraTile } from "@/components/camera/CameraTile";
import { PageHeading } from "@/components/PageHeading";
import { cn } from "@/lib/cn";

export type CameraInfo = { id: string; name: string };
export type CameraGroup = { key: string; label: string; cameras: CameraInfo[] };

// The cameras explorer: a scrollable side menu listing EVERY reachable camera
// (grouped, each group collapsible), and ONE live spotlight in the center. Click
// a name to throw that camera into the spotlight. Only the spotlight streams —
// so a 70+ camera fleet costs one live feed, not seventy. Built for the
// discovery pass: eyeball each camera, learn what it shows, then rename it.
//
// The view is pinned to a definite height (100dvh minus the app header/padding)
// so the long menu scrolls WITHIN it and the spotlight always fits the screen —
// the page's main region grows with its content, so an unpinned tall menu would
// otherwise stretch the whole view past the viewport.
export function CameraExplorer({ groups }: { groups: CameraGroup[] }) {
  const all = groups.flatMap((g) => g.cameras);
  const [activeId, setActiveId] = useState<string>(all[0]?.id ?? "");
  // Only the first group is open initially — the big discovered groups start
  // collapsed so the menu isn't a wall of 70 names on open.
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map((g, i) => [g.key, i === 0]))
  );

  const active = all.find((c) => c.id === activeId) ?? all[0];

  const select = (cam: CameraInfo, groupKey: string) => {
    setActiveId(cam.id);
    // Make sure the group you picked from stays open.
    setOpen((o) => ({ ...o, [groupKey]: true }));
  };

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
          {/* Side menu — the full fleet, grouped + collapsible, scrollable. */}
          <nav className="flex w-64 shrink-0 flex-col gap-2 overflow-y-auto rounded-xl border border-black/10 bg-black/[0.02] p-2 dark:border-white/10 dark:bg-white/[0.02]">
            {groups.map((group) => {
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
                          onClick={() => select(cam, group.key)}
                          className={cn(
                            "truncate rounded-lg px-3 py-1.5 text-right text-sm transition-colors",
                            cam.id === active?.id
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

          {/* Spotlight — the one live feed. Constant key so switching cameras
              swaps the source without remounting (shows the last frame until the
              new one loads). */}
          {active && (
            <div className="min-h-0 flex-1">
              <CameraTile key="spotlight" camId={active.id} title={active.name} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
