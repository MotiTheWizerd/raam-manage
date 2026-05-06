"use client";

import { Plus } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  createPackage,
  type PackageFormState,
} from "@/app/events/packages-actions";
import type { ApartmentResidentOption } from "@/app/events/actions";
import { Modal } from "@/components/Modal";
import { useActiveLobbyist } from "@/components/PreferencesProvider";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useFormToasts } from "@/lib/hooks/useFormToasts";

const initialState: PackageFormState = {};

const OTHER_VALUE = "__other__";

type Props = {
  defaultResidentId: number;
  residents: ApartmentResidentOption[];
  onCreated: () => void;
};

export function AddPackageButton({
  defaultResidentId,
  residents,
  onCreated,
}: Props) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createPackage, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const activeLobbyist = useActiveLobbyist();

  const [recipientChoice, setRecipientChoice] = useState<string>(
    String(defaultResidentId)
  );

  useFormToasts(state, "החבילה נשמרה");

  useEffect(() => {
    if (!state.submittedAt) return;
    formRef.current?.reset();
    Promise.resolve().then(() => {
      onCreated();
      setOpen(false);
    });
  }, [state.submittedAt, onCreated]);

  function handleOpen() {
    setRecipientChoice(String(defaultResidentId));
    setOpen(true);
  }

  const isOther = recipientChoice === OTHER_VALUE;
  const residentIdValue = isOther ? "" : recipientChoice;

  const recipientOptions = [
    ...residents.map((r) => ({
      value: String(r.id),
      label: r.full_name,
    })),
    { value: OTHER_VALUE, label: "אחר (טקסט חופשי)" },
  ];

  return (
    <>
      <Button onClick={handleOpen} size="sm">
        <Plus size={16} />
        חבילה חדשה
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="חבילה חדשה"
        size="md"
      >
        {open && (
          <form ref={formRef} action={action} className="space-y-4">
            <input type="hidden" name="resident_id" value={residentIdValue} />

            <Field label="מקבל" htmlFor="package-recipient" required>
              <Dropdown
                id="package-recipient"
                value={recipientChoice}
                onChange={setRecipientChoice}
                options={recipientOptions}
              />
            </Field>

            {isOther && (
              <Field label="שם מקבל" htmlFor="package-recipient-name" required>
                <Input
                  id="package-recipient-name"
                  name="recipient_name"
                  required
                  autoFocus
                  placeholder="לבניין / ספק / וכו׳"
                />
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="סוג" htmlFor="package-type" required>
                <Dropdown
                  id="package-type"
                  name="type"
                  defaultValue="package"
                  options={[
                    { value: "package", label: "חבילה" },
                    { value: "envelope", label: "מעטפה" },
                    { value: "laundry", label: "כביסה" },
                  ]}
                />
              </Field>
              <Field label="כיוון" htmlFor="package-direction" required>
                <Dropdown
                  id="package-direction"
                  name="direction"
                  defaultValue="in"
                  options={[
                    { value: "in", label: "נכנסת" },
                    { value: "out", label: "יוצאת" },
                  ]}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="נמסרה ע״י" htmlFor="package-delivered-by">
                <Input
                  id="package-delivered-by"
                  name="delivered_by"
                  defaultValue="שליח"
                  placeholder="שליח / דואר ישראל / חבר"
                />
              </Field>
              <Field label="התקבלה ע״י" htmlFor="package-received-by" required>
                <Input
                  id="package-received-by"
                  name="received_by"
                  required
                  defaultValue={activeLobbyist?.lobbyist_name ?? ""}
                  placeholder="שם הסדרן"
                />
              </Field>
            </div>

            <Field label="הערה" htmlFor="package-comment">
              <Textarea
                id="package-comment"
                name="comment"
                rows={2}
                placeholder="פרטים נוספים (אופציונלי)"
              />
            </Field>

            {state.error && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {state.error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                ביטול
              </Button>
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "שומר..." : "שמור"}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
