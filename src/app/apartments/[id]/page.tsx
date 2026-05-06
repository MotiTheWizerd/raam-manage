import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { ApartmentDetail } from "./ApartmentDetail";

export const dynamic = "force-dynamic";

type Apartment = {
  id: number;
  number: string;
  floor: number | null;
  zone_id: number | null;
  zone_name: string | null;
  notes: string | null;
};

type Asset = {
  id: number;
  type: "parking" | "storage";
  floor: number;
  number: string;
  notes: string | null;
};

type KeyRow = {
  id: number;
  nickname: string;
  is_default: number;
  is_active: number;
  is_in_lobby: number;
};

type Zone = { id: number; name: string };

export default async function ApartmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) notFound();

  const apartment = db
    .prepare(
      `SELECT a.id, a.number, a.floor, a.zone_id, a.notes,
              z.name AS zone_name
       FROM apartments a
       LEFT JOIN zones z ON z.id = a.zone_id
       WHERE a.id = ?`
    )
    .get(id) as Apartment | undefined;

  if (!apartment) notFound();

  const assets = db
    .prepare(
      `SELECT id, type, floor, number, notes
       FROM apartment_assets
       WHERE apartment_id = ?
       ORDER BY type, floor, number`
    )
    .all(id) as Asset[];

  const parking = assets.filter((a) => a.type === "parking");
  const storage = assets.filter((a) => a.type === "storage");

  const keys = db
    .prepare(
      `SELECT id, nickname, is_default, is_active, is_in_lobby
       FROM apartment_keys
       WHERE apartment_id = ?
       ORDER BY is_default DESC, id`
    )
    .all(id) as KeyRow[];

  const zones = db
    .prepare("SELECT id, name FROM zones ORDER BY name")
    .all() as Zone[];

  return (
    <div className="space-y-4 max-w-3xl">
      <Link
        href="/apartments"
        className="inline-flex items-center gap-1 text-sm opacity-70 hover:opacity-100 transition-opacity"
      >
        <ArrowRight size={14} />
        חזרה לרשימת הדירות
      </Link>

      <ApartmentDetail
        apartment={apartment}
        parking={parking}
        storage={storage}
        keys={keys}
        zones={zones}
      />
    </div>
  );
}
