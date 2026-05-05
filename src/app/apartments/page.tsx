import { db } from "@/lib/db";
import { AddApartmentButton } from "./AddApartmentButton";

export const dynamic = "force-dynamic";

type Apartment = {
  id: number;
  number: string;
  floor: number | null;
  zone_id: number | null;
  zone_name: string | null;
  notes: string | null;
};

type Zone = { id: number; name: string };

export default function ApartmentsPage() {
  const apartments = db
    .prepare(
      `SELECT a.*, z.name AS zone_name
       FROM apartments a
       LEFT JOIN zones z ON z.id = a.zone_id
       ORDER BY a.number`
    )
    .all() as Apartment[];

  const zones = db
    .prepare("SELECT id, name FROM zones ORDER BY name")
    .all() as Zone[];

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">דירות</h1>
        <AddApartmentButton zones={zones} />
      </div>

      {apartments.length === 0 ? (
        <p className="text-sm opacity-70">אין דירות עדיין. הוסף את הדירה הראשונה.</p>
      ) : (
        <div className="rounded-lg border border-black/10 dark:border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.02] dark:bg-white/[0.03] text-xs uppercase tracking-wide">
              <tr className="border-b border-black/10 dark:border-white/10 opacity-70">
                <th className="px-4 py-2.5 font-medium text-start">מספר</th>
                <th className="px-4 py-2.5 font-medium text-start">קומה</th>
                <th className="px-4 py-2.5 font-medium text-start">אזור</th>
                <th className="px-4 py-2.5 font-medium text-start">הערות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 dark:divide-white/5">
              {apartments.map((a) => (
                <tr
                  key={a.id}
                  className="hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors"
                >
                  <td className="px-4 py-2.5 font-medium">{a.number}</td>
                  <td className="px-4 py-2.5 opacity-80">{a.floor ?? "—"}</td>
                  <td className="px-4 py-2.5 opacity-80">{a.zone_name ?? "—"}</td>
                  <td className="px-4 py-2.5 opacity-60 max-w-xs truncate">
                    {a.notes ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
