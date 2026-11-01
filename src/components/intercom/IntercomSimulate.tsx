"use client";

import { FlaskConical, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { simulateIntercomCall } from "@/app/intercom/actions";
import { cn } from "@/lib/cn";

const FIELD =
  "h-9 rounded-lg border border-zinc-300 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";

// Testing aid (for while we test): plays a call from the chosen door, so the
// call popup and the openings list can be checked at night, when nobody rings.
// "No answer" leaves time to press the popup's 🔑 — open + hang up, as the
// lobby does — which ends the played call (the door itself really opens).
export function IntercomSimulate({ panels }: { panels: { camId: string; name: string }[] }) {
  const router = useRouter();
  const [camId, setCamId] = useState(panels[0]?.camId ?? "");
  const [answered, setAnswered] = useState(true);
  const [state, setState] = useState<{ status: "idle" | "busy" | "sent" | "error"; error?: string }>({
    status: "idle",
  });

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

  return (
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
  );
}
