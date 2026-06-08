"use client";

import {
  CheckCircle2,
  ScanFace,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserRoundPlus,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  searchResidents,
  type ResidentSearchResult,
} from "@/app/renters/actions";
import {
  enrollResidentFace,
  enrollStaffFace,
  forgetEnrolledFace,
  getFaceConsole,
  setFaceArmed,
  type EnrolledFace,
  type FaceConsole,
} from "@/app/settings/face-actions";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";

// The face sentry's own HTTP service (vision/face_probe.py). The browser loads
// its annotated MJPEG straight from the lobby PC; override per-machine if the
// port changes. Server-side calls use FACE_VISION_URL (see src/lib/faces.ts).
const FACE_URL =
  process.env.NEXT_PUBLIC_FACE_VISION_URL ?? "http://127.0.0.1:8090";

// How long the app waits for the (deferred) capture to complete: the sentry
// only starts its ~6s capture once a face appears, so we poll for the saved
// faceprint across the walk-over grace window + the capture itself.
const AWAIT_WINDOW_MS = 60_000;
const POLL_MS = 2500;

export function FaceRecTab() {
  const [data, setData] = useState<FaceConsole | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const c = await getFaceConsole();
    setData(c);
    setLoading(false);
    return c;
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ScanFace className="size-5 opacity-70" />
          <h2 className="text-lg font-semibold">זיהוי פנים</h2>
        </div>
        {data && <ArmToggle data={data} onChanged={reload} />}
      </header>

      {loading ? (
        <div className="py-12 text-center text-sm opacity-60">טוען…</div>
      ) : !data ? null : (
        <>
          {!data.sentryUp && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
              <ShieldAlert className="size-4 shrink-0" />
              שירות זיהוי הפנים אינו פעיל כרגע — ניתן לנהל רישומים אך לא לרשום פנים
              חדשות.
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <LiveCam sentryUp={data.sentryUp} />
            <EnrollPanel sentryUp={data.sentryUp} refresh={reload} />
          </div>

          <EnrolledList data={data} onChanged={reload} />
        </>
      )}
    </div>
  );
}

// --- armed toggle ----------------------------------------------------------
function ArmToggle({
  data,
  onChanged,
}: {
  data: FaceConsole;
  onChanged: () => void;
}) {
  const [pending, setPending] = useState(false);
  const armed = data.armed;

  async function toggle() {
    if (!data.sentryUp) return;
    setPending(true);
    await setFaceArmed(!armed);
    await onChanged();
    setPending(false);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending || !data.sentryUp}
      className={cn(
        "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50",
        armed
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-zinc-400/40 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300"
      )}
      title={armed ? "פתיחת דלת אוטומטית פעילה" : "פתיחת דלת אוטומטית מושבתת"}
    >
      {armed ? <ShieldCheck className="size-4" /> : <ShieldAlert className="size-4" />}
      {armed ? "פתיחה אוטומטית פעילה" : "פתיחה אוטומטית מושבתת"}
    </button>
  );
}

// --- live annotated camera -------------------------------------------------
function LiveCam({ sentryUp }: { sentryUp: boolean }) {
  // Cache-bust so re-mount revives an idled-out worker.
  const [src, setSrc] = useState(() => `${FACE_URL}/lobby?t=${Date.now()}`);
  const [error, setError] = useState(false);

  function reconnect() {
    setError(false);
    setSrc(`${FACE_URL}/lobby?t=${Date.now()}`);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium opacity-80">מצלמת לובי — שידור חי</span>
        <span className="flex items-center gap-1.5 text-xs opacity-60">
          <span className="size-2 animate-pulse rounded-full bg-emerald-400" />
          זיהוי פעיל
        </span>
      </div>
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-black/10 bg-black dark:border-white/10">
        {sentryUp && !error ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt="מצלמת זיהוי פנים"
            onError={() => setError(true)}
            className="block h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-sm text-zinc-400">
            <span>{sentryUp ? "המצלמה אינה זמינה" : "שירות הזיהוי אינו פעיל"}</span>
            {sentryUp && (
              <button
                type="button"
                onClick={reconnect}
                className="rounded-md border border-white/20 px-3 py-1 text-xs hover:bg-white/10"
              >
                התחבר מחדש
              </button>
            )}
          </div>
        )}
      </div>
      <p className="text-xs opacity-50">
        הכיתוב על הוידאו מציג בזמן אמת מה המצלמה מזהה (התאמה / לא מזוהה / רישום).
      </p>
    </div>
  );
}

// --- enroll panel ----------------------------------------------------------
type Mode = "resident" | "staff";

