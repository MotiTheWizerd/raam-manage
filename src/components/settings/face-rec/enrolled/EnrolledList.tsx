"use client";

import { useFaceConsole } from "../FaceConsoleProvider";
import { EnrolledFaceRow } from "./EnrolledFaceRow";
import { OrphanFaceRow } from "./OrphanFaceRow";

export function EnrolledList() {
  const { data } = useFaceConsole();
  if (!data) return null;

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
              <EnrolledFaceRow key={f.label} face={f} />
            ))}
            {orphanLabels.map((label) => (
              <OrphanFaceRow key={label} label={label} />
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
