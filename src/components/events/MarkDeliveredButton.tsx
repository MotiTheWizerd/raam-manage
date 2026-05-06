"use client";

import { useActionState, useEffect } from "react";
import {
  markPackageDelivered,
  type PackageFormState,
} from "@/app/events/packages-actions";
import { Button } from "@/components/ui/Button";
import { useFormToasts } from "@/lib/hooks/useFormToasts";

const initialState: PackageFormState = {};

type Props = {
  packageId: number;
  onSuccess: () => void;
};

export function MarkDeliveredButton({ packageId, onSuccess }: Props) {
  const [state, action, pending] = useActionState(
    markPackageDelivered,
    initialState
  );

  useFormToasts(state, "החבילה נמסרה");

  useEffect(() => {
    if (!state.submittedAt) return;
    Promise.resolve().then(onSuccess);
  }, [state.submittedAt, onSuccess]);

  return (
    <form action={action}>
      <input type="hidden" name="id" value={packageId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "שומר..." : "סמן נמסרה"}
      </Button>
    </form>
  );
}
