"use client";

import { CheckCircle2, ShieldAlert, UserRoundPlus } from "lucide-react";
import { useState } from "react";
import {
  enrollResidentFace,
  enrollStaffFace,
} from "@/app/settings/face-actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { useFaceConsole } from "../FaceConsoleProvider";
import { SegmentedToggle } from "../ui/SegmentedToggle";
import { ResidentPicker } from "./ResidentPicker";
import { useDeferredEnroll } from "./useDeferredEnroll";
import { useResidentSearch } from "./useResidentSearch";

type Mode = "resident" | "staff";

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: "resident", label: "דייר" },
  { value: "staff", label: "עובד בניין" },
];

export function EnrollPanel() {
  const { data, reload } = useFaceConsole();
  const sentryUp = !!data?.sentryUp;

  const [mode, setMode] = useState<Mode>("resident");
  const [staffName, setStaffName] = useState("");
  const search = useResidentSearch(mode === "resident");
  const { awaiting, status, enrolling, start, setStatus } =
    useDeferredEnroll(reload);

  const subjectName =
    mode === "resident" ? search.selected?.first_name ?? "" : staffName.trim();
  const canEnroll =
    sentryUp &&
    !enrolling &&
    (mode === "resident" ? !!search.selected : !!staffName.trim());

  async function enroll() {
    if (!canEnroll) return;
    setStatus(null);
    const res =
      mode === "resident"
        ? await enrollResidentFace(search.selected!.id)
        : await enrollStaffFace(staffName.trim());
    if (res.ok && res.label) {
      start({ label: res.label, name: subjectName || "הדייר" });
    } else {
      setStatus({ ok: false, msg: res.msg });
    }
  }

  function switchMode(next: Mode) {
    if (enrolling) return;
    setMode(next);
    setStatus(null);
  }

  function handlePick(r: Parameters<typeof search.pick>[0]) {
    search.pick(r);
    setStatus(null);
  }

  function handleClear() {
    search.clear();
    setStatus(null);
  }

  return (
    <div className="space-y-3 rounded-xl border border-black/10 bg-white/40 p-4 dark:border-white/10 dark:bg-white/[0.02]">
      <div className="flex items-center gap-2">
        <UserRoundPlus className="size-4 opacity-70" />
        <h3 className="text-sm font-medium opacity-80">רישום פנים</h3>
      </div>

      {/* who are we enrolling — a resident, or a building worker */}
      <SegmentedToggle
        options={MODE_OPTIONS}
        value={mode}
        onChange={switchMode}
        disabled={enrolling}
      />

      {mode === "resident" ? (
        <ResidentPicker
          query={search.query}
          results={search.results}
          selected={search.selected}
          disabled={enrolling}
          onQueryChange={search.onQueryChange}
          onPick={handlePick}
          onClear={handleClear}
        />
      ) : (
        <Input
          value={staffName}
          onChange={(e) => setStaffName(e.target.value)}
          placeholder="שם העובד (למשל: ניקיון, אחזקה)…"
          disabled={enrolling}
        />
      )}

      <Button type="button" onClick={enroll} disabled={!canEnroll} className="w-full">
        {enrolling ? "ממתין לזיהוי…" : "רשום פנים"}
      </Button>

      {enrolling && (
        <div className="space-y-1 text-center text-sm font-medium text-emerald-600 dark:text-emerald-400">
          <p>{awaiting?.name}, גש/י אל מצלמת הלובי והבט/י אליה 🚶</p>
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
          {status.ok ? (
            <CheckCircle2 className="size-4" />
          ) : (
            <ShieldAlert className="size-4" />
          )}
          {status.msg}
        </p>
      )}

      {!sentryUp && (
        <p className="text-xs opacity-50">
          לא ניתן לרשום פנים בזמן שהשירות כבוי.
        </p>
      )}
    </div>
  );
}
