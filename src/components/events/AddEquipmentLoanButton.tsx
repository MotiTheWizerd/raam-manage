"use client";

import { Plus } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  createEquipmentLoan,
  type EquipmentLoanFormState,
} from "@/app/events/equipment-actions";
import type { ApartmentResidentOption } from "@/app/events/actions";
import { Modal } from "@/components/Modal";
import { useActiveLobbyist } from "@/components/PreferencesProvider";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useFormToasts } from "@/lib/hooks/useFormToasts";

const initialState: EquipmentLoanFormState = {};

const OTHER_VALUE = "__other__";

type Props = {
  defaultResidentId: number;
  residents: ApartmentResidentOption[];
  onCreated: () => void;
};

export function AddEquipmentLoanButton({
  defaultResidentId,
  residents,
  onCreated,
}: Props) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    createEquipmentLoan,
    initialState
  );
  const formRef = useRef<HTMLFormElement>(null);
  const activeLobbyist = useActiveLobbyist();

  const [borrowerChoice, setBorrowerChoice] = useState<string>(
    String(defaultResidentId)
  );

  useFormToasts(state, "ההשאלה נשמרה");

  useEffect(() => {
    if (!state.submittedAt) return;
    formRef.current?.reset();
    Promise.resolve().then(() => {
      onCreated();
      setOpen(false);
    });
  }, [state.submittedAt, onCreated]);

  function handleOpen() {
    setBorrowerChoice(String(defaultResidentId));
    setOpen(true);
  }

  const isOther = borrowerChoice === OTHER_VALUE;
  const residentIdValue = isOther ? "" : borrowerChoice;

  const borrowerOptions = [
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
        השאלה חדשה
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="השאלת ציוד"
        size="md"
      >
        {open && (
          <form ref={formRef} action={action} className="space-y-4">
            <input type="hidden" name="resident_id" value={residentIdValue} />

            <Field label="משאיל" htmlFor="loan-borrower" required>
              <Dropdown
                id="loan-borrower"
                value={borrowerChoice}
                onChange={setBorrowerChoice}
                options={borrowerOptions}
              />
            </Field>

            {isOther && (
              <Field label="שם משאיל" htmlFor="loan-borrower-name" required>
                <Input
                  id="loan-borrower-name"
                  name="borrower_name"
                  required
                  autoFocus
                  placeholder="ועד / אורח / וכו׳"
                />
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="סוג ציוד" htmlFor="loan-type" required>
                <Dropdown
                  id="loan-type"
                  name="type"
                  defaultValue="chairs"
                  options={[
                    { value: "chairs", label: "כיסאות" },
                    { value: "tables", label: "שולחנות" },
                    { value: "cart", label: "עגלת משא" },
                  ]}
                />
              </Field>
              <Field label="כמות" htmlFor="loan-quantity" required>
                <Input
                  id="loan-quantity"
                  name="quantity"
                  type="number"
                  min={1}
                  defaultValue={1}
                  required
                  dir="ltr"
                  className="text-end"
                />
              </Field>
            </div>

            <Field label="פקיד" htmlFor="loan-lobbyist" required>
              <Input
                id="loan-lobbyist"
                name="lobbyist_name"
                required
                defaultValue={activeLobbyist?.lobbyist_name ?? ""}
                placeholder="שם הפקיד"
              />
            </Field>

            <Field label="הערה" htmlFor="loan-comment">
              <Textarea
                id="loan-comment"
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
