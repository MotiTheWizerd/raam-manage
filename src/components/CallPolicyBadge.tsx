"use client";

import { MessageSquare, PhoneCall, PhoneOff } from "lucide-react";
import { CALL_POLICY_SHORT, callPolicyFromCode } from "@/lib/call-policy";
import { cn } from "@/lib/cn";

const STYLE = {
  none: {
    Icon: PhoneOff,
    normal: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400",
  },
  call: {
    Icon: PhoneCall,
    normal: "bg-red-500/15 text-red-700 dark:text-red-300",
  },
  message: {
    Icon: MessageSquare,
    normal: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  },
} as const;

// A small pill that flags an apartment's contact policy next to a resident's
// name — including "אין צורך" for the "none" policy (lobby staff asked for the
// explicit all-clear, not just the call/message states). `active` is the
// highlighted (red-background) state used by the search dropdown's selected row.
export function CallPolicyBadge({
  code,
  active = false,
  className,
}: {
  code: number | null | undefined;
  active?: boolean;
  className?: string;
}) {
  const policy = callPolicyFromCode(code);
  const { Icon, normal } = STYLE[policy];

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
        active ? "bg-white/25 text-white" : normal,
        className
      )}
    >
      <Icon size={11} aria-hidden="true" />
      {CALL_POLICY_SHORT[policy]}
    </span>
  );
}
