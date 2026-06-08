"use client";

import { ScanFace, ShieldAlert } from "lucide-react";
import { ArmToggle } from "./ArmToggle";
import { FaceConsoleProvider, useFaceConsole } from "./FaceConsoleProvider";
import { LiveCam } from "./LiveCam";
import { EnrollPanel } from "./enroll/EnrollPanel";
import { EnrolledList } from "./enrolled/EnrolledList";
import { FaceEventsLog } from "./log/FaceEventsLog";

export function FaceRecTab() {
  return (
    <FaceConsoleProvider>
      <FaceRecContent />
    </FaceConsoleProvider>
  );
}

function FaceRecContent() {
  const { data, loading } = useFaceConsole();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ScanFace className="size-5 opacity-70" />
          <h2 className="text-lg font-semibold">זיהוי פנים</h2>
        </div>
        {data && <ArmToggle />}
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
            <EnrollPanel />
          </div>

          <EnrolledList />

          <FaceEventsLog />
        </>
      )}
    </div>
  );
}
