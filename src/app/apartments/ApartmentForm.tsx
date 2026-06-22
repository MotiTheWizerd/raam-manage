"use client";

import { MessageSquare, PhoneCall, PhoneOff } from "lucide-react";
import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { type CallPolicy } from "@/lib/call-policy";
import { cn } from "@/lib/cn";
import { useFormToasts } from "@/lib/hooks/useFormToasts";
import { AssetsFields, type AssetInit } from "./AssetsFields";
import { KeysFields, type KeyInit } from "./KeysFields";
import { VehiclesFields, type VehicleInit } from "./VehiclesFields";
import type { ApartmentFormState } from "./actions";

export type Zone = { id: number; name: string };

export type ApartmentFormValues = {
  number?: string;
  floor?: string;
  zone_id?: string;
  notes?: string;
  call_policy?: CallPolicy;
};

// The three contact policies, ascending in urgency. The peer-checked classes
// are literal strings so Tailwind keeps them in the build.
const CALL_POLICY_OPTIONS: {
  value: CallPolicy;
  label: string;
  Icon: typeof PhoneCall;
  checkedClass: string;
}[] = [
  {
    value: "none",
    label: "אין צורך להתקשר/לעדכן",
    Icon: PhoneOff,
    checkedClass:
      "peer-checked:border-zinc-400 peer-checked:bg-zinc-500/10 peer-checked:opacity-100 dark:peer-checked:border-zinc-500",
  },
  {
    value: "message",
    label: "לעדכן רק בהודעה",
    Icon: MessageSquare,
    checkedClass:
      "peer-checked:border-sky-500/60 peer-checked:bg-sky-500/10 peer-checked:opacity-100 peer-checked:text-sky-800 dark:peer-checked:text-sky-200",
  },
  {
    value: "call",
    label: "חייבים להתקשר",
    Icon: PhoneCall,
    checkedClass:
      "peer-checked:border-red-500/60 peer-checked:bg-red-500/10 peer-checked:opacity-100 peer-checked:text-red-800 dark:peer-checked:text-red-200",
  },
];

type Props = {
  zones: Zone[];
  initialValues?: ApartmentFormValues;
  initialParking?: AssetInit[];
  initialStorage?: AssetInit[];
  initialKeys?: KeyInit[];
  initialKeysComment?: string | null;
  initialVehicles?: VehicleInit[];
  hiddenIdValue?: number;
  action: (
    prev: ApartmentFormState,
    formData: FormData
  ) => Promise<ApartmentFormState>;
  onCancel?: () => void;
  onSuccess?: () => void;
  submitLabel?: string;
};

const initialState: ApartmentFormState = {};

export function ApartmentForm({
  zones,
  initialValues,
  initialParking,
  initialStorage,
  initialKeys,
  initialKeysComment,
  initialVehicles,
  hiddenIdValue,
  action,
  onCancel,
  onSuccess,
  submitLabel = "שמור",
}: Props) {
  const [state, formAction, pending] = useActionState(action, initialState);

  useFormToasts(state);

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
            dir="ltr"
            className="text-end"
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
      <KeysFields initial={initialKeys} initialComment={initialKeysComment} />
      <VehiclesFields initial={initialVehicles} />

      <Field label="הערות" htmlFor="apt-notes">
        <Textarea
          id="apt-notes"
          name="notes"
          rows={2}
          placeholder="פרטים נוספים על הדירה"
          defaultValue={initialValues?.notes ?? ""}
        />
      </Field>

      <fieldset className="space-y-2 rounded-lg border border-black/10 dark:border-white/10 p-3">
        <legend className="px-1 text-sm font-semibold">יצירת קשר עם הדייר</legend>
        <p className="-mt-1 px-1 text-xs opacity-70">
          מה לעשות לפני שמעלים שליח או אורח לדירה
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {CALL_POLICY_OPTIONS.map((opt) => {
            const Icon = opt.Icon;
            return (
              <label key={opt.value} className="cursor-pointer">
                <input
                  type="radio"
                  name="call_policy"
                  value={opt.value}
                  defaultChecked={
                    (initialValues?.call_policy ?? "none") === opt.value
                  }
                  className="peer sr-only"
                />
                <div
                  className={cn(
                    "flex h-full items-center gap-2 rounded-lg border p-2.5 text-sm transition-colors",
                    "border-black/10 opacity-70 dark:border-white/10",
                    "peer-focus-visible:ring-2 peer-focus-visible:ring-red-500/40",
                    opt.checkedClass
                  )}
                >
                  <Icon size={16} className="shrink-0" aria-hidden="true" />
                  <span className="font-medium">{opt.label}</span>
                </div>
              </label>
            );
          })}
        </div>
      </fieldset>

      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            ביטול
          </Button>
        )}
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "שומר..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
