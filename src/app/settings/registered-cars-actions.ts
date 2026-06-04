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
  total: number;
  employees: number;
  residents: number;
  withApartment: number;
};

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

function searchClause(rawQuery: string): string {
  const q = rawQuery.trim();
  if (!q) return "";
  const like = sqlString(`%${q}%`);
  return `WHERE (
    LP LIKE ${like}
    OR First_Name LIKE ${like}
    OR Last_Name LIKE ${like}
    OR Apartment LIKE ${like}
    OR Phone LIKE ${like}
    OR additional_lps LIKE ${like}
  )`;
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
    total: string | null;
    employees: string | null;
    residents: string | null;
    withApartment: string | null;
  }>(
    `SELECT
       COUNT(*)                                                AS total,
       SUM(isEmployee = 1)                                     AS employees,
       SUM(isEmployee = 0 OR isEmployee IS NULL)               AS residents,
       SUM(Apartment IS NOT NULL AND Apartment <> '')          AS withApartment
     FROM customer`
  );

  const r = rows[0];
  return {
    total: toNumber(r?.total ?? null),
    employees: toNumber(r?.employees ?? null),
    residents: toNumber(r?.residents ?? null),
    withApartment: toNumber(r?.withApartment ?? null),
  };
}

export async function getRegisteredCarsPage(
  page: number = 1,
  pageSize: number = 15,
  query: string = ""
): Promise<PaginatedRegisteredCars> {
  const safePageSize = Math.max(1, Math.min(100, Math.floor(pageSize)));
  const requestedPage = Math.max(1, Math.floor(page));
  const where = searchClause(query);

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
