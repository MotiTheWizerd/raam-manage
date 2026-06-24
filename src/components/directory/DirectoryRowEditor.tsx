"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { updateApartment } from "@/app/apartments/actions";
import { ApartmentForm } from "@/app/apartments/ApartmentForm";
import {
  getApartmentEditData,
  type ApartmentEditData,
} from "@/app/directory/actions";
import { Modal } from "@/components/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { callPolicyFromCode } from "@/lib/call-policy";
import { OwnersEditor } from "./OwnersEditor";
import { ResidentsEditor } from "./ResidentsEditor";

type Props = {
  apartmentId: number;
  apartmentNumber: string;
  open: boolean;
  onClose: () => void;
};

type TabValue = "apartment" | "owners" | "residents";

// Full-record editor for one directory row. Lazy-loads the apartment's data
// across all tables when opened; each tab reuses an existing form/actions.
export function DirectoryRowEditor({
  apartmentId,
  apartmentNumber,
  open,
  onClose,
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

  // The parent unmounts this editor on close, so it mounts fresh per row:
  // load the apartment's data on mount (tab defaults to "apartment").
  useEffect(() => {
    load();
  }, [load]);

  // After any write: refetch the editor data AND refresh the underlying sheet.
  const reload = useCallback(() => {
    load();
    router.refresh();
  }, [load, router]);

  const title = `עריכת דירה ${data?.apartment.number ?? apartmentNumber}`;

  return (
    <Modal open={open} onClose={onClose} title={title} size="xl">
      {loading && !data ? (
        <div className="flex items-center justify-center py-12 opacity-60">
          <Loader2 className="animate-spin" size={20} />
        </div>
      ) : !data ? (
        <p className="py-8 text-center text-sm opacity-60">הדירה לא נמצאה.</p>
      ) : (
        <div className="space-y-4">
          <Tabs
            tabs={[
              { value: "apartment", label: "דירה" },
              { value: "owners", label: "בעלים", badge: data.owners.length },
              {
                value: "residents",
                label: "דיירים",
                badge: data.residents.length,
              },
            ]}
            value={tab}
            onChange={(v) => setTab(v as TabValue)}
          />

          <div className="max-h-[70vh] overflow-y-auto pe-1">
            {tab === "apartment" && (
              <ApartmentForm
                zones={data.zones}
                initialValues={{
                  number: data.apartment.number,
                  floor:
                    data.apartment.floor !== null
                      ? String(data.apartment.floor)
                      : "",
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
            )}

            {tab === "owners" && (
              <OwnersEditor
                apartmentId={apartmentId}
                owners={data.owners}
                onChanged={reload}
              />
            )}

            {tab === "residents" && (
              <ResidentsEditor
                apartmentId={apartmentId}
                residents={data.residents}
                apartmentOptions={data.apartmentOptions}
                onChanged={reload}
              />
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
