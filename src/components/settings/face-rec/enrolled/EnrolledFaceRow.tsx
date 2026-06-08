"use client";

import { CheckCircle2, ShieldAlert } from "lucide-react";
import { type EnrolledFace } from "@/app/settings/face-actions";
import { cn } from "@/lib/cn";
import { DeleteFaceCell } from "./DeleteFaceCell";
import { useForgetFace } from "./useForgetFace";

export function EnrolledFaceRow({ face }: { face: EnrolledFace }) {
  const { confirm, setConfirm, pending, forget } = useForgetFace(face.label);

  const where =
    face.kind === "staff"
      ? "עובד בניין"
      : face.apartment
        ? `דירה ${face.apartment}`
        : "ללא דירה";

  return (
    <tr className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="font-medium">{face.name || "—"}</span>
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
              face.kind === "staff"
                ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                : "bg-violet-500/15 text-violet-700 dark:text-violet-300"
            )}
          >
            {face.kind === "staff" ? "עובד" : "דייר"}
          </span>
        </div>
        <div className="text-xs opacity-50">
          {where}
          {face.enrolledBy ? ` · נרשם ע״י ${face.enrolledBy}` : ""}
        </div>
      </td>
      <td className="px-4 py-2.5">
        {face.inModel ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-3.5" /> פעיל
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
            <ShieldAlert className="size-3.5" /> חסר במודל
          </span>
        )}
      </td>
      <DeleteFaceCell
        confirm={confirm}
        pending={pending}
        onOpen={() => setConfirm(true)}
        onClose={() => setConfirm(false)}
        onConfirm={forget}
        buttonLabel="מחק רישום פנים"
        title={`למחוק את רישום הפנים של ${face.name}?`}
        description="הפנים יוסרו מהמערכת. ניתן לרשום מחדש בכל עת."
      />
    </tr>
  );
}
