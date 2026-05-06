import Link from "next/link";
import { db } from "@/lib/db";
import { AddResidentButton } from "./AddResidentButton";

export const dynamic = "force-dynamic";

type Resident = {
  id: number;
  first_name: string;
  last_name: string;
  type: "owner" | "renter";
  po_box: string | null;
  apartment_number: string | null;
  zone_name: string | null;
  primary_phone: string | null;
};

type ApartmentOption = {
  id: number;
  number: string;
  zone_name: string | null;
};

const TYPE_LABEL: Record<Resident["type"], string> = {
  owner: "בעלים",
  renter: "שוכר",
};

export default function RentersPage() {
  const residents = db
    .prepare(
      `SELECT
         r.id, r.first_name, r.last_name, r.type, r.po_box,
         a.number AS apartment_number,
         z.name   AS zone_name,
         (SELECT number FROM phones WHERE resident_id = r.id AND is_primary = 1 LIMIT 1) AS primary_phone
       FROM residents r
       LEFT JOIN apartments a ON a.id = r.apartment_id
       LEFT JOIN zones z      ON z.id = a.zone_id
       WHERE r.move_out IS NULL
       ORDER BY r.last_name, r.first_name`
    )
    .all() as Resident[];

  const apartments = db
    .prepare(
      `SELECT a.id, a.number, z.name AS zone_name
       FROM apartments a
       LEFT JOIN zones z ON z.id = a.zone_id
       ORDER BY a.number`
    )
    .all() as ApartmentOption[];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">דיירים</h1>
        <AddResidentButton apartments={apartments} />
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
        <div className="rounded-lg border border-black/10 dark:border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.02] dark:bg-white/[0.03] text-xs uppercase tracking-wide">
              <tr className="border-b border-black/10 dark:border-white/10 opacity-70">
                <th className="px-4 py-2.5 font-medium text-start">שם</th>
                <th className="px-4 py-2.5 font-medium text-start">דירה</th>
                <th className="px-4 py-2.5 font-medium text-start">אזור</th>
                <th className="px-4 py-2.5 font-medium text-start">סוג</th>
                <th className="px-4 py-2.5 font-medium text-start">טלפון</th>
                <th className="px-4 py-2.5 font-medium text-start">ת.ד.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 dark:divide-white/5">
              {residents.map((r) => (
                <tr
                  key={r.id}
                  className="hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors"
                >
                  <td className="px-4 py-2.5 font-medium">
                    <Link
                      href={`/renters/${r.id}`}
                      className="hover:text-red-600 dark:hover:text-red-400 transition-colors"
                    >
                      {r.first_name} {r.last_name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 opacity-80">
                    {r.apartment_number ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 opacity-80">{r.zone_name ?? "—"}</td>
                  <td className="px-4 py-2.5 opacity-80">{TYPE_LABEL[r.type]}</td>
                  <td className="px-4 py-2.5 opacity-80 font-mono">
                    {r.primary_phone ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 opacity-60">{r.po_box ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
