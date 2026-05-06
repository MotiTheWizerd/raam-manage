"use client";

import { useActionState, useEffect } from "react";
import {
  logKeyEvent,
  type ApartmentResidentOption,
  type LogKeyEventState,
} from "@/app/events/actions";
import { Modal } from "@/components/Modal";
import { useActiveLobbyist } from "@/components/PreferencesProvider";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useFormToasts } from "@/lib/hooks/useFormToasts";

const initialState: LogKeyEventState = {};

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  keyId: number;
  keyNickname: string;
  currentIsInLobby: boolean;
  residents: ApartmentResidentOption[];
};

export function LogKeyEventModal({
  open,
  onClose,
  onSuccess,
  keyId,
  keyNickname,
  currentIsInLobby,
  residents,
}: Props) {
  const [state, action, pending] = useActionState(logKeyEvent, initialState);
  const activeLobbyist = useActiveLobbyist();

  useFormToasts(state, "האירוע נשמר");

  useEffect(() => {
    if (!state.submittedAt) return;
    Promise.resolve().then(() => {
      onSuccess();
      onClose();
    });
  }, [state.submittedAt, onSuccess, onClose]);

  // Default new state to the opposite of current — most likely action.
  const defaultIsInLobby = currentIsInLobby ? "0" : "1";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`תיעוד אירוע — ${keyNickname}`}
      size="md"
    >
      {open && (
        <form action={action} className="space-y-4">
          <input type="hidden" name="apartment_key_id" value={keyId} />

          <Field label="שם הסדרן" htmlFor="lobbyist-name" required>
            <Input
              id="lobbyist-name"
              name="lobbyist_name"
              required
              autoFocus
              placeholder="השם שלך"
              defaultValue={activeLobbyist?.lobbyist_name ?? ""}
            />
          </Field>

          <Field label="מצב" htmlFor="is-in-lobby" required>
            <Dropdown
              id="is-in-lobby"
              name="is_in_lobby"
              defaultValue={defaultIsInLobby}
              options={[
                { value: "0", label: "יצא מהלובי" },
                { value: "1", label: "חזר ללובי" },
              ]}
            />
          </Field>

          <Field label="דייר" htmlFor="resident-id">
            <Dropdown
              id="resident-id"
              name="resident_id"
              defaultValue=""
              options={[
                { value: "", label: "— ללא —" },
                ...residents.map((r) => ({
                  value: String(r.id),
                  label: r.full_name,
                })),
              ]}
            />
          </Field>

          <Field label="הערה" htmlFor="event-comment">
            <Textarea
              id="event-comment"
              name="comment"
              rows={2}
              placeholder="גנן לקח את המפתח / הוחזר ע״י השליח / וכו׳"
            />
          </Field>
          <p className="text-xs opacity-60 -mt-2">
            יש להוסיף דייר או הערה
          </p>

          {state.error && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {state.error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              ביטול
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "שומר..." : "שמור"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
