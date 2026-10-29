"use client";

import { Check, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  getRegistryCameras,
  updateRegistryCamera,
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
  const [recorder, setRecorder] = useState<string>("all");
  const [onlyUnnamed, setOnlyUnnamed] = useState(false);
  const [showEmpty, setShowEmpty] = useState(false);

  useEffect(() => {
    let active = true;
    getRegistryCameras().then((rows) => {
      if (active) setCameras(rows);
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
    (c) => (recorder === "all" || c.recorderId === recorder) && (!onlyUnnamed || !c.nameHe)
  );

  const onSaved = (updated: RegistryCamera) =>
    setCameras((prev) => prev && prev.map((c) => (c.id === updated.id ? updated : c)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium opacity-80">
          {named} מתוך {relevant.length} מצלמות עם שם
        </h2>
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

      {shown.length === 0 ? (
        <div className="rounded-lg border border-dashed border-black/10 dark:border-white/10 p-8 text-center text-sm opacity-60">
          אין מצלמות להצגה
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((c) => (
            <CameraEditCard key={c.id} camera={c} onSaved={onSaved} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CameraEditCard({
  camera,
  onSaved,
}: {
  camera: RegistryCamera;
  onSaved: (c: RegistryCamera) => void;
}) {
  const isManager = useIsManager();
  const [nameHe, setNameHe] = useState(camera.nameHe ?? "");
  const [location, setLocation] = useState(camera.location ?? "");
  const [active, setActive] = useState(camera.active);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [frameKey, setFrameKey] = useState(0);

  const dirty =
    nameHe.trim() !== (camera.nameHe ?? "") ||
    location.trim() !== (camera.location ?? "") ||
    active !== camera.active;

  async function save() {
    setSaving(true);
    setError(null);
    const res = await updateRegistryCamera(camera.id, {
      nameHe,
      location,
      notes: camera.notes ?? "",
      active,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error ?? "שמירה נכשלה");
      return;
    }
    onSaved({
      ...camera,
      nameHe: nameHe.trim() || null,
      location: location.trim() || null,
      active,
    });
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  }

  return (
    <li
      className={cn(
        "rounded-lg border border-black/10 dark:border-white/10 overflow-hidden",
        !active && "opacity-60"
      )}
    >
      <div className="relative aspect-video bg-black/40">
        <CameraThumb key={frameKey} src={`/api/recorder-cam?id=${camera.id}&k=${frameKey}`} />
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

        <div className="grid gap-2">
          <Input
            value={nameHe}
            onChange={(e) => setNameHe(e.target.value)}
            placeholder="שם המצלמה"
            disabled={!isManager}
          />
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="מיקום (קומה / אזור)"
            disabled={!isManager}
          />
        </div>

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
