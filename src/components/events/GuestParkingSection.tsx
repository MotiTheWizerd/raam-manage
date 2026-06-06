"use client";

import { Camera, Plus } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getLastCarPlate } from "@/app/events/cars-actions";
import {
  createGuestParking,
  type GuestParkingFormState,
} from "@/app/events/guest-parking-actions";
import { useActiveLobbyist } from "@/components/PreferencesProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useFormToasts } from "@/lib/hooks/useFormToasts";
import { Textarea } from "@/components/ui/Textarea";

const initialState: GuestParkingFormState = {};

type Props = {
  residentId: number | null;
  onCreated: () => void;
  prefill?: { plate: string; guestName?: string | null; nonce: number } | null;
};

export function GuestParkingSection({ residentId, onCreated, prefill }: Props) {
  const [state, action, pending] = useActionState(
    createGuestParking,
    initialState
  );
  const formRef = useRef<HTMLFormElement>(null);
  const plateInputRef = useRef<HTMLInputElement>(null);
  const guestNameInputRef = useRef<HTMLInputElement>(null);
  const [fetchingPlate, setFetchingPlate] = useState(false);
  const activeLobbyist = useActiveLobbyist();

  useFormToasts(state, "נוסף");

  async function fillLastPlate() {
    setFetchingPlate(true);
    try {
      const plate = await getLastCarPlate();
      if (!plate) {
        toast.error("לא נמצא רישום אחרון");
        return;
      }
      if (plateInputRef.current) {
        plateInputRef.current.value = plate;
        plateInputRef.current.focus();
      }
    } catch {
      toast.error("שליפת הרישוי האחרון נכשלה");
    } finally {
      setFetchingPlate(false);
    }
  }

  useEffect(() => {
    if (!state.submittedAt) return;
    formRef.current?.reset();
    Promise.resolve().then(onCreated);
  }, [state.submittedAt, onCreated]);

  useEffect(() => {
    if (!prefill) return;
    const plate = prefill.plate?.trim();
    const guestName = prefill.guestName?.trim();
    if (plate && plateInputRef.current) plateInputRef.current.value = plate;
    if (guestName && guestNameInputRef.current) {
      guestNameInputRef.current.value = guestName;
    }
    // Land on the name when it's a known guest (so staff can confirm it),
    // otherwise on the plate for manual entry.
    const focusTarget = guestName
      ? guestNameInputRef.current
      : plateInputRef.current;
    focusTarget?.focus();
    focusTarget?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [prefill?.nonce]);

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium opacity-80">תיעוד חניית אורח</h2>

      <form
        ref={formRef}
        action={action}
        className="flex flex-wrap items-end gap-2"
      >
        {residentId !== null && (
          <input type="hidden" name="resident_id" value={residentId} />
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="guest-name" className="text-xs opacity-70">
            שם האורח
          </label>
          <Input
            ref={guestNameInputRef}
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
            className="text-xs opacity-70 flex items-center gap-1.5"
          >
            <span>
              מספר רישוי <span className="opacity-60">(אופציונלי)</span>
            </span>
            <button
              type="button"
              onClick={fillLastPlate}
              disabled={fetchingPlate}
              title="שליפת הרישוי האחרון מהמצלמה"
              aria-label="שליפת הרישוי האחרון מהמצלמה"
              className="inline-flex h-4 w-4 items-center justify-center rounded text-foreground/50 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-40 transition-colors"
            >
              <Camera size={12} className={fetchingPlate ? "animate-pulse" : ""} />
            </button>
          </label>
          <Input
            ref={plateInputRef}
            id="guest-plate"
            name="car_plate"
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
            פקיד
          </label>
          <Input
            id="guest-lobbyist"
            name="lobbyist_name"
            required
            defaultValue={activeLobbyist?.lobbyist_name ?? ""}
            placeholder="שם הפקיד"
            className="w-44"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="guest-comment" className="text-xs opacity-70">
            הערה <span className="opacity-60">(אופציונלי)</span>
          </label>
          <Textarea
            id="guest-comment"
            name="comment"
            placeholder="הערה חופשית..."
            className="w-52 h-9 min-h-0 resize-none py-1.5 text-sm"
            rows={1}
          />
        </div>

        <div className="flex flex-col gap-1">
          <Button type="submit" size="sm" disabled={pending || residentId === null}>
            <Plus size={14} />
            {pending ? "שומר..." : "הוסף"}
          </Button>
          {residentId === null && (
            <span className="text-xs opacity-50">בחר דייר לרישום</span>
          )}
        </div>
      </form>
    </section>
  );
}
