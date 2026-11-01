"use client";

import { FlaskConical, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { setIntercomAutoOpen, simulateIntercomCall } from "@/app/intercom/actions";
import { cn } from "@/lib/cn";
import type { AutoOpen } from "@/lib/intercom-calls";

const FIELD =
  "h-9 rounded-lg border border-zinc-300 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";

const hhmm = new Intl.DateTimeFormat("he-IL", {
  timeZone: "Asia/Jerusalem",
  hour: "2-digit",
  minute: "2-digit",
});

// Testing aid (for while we test): plays a call from the chosen door, so the
// call popup and the openings list can be checked at night, when nobody rings.
// "No answer" leaves time to press the popup's 🔑 — open + hang up, as the
// lobby does — which ends the played call (the door itself really opens).
// Below it, פתיחה אוטומטית: the server opens and hangs up every real call by
// itself, to test the whole pipeline from the door (it turns itself off).
export function IntercomSimulate({
  panels,
  autoOpen,
}: {
  panels: { camId: string; name: string }[];
  autoOpen: AutoOpen | null;
}) {
  const router = useRouter();
  const [camId, setCamId] = useState(panels[0]?.camId ?? "");
  const [answered, setAnswered] = useState(true);
  const [state, setState] = useState<{ status: "idle" | "busy" | "sent" | "error"; error?: string }>({
    status: "idle",
  });
  const [auto, setAuto] = useState(autoOpen);

  // The server switches it off at `until`; follow along.
  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => setAuto(null), Math.max(0, auto.until - Date.now()));
    return () => clearTimeout(t);
  }, [auto]);

  const run = async () => {
    if (state.status === "busy") return;
    setState({ status: "busy" });
    const res = await simulateIntercomCall(camId, answered).catch(() => ({
      ok: false,
      error: "תקלת תקשורת",
    }));
    setState(res.ok ? { status: "sent" } : { status: "error", error: res.error });
    setTimeout(() => setState({ status: "idle" }), 3000);
    // The opening lands in the list ~8s in (ring, then the tablet opens).
    if (res.ok && answered) setTimeout(() => router.refresh(), 11000);
  };

  const toggleAuto = async (on: boolean) => {
    const res = await setIntercomAutoOpen(on).catch(() => null);
    if (res) setAuto(res.autoOpen);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={camId}
          onChange={(e) => setCamId(e.target.value)}
          aria-label="דלת לסימולציה"
          className={FIELD}
        >
          {panels.map((p) => (
            <option key={p.camId} value={p.camId}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          value={answered ? "open" : "missed"}
          onChange={(e) => setAnswered(e.target.value === "open")}
          aria-label="איך השיחה נגמרת"
          className={FIELD}
        >
          <option value="open">הטאבלט פותח ומנתק</option>
          <option value="missed">בלי מענה (30 שנ׳)</option>
        </select>
        <button
          type="button"
          onClick={run}
          disabled={state.status === "busy"}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-white transition",
            state.status === "error" ? "bg-red-600" : "bg-amber-500 hover:bg-amber-400 active:scale-95"
          )}
        >
          {state.status === "busy" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <FlaskConical className="size-4" />
          )}
          סימולציית שיחה
        </button>
        {state.status === "sent" && <span className="text-sm text-amber-500">מצלצל…</span>}
        {state.status === "error" && (
          <span className="text-sm text-red-500">{state.error ?? "הסימולציה נכשלה"}</span>
        )}
      </div>

      <label className="flex flex-wrap items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={!!auto}
          onChange={(e) => toggleAuto(e.target.checked)}
          className="size-4 accent-red-600"
        />
        <span className={cn("font-medium", auto && "text-red-500")}>פתיחה אוטומטית</span>
        <span className="opacity-60">
          {auto
            ? `פעיל — כל שיחה אמיתית: הדלת נפתחת אחרי 3 שנ׳ והשיחה מנותקת · נכבה לבד ב-${hhmm.format(auto.until)}`
            : "לבדיקה מהדלת: המערכת פותחת ומנתקת כל שיחה אמיתית לבד (נכבה לבד אחרי 20 דק׳)"}
        </span>
      </label>
    </div>
  );
}
