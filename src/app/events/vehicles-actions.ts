"use server";

import { db } from "@/lib/db";

export type ApartmentVehicleRow = {
  id: number;
  license_plate: string;
  color: string | null;
  model: string | null;
  notes: string | null;
};

export async function getApartmentVehicles(
  apartmentId: number
): Promise<ApartmentVehicleRow[]> {
  return db
    .prepare(
      `SELECT id, license_plate, color, model, notes
       FROM apartment_vehicles
       WHERE apartment_id = ?
       ORDER BY id`
    )
    .all(apartmentId) as ApartmentVehicleRow[];
}
