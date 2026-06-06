"use server";

import { querySlpr } from "@/lib/slpr-mysql";

/**
 * READ-ONLY views over the external SLPR `customer` table (the parking
 * system's registered-car directory). We NEVER write to this table — every
 * query here is a plain SELECT.
 */

export type RegisteredCarRow = {
  id: number;
  plate: string;
  firstName: string | null;
  lastName: string | null;
  apartment: string | null;
  phone: string | null;
  isEmployee: boolean;
  additionalPlates: string | null;
};

export type RegisteredCarsSummary = {
  residentCars: number; // registered cars belonging to residents
  apartments: number; // distinct apartments that have at least one resident car
  withoutApartment: number; // resident cars not linked to an apartment
};

export type ApartmentCarCount = {
  apartment: string;
  cars: number;
};

// Employees are excluded everywhere in this tab — we only report residents.
const RESIDENT_FILTER = "(isEmployee = 0 OR isEmployee IS NULL)";

export type PaginatedRegisteredCars = {
  rows: RegisteredCarRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

/**
 * `querySlpr` builds raw SQL (no bound params), so any user text must be turned
 * into a safe single-quoted MySQL string literal. Escape backslash + quote and
 * cap the length so a search box can never inject.
 */
function sqlString(value: string): string {
  const escaped = value
    .slice(0, 60)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'");
  return `'${escaped}'`;
}

// Always restrict to residents; AND the search terms on top when present.
function buildWhere(rawQuery: string): string {
  const conditions = [RESIDENT_FILTER];
  const q = rawQuery.trim();
  if (q) {
    const like = sqlString(`%${q}%`);
    conditions.push(`(
      LP LIKE ${like}
      OR First_Name LIKE ${like}
      OR Last_Name LIKE ${like}
      OR Apartment LIKE ${like}
      OR Phone LIKE ${like}
      OR additional_lps LIKE ${like}
    )`);
  }
  return `WHERE ${conditions.join(" AND ")}`;
}

type CustomerRawRow = {
  ID: string | null;
  LP: string | null;
  First_Name: string | null;
  Last_Name: string | null;
  Apartment: string | null;
  Phone: string | null;
  isEmployee: string | null;
  additional_lps: string | null;
};

function toNumber(value: string | null): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function trimOrNull(value: string | null): string | null {
  const t = (value ?? "").trim();
  return t.length > 0 ? t : null;
}

export async function getRegisteredCarsSummary(): Promise<RegisteredCarsSummary> {
  const rows = await querySlpr<{
    residentCars: string | null;
    apartments: string | null;
    withoutApartment: string | null;
  }>(
    `SELECT
       COUNT(*)                                                       AS residentCars,
       COUNT(DISTINCT CASE WHEN Apartment IS NOT NULL
                            AND TRIM(Apartment) <> '' THEN Apartment END) AS apartments,
       SUM(Apartment IS NULL OR TRIM(Apartment) = '')                AS withoutApartment
     FROM customer
     WHERE ${RESIDENT_FILTER}`
  );

  const r = rows[0];
  return {
    residentCars: toNumber(r?.residentCars ?? null),
    apartments: toNumber(r?.apartments ?? null),
    withoutApartment: toNumber(r?.withoutApartment ?? null),
  };
}

// Cars registered per apartment (residents only), naturally sorted by apartment
// number so "603B" comes before "1101A". This is the key per-apartment breakdown.
export async function getCarsPerApartment(): Promise<ApartmentCarCount[]> {
  const rows = await querySlpr<{ apt: string | null; cars: string | null }>(
    `SELECT Apartment AS apt, COUNT(*) AS cars
       FROM customer
      WHERE ${RESIDENT_FILTER}
        AND Apartment IS NOT NULL AND TRIM(Apartment) <> ''
      GROUP BY Apartment`
  );

  return rows
    .map((r) => ({ apartment: (r.apt ?? "").trim(), cars: toNumber(r.cars) }))
    .filter((r) => r.apartment.length > 0)
    .sort((a, b) => a.apartment.localeCompare(b.apartment, "he", { numeric: true }));
}

export async function getRegisteredCarsPage(
  page: number = 1,
  pageSize: number = 15,
  query: string = ""
): Promise<PaginatedRegisteredCars> {
  const safePageSize = Math.max(1, Math.min(100, Math.floor(pageSize)));
  const requestedPage = Math.max(1, Math.floor(page));
  const where = buildWhere(query);

  const countRows = await querySlpr<{ n: string | null }>(
    `SELECT COUNT(*) AS n FROM customer ${where}`
  );
  const total = toNumber(countRows[0]?.n ?? null);

  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const safePage = Math.min(requestedPage, totalPages);
  const offset = (safePage - 1) * safePageSize;

  const rows = await querySlpr<CustomerRawRow>(
    `SELECT ID, LP, First_Name, Last_Name, Apartment, Phone, isEmployee, additional_lps
     FROM customer
     ${where}
     ORDER BY (Apartment IS NULL OR Apartment = ''), Apartment, Last_Name, First_Name
     LIMIT ${safePageSize} OFFSET ${offset}`
  );

  return {
    rows: rows.map((row) => ({
      id: toNumber(row.ID),
      plate: (row.LP ?? "").trim(),
      firstName: trimOrNull(row.First_Name),
      lastName: trimOrNull(row.Last_Name),
      apartment: trimOrNull(row.Apartment),
      phone: trimOrNull(row.Phone),
      isEmployee: row.isEmployee === "1",
      additionalPlates: trimOrNull(row.additional_lps),
    })),
    page: safePage,
    pageSize: safePageSize,
    total,
    totalPages,
  };
}