function EnrollPanel({
  sentryUp,
  refresh,
}: {
  sentryUp: boolean;
  refresh: () => Promise<FaceConsole>;
}) {
  const [mode, setMode] = useState<Mode>("resident");

  // resident mode
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 250);
  const [results, setResults] = useState<ResidentSearchResult[]>([]);
  const [selected, setSelected] = useState<ResidentSearchResult | null>(null);

  // staff mode
  const [staffName, setStaffName] = useState("");

  // deferred-capture state: once armed we poll for the saved faceprint
  const [awaiting, setAwaiting] = useState<{ label: string; name: string } | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const enrolling = awaiting !== null;

  useEffect(() => {
    let active = true;
    const q = debounced.trim();
    if (mode !== "resident" || !q || selected) {
      setResults([]);
      return;
    }
    searchResidents(q).then((r) => {
      if (active) setResults(r);
    });
    return () => {
      active = false;
    };
  }, [debounced, selected, mode]);

  // While armed, poll the console until the sentry has actually saved this
  // faceprint (the capture is deferred until a face appears at the camera), or
  // give up after the grace window. Each poll also refreshes the list below.
  useEffect(() => {
    if (!awaiting) return;
    let active = true;
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (!active) return;
      const c = await refresh();
      if (!active) return;
      const hit = c.faces.find((f) => f.label === awaiting.label);
      if (hit?.inModel) {
        setStatus({ ok: true, msg: `נשמר! הפנים של ${awaiting.name} נרשמו.` });
        setAwaiting(null);
        return;
      }
      if (Date.now() - startedAt > AWAIT_WINDOW_MS) {
        setStatus({ ok: false, msg: "לא זוהו פנים בזמן — נסה/י שוב מול המצלמה." });
        setAwaiting(null);
        return;
      }
      timer = setTimeout(tick, POLL_MS);
    };

    timer = setTimeout(tick, POLL_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [awaiting, refresh]);

  const subjectName =
    mode === "resident" ? selected?.first_name ?? "" : staffName.trim();
  const canEnroll =
    sentryUp && !enrolling && (mode === "resident" ? !!selected : !!staffName.trim());

  async function enroll() {
    if (!canEnroll) return;
    setStatus(null);
    const res =
      mode === "resident"
        ? await enrollResidentFace(selected!.id)
        : await enrollStaffFace(staffName.trim());
    if (res.ok && res.label) {
      setAwaiting({ label: res.label, name: subjectName || "הדייר" });
    } else {
      setStatus({ ok: false, msg: res.msg });
    }
  }

  function pick(r: ResidentSearchResult) {
    setSelected(r);
    setQuery(`${r.first_name} ${r.last_name}`);
    setResults([]);
    setStatus(null);
  }

  function clearSelection() {
    setSelected(null);
    setQuery("");
    setResults([]);
    setStatus(null);
  }

  function switchMode(next: Mode) {
    if (enrolling) return;
    setMode(next);
    setStatus(null);
  }

  return (
    <div className="space-y-3 rounded-xl border border-black/10 bg-white/40 p-4 dark:border-white/10 dark:bg-white/[0.02]">
      <div className="flex items-center gap-2">
        <UserRoundPlus className="size-4 opacity-70" />
        <h3 className="text-sm font-medium opacity-80">רישום פנים</h3>
      </div>

      {/* who are we enrolling — a resident, or a building worker */}
      <div className="flex rounded-lg border border-black/10 p-0.5 dark:border-white/10">
        {(["resident", "staff"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => switchMode(m)}
            disabled={enrolling}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50",
              mode === m
                ? "bg-foreground/10"
                : "opacity-60 hover:opacity-100"
            )}
          >
            {m === "resident" ? "דייר" : "עובד בניין"}
          </button>
        ))}
      </div>

      {mode === "resident" ? (
        <div className="relative">
          <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 opacity-40" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (selected) setSelected(null);
            }}
            placeholder="חיפוש דייר לפי שם או מספר דירה…"
            className="pr-9"
            disabled={enrolling}
          />
          {selected && (
            <button
              type="button"
              onClick={clearSelection}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded p-1 opacity-50 hover:opacity-100"
              aria-label="נקה בחירה"
            >
              <X className="size-4" />
            </button>
          )}
          {results.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-black/10 bg-white shadow-lg dark:border-white/10 dark:bg-zinc-900">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => pick(r)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-right text-sm hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <span>
                      {r.first_name} {r.last_name}
                    </span>
                    <span className="text-xs opacity-50">דירה {r.apartment_number}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <Input
          value={staffName}
          onChange={(e) => setStaffName(e.target.value)}
          placeholder="שם העובד (למשל: ניקיון, אחזקה)…"
          disabled={enrolling}
        />
      )}

      <Button
        type="button"
        onClick={enroll}
        disabled={!canEnroll}
        className="w-full"
      >
        {enrolling ? "ממתין לזיהוי…" : "רשום פנים"}
      </Button>

      {enrolling && (
        <div className="space-y-1 text-center text-sm font-medium text-emerald-600 dark:text-emerald-400">
          <p>
            {awaiting?.name}, גש/י אל מצלמת הלובי והבט/י אליה 🚶
          </p>
          <p className="text-xs font-normal opacity-80">
            הצילום יתחיל אוטומטית כשתזוהה/י (צליל עולה 🔊), הסתובב/י מעט, וצליל
            נוסף כשיסתיים.
          </p>
        </div>
      )}

      {status && !enrolling && (
        <p
          className={cn(
            "flex items-center gap-1.5 text-sm",
            status.ok
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          )}
        >
          {status.ok ? <CheckCircle2 className="size-4" /> : <ShieldAlert className="size-4" />}
          {status.msg}
        </p>
      )}

      {!sentryUp && (
        <p className="text-xs opacity-50">לא ניתן לרשום פנים בזמן שהשירות כבוי.</p>
      )}
    </div>
  );
}

