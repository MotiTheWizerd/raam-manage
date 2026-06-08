import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { ResidentDetail } from "./ResidentDetail";

export const dynamic = "force-dynamic";

type Resident = {
  id: number;
  apartment_id: number;
  first_name: string;
  last_name: string;
  type: "owner" | "renter";
  id_number: string | null;
  po_box: string | null;
  notes: string | null;
  apartment_number: string | null;
  apartment_comment: string | null;
  zone_name: string | null;
};

type Phone = {
  id: number;
  number: string;
  label: string | null;
  comment: string | null;
  is_primary: number;
};

type ApartmentRow = {
  id: number;
  number: string;
  zone_name: string | null;
};

export default async function ResidentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (Number.isNaN(id)) notFound();

  const resident = db
    .prepare(
      `SELECT r.id, r.apartment_id, r.first_name, r.last_name, r.type,
              r.id_number, r.po_box, r.notes,
              a.number AS apartment_number,
              a.notes  AS apartment_comment,
              z.name   AS zone_name
       FROM residents r
       LEFT JOIN apartments a ON a.id = r.apartment_id
       LEFT JOIN zones z      ON z.id = a.zone_id
       WHERE r.id = ?`
    )
    .get(id) as Resident | undefined;

  if (!resident) notFound();

  const phones = db
    .prepare(
      `SELECT id, number, label, comment, is_primary
       FROM phones
       WHERE resident_id = ?
       ORDER BY is_primary DESC, id ASC`
    )
    .all(id) as Phone[];

  const apartments = db
    .prepare(
      `SELECT a.id, a.number, z.name AS zone_name
       FROM apartments a
       LEFT JOIN zones z ON z.id = a.zone_id
       ORDER BY a.number`
    )
    .all() as ApartmentRow[];

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <Link
        href="/renters"
        className="inline-flex items-center gap-1 text-sm opacity-70 hover:opacity-100 transition-opacity"
      >
        <ArrowRight size={14} />
        חזרה לרשימת הדיירים
      </Link>

      <ResidentDetail
        resident={resident}
        phones={phones}
        apartments={apartments}
      />
    </div>
  );
}
