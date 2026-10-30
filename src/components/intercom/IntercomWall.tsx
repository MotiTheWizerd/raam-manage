"use client";

import { KeyRound, Loader2 } from "lucide-react";
import { useState } from "react";
import { openIntercomDoor } from "@/app/intercom/actions";
import { CameraTile } from "@/components/camera/CameraTile";
import { cn } from "@/lib/cn";

// A live card per door panel, in the tablet's 3×2 grid order.
export function IntercomWall({ panels }: { panels: { camId: string; name: string }[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {panels.map((p) => (
        <div key={p.camId} className="aspect-[16/10]">
          <CameraTile
            camId={p.camId}
            title={p.name}
            footer={<DoorKey camId={p.camId} />}
            detectLite
          />
        </div>
      ))}
    </div>
  );
}

type KeyState = { status: "idle" | "busy" | "ok" | "error"; error?: string };

// The tablet's key button: one press = one momentary unlock of that panel's door.
function DoorKey({ camId }: { camId: string }) {
  const [state, setState] = useState<KeyState>({ status: "idle" });

  const open = async () => {
    if (state.status === "busy") return;
    setState({ status: "busy" });
    const res = await openIntercomDoor(camId).catch(() => ({ ok: false, error: "תקלת תקשורת" }));
    setState(res.ok ? { status: "ok" } : { status: "error", error: res.error });
    setTimeout(() => setState({ status: "idle" }), 3000);
  };

  return (
    <div className="flex items-center justify-center gap-3 bg-zinc-900 px-3 py-2">
      <button
        type="button"
        onClick={open}
        disabled={state.status === "busy"}
        aria-label="פתח דלת"
        title="פתח דלת"
        className={cn(
          "flex size-11 items-center justify-center rounded-full text-white shadow transition",
          state.status === "ok"
            ? "bg-emerald-500"
            : state.status === "error"
              ? "bg-red-600"
              : "bg-sky-500 hover:bg-sky-400 active:scale-95"
        )}
      >
        {state.status === "busy" ? (
          <Loader2 className="size-5 animate-spin" />
        ) : (
          <KeyRound className="size-5" />
        )}
      </button>
      {state.status === "ok" && <span className="text-sm text-emerald-400">הדלת נפתחה</span>}
      {state.status === "error" && (
        <span className="text-sm text-red-400">{state.error ?? "פתיחת הדלת נכשלה"}</span>
      )}
    </div>
  );
}
