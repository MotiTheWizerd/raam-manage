import { db } from "@/lib/db";
import { isManager } from "@/lib/auth";
import { AddApartmentButton } from "./AddApartmentButton";
import { ApartmentsList, type ApartmentsListItem } from "./ApartmentsList";

export const dynamic = "force-dynamic";

type Zone = { id: number; name: string };

export default async function ApartmentsPage() {
  const apartments = db
    .prepare(
      `SELECT a.*, z.name AS zone_name
       FROM apartments a
       LEFT JOIN zones z ON z.id = a.zone_id
       ORDER BY a.number`
    )
    .all() as ApartmentsListItem[];

  const zones = db
    .prepare("SELECT id, name FROM zones ORDER BY name")
    .all() as Zone[];

  const canEdit = await isManager();

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">דירות</h1>
        {canEdit && <AddApartmentButton zones={zones} />}
      </div>

      {apartments.length === 0 ? (
        <p className="text-sm opacity-70">אין דירות עדיין. הוסף את הדירה הראשונה.</p>
      ) : (
        <ApartmentsList apartments={apartments} />
      )}
    </div>
  );
}
