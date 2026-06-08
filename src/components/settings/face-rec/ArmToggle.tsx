"use client";

import { ShieldAlert, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { setFaceArmed } from "@/app/settings/face-actions";
import { cn } from "@/lib/cn";
import { useFaceConsole } from "./FaceConsoleProvider";

export function ArmToggle() {
  const { data, reload } = useFaceConsole();
  const [pending, setPending] = useState(false);

  if (!data) return null;
  const { armed, sentryUp } = data;

  async function toggle() {
    if (!sentryUp) return;
    setPending(true);
    await setFaceArmed(!armed);
    await reload();
    setPending(false);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending || !sentryUp}
      className={cn(
        "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50",
        armed
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-zinc-400/40 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300"
      )}
      title={armed ? "פתיחת דלת אוטומטית פעילה" : "פתיחת דלת אוטומטית מושבתת"}
    >
      {armed ? (
        <ShieldCheck className="size-4" />
      ) : (
        <ShieldAlert className="size-4" />
      )}
      {armed ? "פתיחה אוטומטית פעילה" : "פתיחה אוטומטית מושבתת"}
    </button>
  );
}
