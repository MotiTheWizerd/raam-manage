"use client";

import { ShieldAlert } from "lucide-react";
import { DeleteFaceCell } from "./DeleteFaceCell";
import { useForgetFace } from "./useForgetFace";

export function OrphanFaceRow({ label }: { label: string }) {
  const { confirm, setConfirm, pending, forget } = useForgetFace(label);

  return (
    <tr className="bg-amber-500/[0.04] hover:bg-amber-500/[0.08]">
      <td className="px-4 py-2.5">
        <div className="font-medium text-amber-700 dark:text-amber-300">
          {label}
        </div>
        <div className="text-xs opacity-50">לא משויך לדייר</div>
      </td>
      <td className="px-4 py-2.5">
        <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
          <ShieldAlert className="size-3.5" /> יתום
        </span>
      </td>
      <DeleteFaceCell
        confirm={confirm}
        pending={pending}
        onOpen={() => setConfirm(true)}
        onClose={() => setConfirm(false)}
        onConfirm={forget}
        buttonLabel="מחק רישום יתום"
        title={`למחוק את הרישום "${label}"?`}
        description="רישום זה אינו משויך לאף דייר."
      />
    </tr>
  );
}
