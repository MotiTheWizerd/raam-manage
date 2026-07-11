"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useCallback, useEffect, useState } from "react";
import {
  updateApartmentCallPolicy,
  updateApartmentKeys,
  updateApartmentNotes,
  type ApartmentFormState,
} from "@/app/apartments/actions";
import { CALL_POLICY_OPTIONS } from "@/app/apartments/ApartmentForm";
import { KeysFields } from "@/app/apartments/KeysFields";
import {
  getApartmentEditData,
  type ApartmentEditData,
} from "@/app/directory/actions";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { Textarea } from "@/components/ui/Textarea";
import { callPolicyFromCode } from "@/lib/call-policy";
import { cn } from "@/lib/cn";
import { useFormToasts } from "@/lib/hooks/useFormToasts";

type Props = {
  apartmentId: number;
  /** Fallback number for the (rare) not-found state; the data owns the rest. */
  apartmentNumber: string;
};

type TabValue = "contact" | "notes" | "keys";

// The lobbyist's restricted directory editor: the SAME black-screen modal the
// manager gets, but limited to the three things front-desk staff may change —
// contact policy, notes, and keys. Everything else (number/floor/zone, parking,
// storage, vehicles, owners, residents) stays manager-only. Each section saves
// on its own via a targeted action (never the full updateApartment, which would
// delete+reinsert the untouched tables).
export function LobbyistApartmentEditor({
  apartmentId,
  apartmentNumber,
}: Props) {
  const router = useRouter();
  const [data, setData] = useState<ApartmentEditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabValue>("contact");

  const load = useCallback(() => {
    getApartmentEditData(apartmentId)
      .then(setData)
      .finally(() => setLoading(false));
  }, [apartmentId]);

  useEffect(() => {
    load();
  }, [load]);

  // After any save: refetch this editor's data AND refresh the directory so the
  // row reflects the change immediately.
  const reload = useCallback(() => {
    load();
    router.refresh();
  }, [load, router]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12 opacity-60">
        <Loader2 className="animate-spin" size={20} />
      </div>
    );
  }
  if (!data) {
    return (
      <p className="py-8 text-center text-sm opacity-60">
        דירה {apartmentNumber} לא נמצאה.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs
        tabs={[
          { value: "contact", label: "יצירת קשר" },
          { value: "notes", label: "הערות" },
          { value: "keys", label: "מפתחות", badge: data.keys.length },
        ]}
        value={tab}
        onChange={(v) => setTab(v as TabValue)}
      />

      <div className="max-h-[70vh] overflow-y-auto pe-1">
        {tab === "contact" && (
          <CallPolicyForm
            apartmentId={apartmentId}
            initial={callPolicyFromCode(data.apartment.must_call)}
            onSaved={reload}
          />
        )}
        {tab === "notes" && (
          <NotesForm
            apartmentId={apartmentId}
            initial={data.apartment.notes ?? ""}
            onSaved={reload}
          />
        )}
        {tab === "keys" && (
          <KeysForm
            apartmentId={apartmentId}
            keys={data.keys}
            keysComment={data.apartment.keys_comment}
            onSaved={reload}
          />
        )}
      </div>
    </div>
  );
}

const emptyState: ApartmentFormState = {};

// Fires the parent reload once a save lands. Mirrors ApartmentForm's onSuccess
// effect (a callback, not a direct setState, so it's clear of the repo's
// set-state-in-effect lint).
function useSavedEffect(state: ApartmentFormState, onSaved: () => void) {
  useFormToasts(state);
  useEffect(() => {
    if (state.submittedAt) onSaved();
  }, [state.submittedAt, onSaved]);
}

function SaveRow({ pending, label }: { pending: boolean; label: string }) {
  return (
    <div className="flex justify-end pt-1">
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "שומר..." : label}
      </Button>
    </div>
  );
}

function CallPolicyForm({
  apartmentId,
  initial,
  onSaved,
}: {
  apartmentId: number;
  initial: ReturnType<typeof callPolicyFromCode>;
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    updateApartmentCallPolicy,
    emptyState
  );
  useSavedEffect(state, onSaved);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={apartmentId} />
      <p className="text-xs opacity-70">
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
                defaultChecked={initial === opt.value}
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
      <SaveRow pending={pending} label="שמור" />
    </form>
  );
}

function NotesForm({
  apartmentId,
  initial,
  onSaved,
}: {
  apartmentId: number;
  initial: string;
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    updateApartmentNotes,
    emptyState
  );
  useSavedEffect(state, onSaved);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={apartmentId} />
      <Textarea
        name="notes"
        rows={3}
        placeholder="פרטים נוספים על הדירה"
        defaultValue={initial}
      />
      <SaveRow pending={pending} label="שמור" />
    </form>
  );
}

function KeysForm({
  apartmentId,
  keys,
  keysComment,
  onSaved,
}: {
  apartmentId: number;
  keys: ApartmentEditData["keys"];
  keysComment: string | null;
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    updateApartmentKeys,
    emptyState
  );
  useSavedEffect(state, onSaved);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={apartmentId} />
      <KeysFields
        initial={keys.map((k) => ({
          nickname: k.nickname,
          is_default: k.is_default === 1,
          is_active: k.is_active === 1,
          is_in_lobby: k.is_in_lobby === 1,
        }))}
        initialComment={keysComment}
      />
      <SaveRow pending={pending} label="שמור מפתחות" />
    </form>
  );
}
