"use client";

import { useEffect } from "react";
import { toast } from "sonner";

type FormState = {
  error?: string;
  errorAt?: number;
  submittedAt?: number;
};

export function useFormToasts(
  state: FormState,
  successMessage: string = "נשמר בהצלחה"
) {
  useEffect(() => {
    if (state.errorAt && state.error) toast.error(state.error);
  }, [state.errorAt, state.error]);

  useEffect(() => {
    if (state.submittedAt) toast.success(successMessage);
  }, [state.submittedAt, successMessage]);
}
