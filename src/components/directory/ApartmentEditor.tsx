"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { updateApartment } from "@/app/apartments/actions";
import { ApartmentForm } from "@/app/apartments/ApartmentForm";
import {
  getApartmentEditData,
  type ApartmentEditData,
} from "@/app/directory/actions";
import { Tabs } from "@/components/ui/Tabs";
import { callPolicyFromCode } from "@/lib/call-policy";
import { OwnersEditor } from "./OwnersEditor";
import { ResidentsEditor } from "./ResidentsEditor";

type TabValue = "apartment" | "owners" | "residents";

// How to arrange the three editors:
// - "tabs":    one section at a time (used inside the manager modal).
// - "stacked": all sections open with headers (used for the in-table inline
//   row editor, where a popup's tab bar would feel out of place).
export type ApartmentEditorLayout = "tabs" | "stacked";

type Props = {
  apartmentId: number;
  /** Fallback number for the (rare) not-found state; the data owns the rest. */
  apartmentNumber: string;
  layout?: ApartmentEditorLayout;
};

// The shared body of the directory's full-record editor: lazy-loads one
// apartment's data across all tables, then renders three editors — each reuses
// an existing form/actions and saves independently (there is no single "save
// all"; that mirrors how the modal has always worked). Wrapped in a Modal by
// DirectoryRowEditor, or rendered inline in the sheet's row expansion.
export function ApartmentEditor({
  apartmentId,
  apartmentNumber,
  layout = "tabs",
}: Props) {
  const router = useRouter();
  const [data, setData] = useState<ApartmentEditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabValue>("apartment");

  // No synchronous setState here (loading starts true) so it's safe to call
  // from the mount effect; later reloads keep the existing data visible.
  const load = useCallback(() => {
    getApartmentEditData(apartmentId)
      .then(setData)
      .finally(() => setLoading(false));
  }, [apartmentId]);

  useEffect(() => {
    load();
  }, [load]);

  // After any write: refetch this editor's data AND refresh the underlying
  // sheet so the row reflects the change immediately.
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

  const apartmentSection = (
    <ApartmentForm
      zones={data.zones}
      initialValues={{
        number: data.apartment.number,
        floor:
          data.apartment.floor !== null ? String(data.apartment.floor) : "",
        zone_id:
          data.apartment.zone_id !== null
            ? String(data.apartment.zone_id)
            : "",
        notes: data.apartment.notes ?? "",
        call_policy: callPolicyFromCode(data.apartment.must_call),
      }}
      initialParking={data.parking.map((a) => ({
        floor: a.floor,
        number: a.number,
        notes: a.notes,
      }))}
      initialStorage={data.storage.map((a) => ({
        floor: a.floor,
        number: a.number,
        notes: a.notes,
      }))}
      initialKeys={data.keys.map((k) => ({
        nickname: k.nickname,
        is_default: k.is_default === 1,
        is_active: k.is_active === 1,
        is_in_lobby: k.is_in_lobby === 1,
      }))}
      initialKeysComment={data.apartment.keys_comment}
      initialVehicles={data.vehicles.map((v) => ({
        license_plate: v.license_plate,
        color: v.color,
        model: v.model,
        notes: v.notes,
      }))}
      hiddenIdValue={data.apartment.id}
      action={updateApartment}
      submitLabel="שמור שינויים"
      onSuccess={reload}
    />
  );

  const ownersSection = (
    <OwnersEditor
      apartmentId={apartmentId}
      owners={data.owners}
      onChanged={reload}
    />
  );

  const residentsSection = (
    <ResidentsEditor
      apartmentId={apartmentId}
      residents={data.residents}
      apartmentOptions={data.apartmentOptions}
      onChanged={reload}
    />
  );

  if (layout === "stacked") {
    return (
      <div className="space-y-5">
        <Section title="פרטי דירה">{apartmentSection}</Section>
        <Section title={`בעלים (${data.owners.length})`}>
          {ownersSection}
        </Section>
        <Section title={`דיירים (${data.residents.length})`}>
          {residentsSection}
        </Section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs
        tabs={[
          { value: "apartment", label: "דירה" },
          { value: "owners", label: "בעלים", badge: data.owners.length },
          { value: "residents", label: "דיירים", badge: data.residents.length },
        ]}
        value={tab}
        onChange={(v) => setTab(v as TabValue)}
      />

      <div className="max-h-[70vh] overflow-y-auto pe-1">
        {tab === "apartment" && apartmentSection}
        {tab === "owners" && ownersSection}
        {tab === "residents" && residentsSection}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h4 className="border-b border-black/10 pb-1 text-sm font-semibold text-foreground/80 dark:border-white/10">
        {title}
      </h4>
      {children}
    </section>
  );
}
