"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { AssetsFields, type AssetInit } from "./AssetsFields";
import type { ApartmentFormState } from "./actions";

export type Zone = { id: number; name: string };

export type ApartmentFormValues = {
  number?: string;
  floor?: string;
  zone_id?: string;
  notes?: string;
};

type Props = {
  zones: Zone[];
  initialValues?: ApartmentFormValues;
  initialParking?: AssetInit[];
  initialStorage?: AssetInit[];
  hiddenIdValue?: number;
  action: (
    prev: ApartmentFormState,
    formData: FormData
  ) => Promise<ApartmentFormState>;
  onCancel: () => void;
  onSuccess?: () => void;
  submitLabel?: string;
};

const initialState: ApartmentFormState = {};

export function ApartmentForm({
  zones,
  initialValues,
  initialParking,
  initialStorage,
  hiddenIdValue,
  action,
  onCancel,
  onSuccess,
  submitLabel = "שמור",
}: Props) {
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (state.submittedAt) onSuccess?.();
  }, [state.submittedAt, onSuccess]);

  return (
    <form action={formAction} className="space-y-4">
      {hiddenIdValue !== undefined && (
        <input type="hidden" name="id" value={hiddenIdValue} />
      )}

      <Field label="מספר דירה" htmlFor="apt-number" required>
        <Input
          id="apt-number"
          name="number"
          required
          autoFocus
          placeholder="5א"
          defaultValue={initialValues?.number ?? ""}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="קומה" htmlFor="apt-floor">
          <Input
            id="apt-floor"
            name="floor"
            type="number"
            placeholder="5"
            defaultValue={initialValues?.floor ?? ""}
          />
        </Field>

        <Field label="אזור" htmlFor="apt-zone">
          <Dropdown
            id="apt-zone"
            name="zone_id"
            placeholder="— ללא —"
            defaultValue={initialValues?.zone_id ?? ""}
            options={[
              { value: "", label: "— ללא —" },
              ...zones.map((z) => ({ value: String(z.id), label: z.name })),
            ]}
          />
        </Field>
      </div>

      <AssetsFields kind="parking" initial={initialParking} />
      <AssetsFields kind="storage" initial={initialStorage} />

      <Field label="הערות" htmlFor="apt-notes">
        <Textarea
          id="apt-notes"
          name="notes"
          rows={2}
          placeholder="פרטים נוספים על הדירה"
          defaultValue={initialValues?.notes ?? ""}
        />
      </Field>

      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          ביטול
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "שומר..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
