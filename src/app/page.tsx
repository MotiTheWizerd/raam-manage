import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function Dashboard() {
  const apartments = db.prepare("SELECT COUNT(*) as n FROM apartments").get() as { n: number };
  const activeResidents = db
    .prepare("SELECT COUNT(*) as n FROM residents WHERE move_out IS NULL")
    .get() as { n: number };
  const zones = db.prepare("SELECT COUNT(*) as n FROM zones").get() as { n: number };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">כללי</h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-2xl">
        <Stat label="דירות" value={apartments.n} />
        <Stat label="דיירים פעילים" value={activeResidents.n} />
        <Stat label="אזורים" value={zones.n} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10 p-4">
      <div className="text-sm opacity-70">{label}</div>
      <div className="text-3xl font-semibold mt-1 tabular-nums">{value}</div>
    </div>
  );
}
