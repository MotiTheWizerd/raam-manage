"use client";

import { Check, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  addCamerasToGroup,
  getCameraGroups,
  getRegistryCameras,
  setCameraInGroup,
  updateRegistryCamera,
  type CameraGroup,
  type RegistryCamera,
} from "@/app/settings/camera-registry-actions";
import { useIsManager } from "@/components/AuthProvider";
import { CameraThumb } from "@/components/camera/CameraThumb";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";

const RECORDS_LABEL = { motion: "הקלטה בתנועה", continuous: "הקלטה רציפה", none: "ללא הקלטות" };

export function CameraEditor() {
  const [cameras, setCameras] = useState<RegistryCamera[] | null>(null);
  const [groups, setGroups] = useState<CameraGroup[]>([]);
  const [recorder, setRecorder] = useState<string>("all");
  // "all" | "none" (no group yet) | a group id
  const [group, setGroup] = useState<string>("all");
  const [onlyUnnamed, setOnlyUnnamed] = useState(false);
  const [showEmpty, setShowEmpty] = useState(false);
  const isManager = useIsManager();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkGroup, setBulkGroup] = useState<string>("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([getRegistryCameras(), getCameraGroups()]).then(([rows, gs]) => {
      if (!active) return;
      setCameras(rows);
      setGroups(gs);
    });
    return () => {
      active = false;
    };
  }, []);

  const recorders = useMemo(
    () => [...new Map((cameras ?? []).map((c) => [c.recorderId, c.recorderName])).entries()],
    [cameras]
  );

  if (cameras === null) {
    return <div className="text-sm opacity-60 py-8 text-center">טוען...</div>;
  }

  // Channels with no recordings are mostly empty inputs — hidden by default.
  const relevant = cameras.filter((c) => showEmpty || c.records !== "none");
  const named = relevant.filter((c) => c.nameHe).length;
  const shown = relevant.filter(
    (c) =>
      (recorder === "all" || c.recorderId === recorder) &&
      (group === "all" ||
        (group === "none" ? c.groupIds.length === 0 : c.groupIds.includes(Number(group)))) &&
      (!onlyUnnamed || !c.nameHe)
  );

  const onSaved = (updated: RegistryCamera) =>
    setCameras((prev) => prev && prev.map((c) => (c.id === updated.id ? updated : c)));

  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function addSelectedToGroup() {
    const groupId = Number(bulkGroup);
    if (!groupId) return;
    setBulkBusy(true);
    setBulkError(null);
    const ids = [...selected];
    const res = await addCamerasToGroup(ids, groupId);
    setBulkBusy(false);
    if (!res.ok) return setBulkError(res.error ?? "שמירה נכשלה");
    setCameras(
      (prev) =>
        prev &&
        prev.map((c) =>
          selected.has(c.id) && !c.groupIds.includes(groupId)
            ? { ...c, groupIds: [...c.groupIds, groupId] }
            : c
        )
    );
    setSelected(new Set());
    setBulkGroup("");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium opacity-80">
            {named} מתוך {relevant.length} מצלמות עם שם
          </h2>
          {groups.length === 0 && (
            <p className="text-xs opacity-60">כדי לשייך מצלמות לאזורים, צור קבוצות בתפריט &quot;קבוצות&quot;.</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select
            value={recorder}
            onChange={(e) => setRecorder(e.target.value)}
            className="h-8 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-2"
          >
            <option value="all">כל המקליטים</option>
            {recorders.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <select
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            className="h-8 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-2"
          >
            <option value="all">כל הקבוצות</option>
            <option value="none">ללא קבוצה</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={onlyUnnamed} onChange={(e) => setOnlyUnnamed(e.target.checked)} />
            רק ללא שם
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} />
            הצג ערוצים ללא הקלטות
          </label>
        </div>
      </div>

      {isManager && shown.length > 0 && selected.size === 0 && (
        <button
          type="button"
          onClick={() => setSelected(new Set(shown.map((c) => c.id)))}
          className="text-xs opacity-60 hover:opacity-100 underline-offset-2 hover:underline"
        >
          בחר את כל המוצגות ({shown.length})
        </button>
      )}

      {selected.size > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-red-500/40 bg-background/95 px-3 py-2 text-sm shadow-lg backdrop-blur">
          <span className="font-medium">{selected.size} נבחרו</span>
          <select
            value={bulkGroup}
            onChange={(e) => setBulkGroup(e.target.value)}
            className="h-8 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-2"
          >
            <option value="">בחר קבוצה…</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <Button size="sm" onClick={addSelectedToGroup} disabled={!bulkGroup || bulkBusy}>
            {bulkBusy ? "מוסיף..." : "הוסף לקבוצה"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(shown.map((c) => c.id)))}>
            בחר הכל ({shown.length})
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            נקה בחירה
          </Button>
          {bulkError && <span className="text-xs text-red-500">{bulkError}</span>}
        </div>
      )}

      {shown.length === 0 ? (
        <div className="rounded-lg border border-dashed border-black/10 dark:border-white/10 p-8 text-center text-sm opacity-60">
          אין מצלמות להצגה
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((c) => (
            <CameraEditCard
              key={c.id}
              camera={c}
              groups={groups}
              onSaved={onSaved}
              selected={selected.has(c.id)}
              onToggleSelected={() => toggleSelected(c.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function CameraEditCard({
  camera,
  groups,
  onSaved,
  selected,
  onToggleSelected,
}: {
  camera: RegistryCamera;
  groups: CameraGroup[];
  onSaved: (c: RegistryCamera) => void;
  selected: boolean;
  onToggleSelected: () => void;
}) {
  const isManager = useIsManager();
  const [nameHe, setNameHe] = useState(camera.nameHe ?? "");
  const [active, setActive] = useState(camera.active);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [frameKey, setFrameKey] = useState(0);

  const dirty = nameHe.trim() !== (camera.nameHe ?? "") || active !== camera.active;

  // Group chips save on tap — no Save button needed for them.
  async function toggleGroup(groupId: number) {
    const member = !camera.groupIds.includes(groupId);
    setError(null);
    const res = await setCameraInGroup(camera.id, groupId, member);
    if (!res.ok) return setError(res.error ?? "שמירה נכשלה");
    onSaved({
      ...camera,
      groupIds: member
        ? [...camera.groupIds, groupId]
        : camera.groupIds.filter((id) => id !== groupId),
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    const res = await updateRegistryCamera(camera.id, {
      nameHe,
      location: camera.location ?? "",
      notes: camera.notes ?? "",
      active,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error ?? "שמירה נכשלה");
      return;
    }
    onSaved({ ...camera, nameHe: nameHe.trim() || null, active });
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  }

  return (
    <li
      className={cn(
        "rounded-lg border overflow-hidden transition-colors",
        selected ? "border-red-500 ring-1 ring-red-500" : "border-black/10 dark:border-white/10",
        !active && "opacity-60"
      )}
    >
      <div className="relative aspect-video bg-black/40">
        <CameraThumb key={frameKey} src={`/api/recorder-cam?id=${camera.id}&k=${frameKey}`} />
        {isManager && (
          <label
            className="absolute top-2 right-2 grid place-items-center rounded-md bg-black/50 p-1.5 hover:bg-black/70 cursor-pointer"
            title="בחר"
          >
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelected}
              className="size-4 cursor-pointer accent-red-500"
            />
          </label>
        )}
        <button
          type="button"
          onClick={() => setFrameKey((k) => k + 1)}
          title="רענן תמונה"
          className="absolute top-2 left-2 rounded-md bg-black/50 p-1.5 text-white hover:bg-black/70"
        >
          <RefreshCw className="size-3.5" />
        </button>
      </div>

      <div className="space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs opacity-70">
          <span className="font-medium">{camera.deviceName || "ללא שם במקליט"}</span>
          <span>·</span>
          <span>
            {camera.recorderName} ערוץ {camera.channel}
          </span>
          {camera.cameraIp && (
            <>
              <span>·</span>
              <span dir="ltr">{camera.cameraIp}</span>
            </>
          )}
          {camera.records && (
            <span
              className={cn(
                "rounded px-1.5 py-0.5",
                camera.records === "continuous"
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  : camera.records === "motion"
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : "bg-zinc-500/15"
              )}
            >
              {RECORDS_LABEL[camera.records]}
            </span>
          )}
        </div>

        <Input
          value={nameHe}
          onChange={(e) => setNameHe(e.target.value)}
          placeholder="שם המצלמה"
          disabled={!isManager}
        />

        {groups.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {groups.map((g) => {
              const on = camera.groupIds.includes(g.id);
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => toggleGroup(g.id)}
                  disabled={!isManager}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs transition-colors disabled:pointer-events-none",
                    on
                      ? "border-red-500/60 bg-red-500/15 text-red-600 dark:text-red-300"
                      : "border-zinc-300 dark:border-zinc-700 opacity-60 hover:opacity-100"
                  )}
                >
                  {g.name}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              disabled={!isManager}
            />
            פעילה
          </label>
          <div className="flex items-center gap-2">
            {error && <span className="text-xs text-red-500">{error}</span>}
            {justSaved && <Check className="size-4 text-emerald-500" />}
            {isManager && (
              <Button size="sm" onClick={save} disabled={!dirty || saving}>
                {saving ? "שומר..." : "שמור"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
