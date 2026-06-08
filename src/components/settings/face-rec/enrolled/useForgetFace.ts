"use client";

import { useState } from "react";
import { forgetEnrolledFace } from "@/app/settings/face-actions";
import { useFaceConsole } from "../FaceConsoleProvider";

/**
 * Shared forget-with-confirmation flow for an enrolled face (or an orphan
 * label). Owns the confirm dialog + pending state and reloads the console
 * once the faceprint is removed.
 */
export function useForgetFace(label: string) {
  const { reload } = useFaceConsole();
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);

  async function forget() {
    setPending(true);
    await forgetEnrolledFace(label);
    setConfirm(false);
    setPending(false);
    await reload();
  }

  return { confirm, setConfirm, pending, forget };
}
