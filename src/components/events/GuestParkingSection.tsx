"use client";

import { Plus } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import {
  createGuestParking,
  type GuestParkingFormState,
} from "@/app/events/guest-parking-actions";
import { useActiveLobbyist } from "@/components/PreferencesProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useFormToasts } from "@/lib/hooks/useFormToasts";

const initialState: GuestParkingFormState = {};

type Props = {
  residentId: number;
  onCreated: () => void;
};

export function GuestParkingSection({ residentId, onCreated }: Props) {
  const [state, action, pending] = useActionState(
    createGuestParking,
    initialState
  );
  const formRef = useRef<HTMLFormElement>(null);
  const activeLobbyist = useActiveLobbyist();

  useFormToasts(state, "נוסף");

  useEffect(() => {
    if (!state.submittedAt) return;
    formRef.current?.reset();
    Promise.resolve().then(onCreated);
  }, [state.submittedAt, onCreated]);

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium opacity-80">תיעוד חניית אורח</h2>

      <form
        ref={formRef}
        action={action}
        className="flex flex-wrap items-end gap-2"
      >
        <input type="hidden" name="resident_id" value={residentId} />

        <div className="flex flex-col gap-1">
          <label htmlFor="guest-name" className="text-xs opacity-70">
            שם האורח
          </label>
          <Input
            id="guest-name"
            name="guest_name"
            required
            placeholder="שם מלא"
            className="w-44"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="guest-plate"
            className="text-xs opacity-70"
          >
            מספר רישוי
          </label>
          <Input
            id="guest-plate"
            name="car_plate"
            required
            placeholder="123-45-678"
            dir="ltr"
            className="w-40 text-end font-mono"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="guest-lobbyist"
            className="text-xs opacity-70"
          >
            סדרן
          </label>
          <Input
            id="guest-lobbyist"
            name="lobbyist_name"
            required
            defaultValue={activeLobbyist?.lobbyist_name ?? ""}
            placeholder="שם הסדרן"
            className="w-44"
          />
        </div>

        <Button type="submit" size="sm" disabled={pending}>
          <Plus size={14} />
          {pending ? "שומר..." : "הוסף"}
        </Button>
      </form>
    </section>
  );
}
