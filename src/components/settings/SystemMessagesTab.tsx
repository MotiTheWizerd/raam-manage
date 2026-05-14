"use client";

import { useEffect, useState } from "react";
import {
  getAllSystemMessages,
  type SystemMessageRow,
} from "@/app/settings/actions";
import { useIsManager } from "@/components/AuthProvider";
import { cn } from "@/lib/cn";
import { onSystemMessagesChanged } from "@/lib/system-messages-events";
import { AddSystemMessageButton } from "./AddSystemMessageButton";
import { DeleteSystemMessageButton } from "./DeleteSystemMessageButton";
import { EditSystemMessageButton } from "./EditSystemMessageButton";

const PRIORITY_LABEL: Record<SystemMessageRow["priority"], string> = {
  low: "נמוכה",
  med: "בינונית",
  high: "גבוהה",
};

const PRIORITY_BADGE: Record<SystemMessageRow["priority"], string> = {
  high: "bg-red-500/10 text-red-700 dark:text-red-300",
  med: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  low: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
};

function formatLocalNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function statusFor(m: SystemMessageRow): {
  label: string;
  className: string;
} {
  const now = formatLocalNow();
  if (now < m.start_at) {
    return {
      label: "מתוזמנת",
      className: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
    };
  }
  if (now > m.end_at) {
    return {
      label: "פגה",
      className: "bg-zinc-500/10 text-zinc-500 dark:text-zinc-500",
    };
  }
  return {
    label: "פעילה",
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  };
}

function formatRange(iso: string): string {
  // Stored as "YYYY-MM-DDTHH:MM" wall-clock.
  const [date, time] = iso.split("T");
  if (!date || !time) return iso;
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y} ${time}`;
}

export function SystemMessagesTab() {
  const isManager = useIsManager();
  const [messages, setMessages] = useState<SystemMessageRow[] | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let active = true;
    getAllSystemMessages().then((rows) => {
      if (active) setMessages(rows);
    });
    return () => {
      active = false;
    };
  }, [refreshTick]);

  // Refresh after CRUD via the broadcast, plus on focus and on a tick.
  useEffect(() => {
    const bump = () => setRefreshTick((t) => t + 1);
    window.addEventListener("focus", bump);
    const unsubscribe = onSystemMessagesChanged(bump);
    return () => {
      window.removeEventListener("focus", bump);
      unsubscribe();
    };
  }, []);

  // Tick on a short interval too, so opening another tab and coming back
  // (or auto-expiry) reflects.
  useEffect(() => {
    const id = setInterval(() => setRefreshTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  if (messages === null) {
    return <div className="text-sm opacity-60 py-8 text-center">טוען...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium opacity-80">
          {messages.length === 0 ? "אין הודעות" : `${messages.length} הודעות`}
        </h2>
        {isManager && <AddSystemMessageButton />}
      </div>

      {messages.length === 0 ? (
        <div className="rounded-lg border border-dashed border-black/10 dark:border-white/10 p-8 text-center text-sm opacity-60">
          אין הודעות מערכת. צור את ההודעה הראשונה.
        </div>
      ) : (
        <div className="rounded-lg border border-black/10 dark:border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.02] dark:bg-white/[0.03] text-xs uppercase tracking-wide">
              <tr className="border-b border-black/10 dark:border-white/10 opacity-70">
                <th className="px-4 py-2.5 font-medium text-start">כותרת</th>
                <th className="px-4 py-2.5 font-medium text-start">טווח</th>
                <th className="px-4 py-2.5 font-medium text-start">עדיפות</th>
                <th className="px-4 py-2.5 font-medium text-start">סטטוס</th>
                <th className="px-4 py-2.5 font-medium text-start"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 dark:divide-white/5">
              {messages.map((m) => {
                const status = statusFor(m);
                return (
                  <tr
                    key={m.id}
                    className="hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{m.title}</div>
                      <div className="text-xs opacity-60 truncate max-w-md">
                        {m.body}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs opacity-80">
                      <div>{formatRange(m.start_at)}</div>
                      <div className="opacity-70">{formatRange(m.end_at)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          PRIORITY_BADGE[m.priority]
                        )}
                      >
                        {PRIORITY_LABEL[m.priority]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          status.className
                        )}
                      >
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-end">
                      {isManager && (
                        <div className="flex items-center justify-end gap-1">
                          <EditSystemMessageButton message={m} />
                          <DeleteSystemMessageButton messageId={m.id} />
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
