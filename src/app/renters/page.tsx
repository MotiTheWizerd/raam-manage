import { db } from "@/lib/db";
import { isManager } from "@/lib/auth";
import { AddResidentButton } from "./AddResidentButton";
import { RentersList, type RentersListResident } from "./RentersList";

export const dynamic = "force-dynamic";

type ApartmentOption = {
  id: number;
  number: string;
  zone_name: string | null;
};

export default async function RentersPage() {
  const residents = db
    .prepare(
      `SELECT
         r.id, r.first_name, r.last_name, r.type, r.po_box,
         a.number AS apartment_number,
         a.notes  AS apartment_comment,
         z.name   AS zone_name,
         (SELECT number FROM phones WHERE resident_id = r.id AND is_primary = 1 LIMIT 1) AS primary_phone
       FROM residents r
       LEFT JOIN apartments a ON a.id = r.apartment_id
       LEFT JOIN zones z      ON z.id = a.zone_id
       WHERE r.move_out IS NULL
       ORDER BY r.last_name, r.first_name`
    )
    .all() as RentersListResident[];

  const apartments = db
    .prepare(
      `SELECT a.id, a.number, z.name AS zone_name
       FROM apartments a
       LEFT JOIN zones z ON z.id = a.zone_id
       ORDER BY a.number`
    )
    .all() as ApartmentOption[];

  const canEdit = await isManager();

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">דיירים</h1>
        {canEdit && <AddResidentButton apartments={apartments} />}
      </div>

      {apartments.length === 0 ? (
        <p className="text-sm opacity-70">
          צריך להוסיף דירה אחת לפחות לפני הוספת דיירים.
        </p>
      ) : residents.length === 0 ? (
        <p className="text-sm opacity-70">
          אין דיירים עדיין. הוסף את הדייר הראשון.
        </p>
      ) : (
        <RentersList residents={residents} />
      )}
    </div>
  );
}