// --- enrolled list ---------------------------------------------------------
function EnrolledList({
  data,
  onChanged,
}: {
  data: FaceConsole;
  onChanged: () => void;
}) {
  const { faces, orphanLabels } = data;
  const total = faces.length + orphanLabels.length;

  if (total === 0) {
    return (
      <p className="rounded-lg border border-black/10 px-4 py-6 text-center text-sm opacity-60 dark:border-white/10">
        אין פנים רשומות עדיין.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium opacity-80">
        פנים רשומות ({faces.length})
      </h3>
      <div className="overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-black/5 dark:divide-white/5">
            {faces.map((f) => (
              <FaceRow key={f.residentId} face={f} onChanged={onChanged} />
            ))}
            {orphanLabels.map((label) => (
              <OrphanRow key={label} label={label} onChanged={onChanged} />
            ))}
          </tbody>
        </table>
      </div>
      {orphanLabels.length > 0 && (
        <p className="text-xs opacity-50">
          רישומים בכתום אינם משויכים לדייר (למשל רישום בדיקה ישן) — ניתן למחוק
          אותם.
        </p>
      )}
    </div>
  );
}

function FaceRow({
  face,
  onChanged,
}: {
  face: EnrolledFace;
  onChanged: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);

  async function forget() {
    setPending(true);
    await forgetEnrolledFace(face.label);
    setConfirm(false);
    setPending(false);
    onChanged();
  }

  const where =
    face.kind === "staff"
      ? "עובד בניין"
      : face.apartment
        ? `דירה ${face.apartment}`
        : "ללא דירה";

  return (
    <tr className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="font-medium">{face.name || "—"}</span>
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
              face.kind === "staff"
                ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                : "bg-violet-500/15 text-violet-700 dark:text-violet-300"
            )}
          >
            {face.kind === "staff" ? "עובד" : "דייר"}
          </span>
        </div>
        <div className="text-xs opacity-50">
          {where}
          {face.enrolledBy ? ` · נרשם ע״י ${face.enrolledBy}` : ""}
        </div>
      </td>
      <td className="px-4 py-2.5">
        {face.inModel ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-3.5" /> פעיל
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
            <ShieldAlert className="size-3.5" /> חסר במודל
          </span>
        )}
      </td>
      <td className="px-4 py-2.5 text-left">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setConfirm(true)}
          aria-label="מחק רישום פנים"
          className="text-red-600/70 hover:bg-red-50 hover:text-red-700 dark:text-red-400/70 dark:hover:bg-red-950/30 dark:hover:text-red-300"
        >
          <Trash2 size={14} />
        </Button>
        <ConfirmDialog
          open={confirm}
          onClose={() => {
            if (!pending) setConfirm(false);
          }}
          onConfirm={forget}
          title={`למחוק את רישום הפנים של ${face.name}?`}
          description="הפנים יוסרו מהמערכת. ניתן לרשום מחדש בכל עת."
          confirmLabel="מחק"
          pendingLabel="מוחק…"
          pending={pending}
        />
      </td>
    </tr>
  );
}

function OrphanRow({
  label,
  onChanged,
}: {
  label: string;
  onChanged: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);

  async function forget() {
    setPending(true);
    await forgetEnrolledFace(label);
    setConfirm(false);
    setPending(false);
    onChanged();
  }

  return (
    <tr className="bg-amber-500/[0.04] hover:bg-amber-500/[0.08]">
      <td className="px-4 py-2.5">
        <div className="font-medium text-amber-700 dark:text-amber-300">{label}</div>
        <div className="text-xs opacity-50">לא משויך לדייר</div>
      </td>
      <td className="px-4 py-2.5">
        <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
          <ShieldAlert className="size-3.5" /> יתום
        </span>
      </td>
      <td className="px-4 py-2.5 text-left">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setConfirm(true)}
          aria-label="מחק רישום יתום"
          className="text-red-600/70 hover:bg-red-50 hover:text-red-700 dark:text-red-400/70 dark:hover:bg-red-950/30 dark:hover:text-red-300"
        >
          <Trash2 size={14} />
        </Button>
        <ConfirmDialog
          open={confirm}
          onClose={() => {
            if (!pending) setConfirm(false);
          }}
          onConfirm={forget}
          title={`למחוק את הרישום "${label}"?`}
          description="רישום זה אינו משויך לאף דייר."
          confirmLabel="מחק"
          pendingLabel="מוחק…"
          pending={pending}
        />
      </td>
    </tr>
  );
}
