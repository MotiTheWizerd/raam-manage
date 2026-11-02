"use client";

import { useEffect, useState } from "react";

// A thin row under the header for live building info. Shows nothing until
// there is something to say. Today: the supplier-yard boom gate left open
// (see lib/supplier-gate.ts — camera 114 watches it).

const POLL_MS = 3000;

type Gate = { open: boolean; since: number | null };

const clock = new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit" });

function openFor(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${sec} שנ׳`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} דק׳`;
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")} שע׳`;
}

export function HeaderInfoRow() {
  const [gate, setGate] = useState<Gate | null>(null);
  const [offset, setOffset] = useState(0); // server clock − this screen's clock
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch("/api/supplier-gate", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as Gate & { now: number };
        if (!alive) return;
        setOffset(data.now - Date.now());
        setGate({ open: data.open, since: data.since });
      } catch {
        /* keep the last state */
      }
    };
    void poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const open = gate?.open && gate.since !== null;
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open]);

  if (!open || gate?.since == null) return null;

  return (
    <div className="flex h-8 shrink-0 items-center gap-2.5 border-b border-amber-500/20 bg-amber-500/[0.06] px-4 text-sm">
      <span className="relative flex size-2.5 shrink-0" aria-hidden="true">
        <span className="absolute inset-0 rounded-full bg-amber-500 animate-[ping_2.6s_cubic-bezier(0,0,0.2,1)_infinite] opacity-60" />
        <span className="relative size-2.5 rounded-full bg-amber-500 animate-[pulse_2.6s_ease-in-out_infinite]" />
      </span>
      <span className="text-amber-800 dark:text-amber-200">
        רחבת ספקים פתוחה מהשעה{" "}
        <span className="font-semibold tabular-nums">{clock.format(gate.since)}</span>
        <span className="mx-2 opacity-40">·</span>
        במשך <span className="font-semibold tabular-nums">{openFor(now + offset - gate.since)}</span>
      </span>
    </div>
  );
}
