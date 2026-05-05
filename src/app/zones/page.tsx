import { db } from "@/lib/db";
import { AddZoneButton } from "./AddZoneButton";
import { EditZoneButton } from "./EditZoneButton";

export const dynamic = "force-dynamic";

type Zone = { id: number; name: string };

export default function ZonesPage() {
  const zones = db.prepare("SELECT * FROM zones ORDER BY name").all() as Zone[];

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">אזורים</h1>
        <AddZoneButton />
      </div>

      {zones.length === 0 ? (
        <p className="text-sm opacity-70">אין אזורים עדיין. הוסף את האזור הראשון.</p>
      ) : (
        <ul className="border border-black/10 dark:border-white/10 rounded-lg divide-y divide-black/10 dark:divide-white/10">
          {zones.map((z) => (
            <li
              key={z.id}
              className="flex items-center justify-between px-4 py-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors"
            >
              <span>{z.name}</span>
              <EditZoneButton zone={z} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
