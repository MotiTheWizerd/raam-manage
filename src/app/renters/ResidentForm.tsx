"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { PhoneFields, type PhoneInit } from "./PhoneFields";
import type { ResidentFormState } from "./actions";

export type ApartmentOption = {
  id: number;
  number: string;
  zone_name: string | null;
};

export type ResidentFormValues = {
  first_name?: string;
  last_name?: string;
  apartment_id?: string;
  type?: "owner" | "renter";
  id_number?: string;
  po_box?: string;
  notes?: string;
};

type Props = {
  apartments: ApartmentOption[];
  initialValues?: ResidentFormValues;
  initialPhones?: PhoneInit[];
  hiddenIdValue?: number;
  action: (
    prev: ResidentFormState,
    formData: FormData
  ) => Promise<ResidentFormState>;
  onCancel: () => void;
  onSuccess?: () => void;
  submitLabel?: string;
};

const initialState: ResidentFormState = {};

export function ResidentForm({
  apartments,
  initialValues,
  initialPhones,
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

  const aptOptions = apartments.map((a) => ({
    value: String(a.id),
    label: a.zone_name ? `${a.number} — ${a.zone_name}` : a.number,
  }));

  return (
    <form action={formAction} className="space-y-4">
      {hiddenIdValue !== undefined && (
        <input type="hidden" name="id" value={hiddenIdValue} />
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="שם פרטי" htmlFor="r-first" required>
          <Input
            id="r-first"
            name="first_name"
            required
            autoFocus
            defaultValue={initialValues?.first_name ?? ""}
          />
        </Field>
        <Field label="שם משפחה" htmlFor="r-last" required>
          <Input
            id="r-last"
            name="last_name"
            required
            defaultValue={initialValues?.last_name ?? ""}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="דירה" htmlFor="r-apt" required>
          <Dropdown
            id="r-apt"
            name="apartment_id"
            placeholder="— בחר דירה —"
            defaultValue={initialValues?.apartment_id ?? ""}
            options={aptOptions}
          />
        </Field>
        <Field label="סוג" htmlFor="r-type" required>
          <Dropdown
            id="r-type"
            name="type"
            defaultValue={initialValues?.type ?? "owner"}
            options={[
              { value: "owner", label: "בעלים" },
              { value: "renter", label: "שוכר" },
            ]}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label='ת"ז' htmlFor="r-id">
          <Input
            id="r-id"
            name="id_number"
            placeholder="123456789"
            defaultValue={initialValues?.id_number ?? ""}
          />
        </Field>
        <Field label="תיבת דואר" htmlFor="r-pobox">
          <Input
            id="r-pobox"
            name="po_box"
            defaultValue={initialValues?.po_box ?? ""}
          />
        </Field>
      </div>

      <PhoneFields initial={initialPhones} />

      <Field label="הערות" htmlFor="r-notes">
        <Textarea
          id="r-notes"
          name="notes"
          rows={2}
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
