/**
 * Low-level helpers for building the raw SQL strings we hand to `querySlpr`.
 * The SLPR client takes raw SQL (no parameter binding), so every value that
 * reaches a query goes through one of these — injection safety lives here, in
 * one place.
 */

import type { PlateDateRange } from "./types";

/** Parse a length-encoded MySQL string column into a number, or null if blank. */
export function parseNullableNumber(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Escape a value into a safe single-quoted MySQL literal (querySlpr is raw SQL). */
export function sqlStr(value: string): string {
  return `'${value.slice(0, 40).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

/**
 * SQL expression that normalizes a stored LP the same way normalizePlate() does
 * on the JS side (strip dashes/spaces/dots, uppercase) so a hand-entered owner
 * plate like "12-345-67" still matches the typed key.
 */
export function normalizedLpSql(column: string): string {
  return `UPPER(REPLACE(REPLACE(REPLACE(IFNULL(${column}, ''), '-', ''), ' ', ''), '.', ''))`;
}

/** True only for a strict YYYY-MM-DD date string (from an <input type="date">). */
export function isIsoDate(value: string | null | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Build a safe `AND LOG_DATE ...` clause from a date range. Only well-formed
 * YYYY-MM-DD bounds are used (each is validated, so it can't inject); the `to`
 * day is inclusive through 23:59:59.
 */
export function buildLogDateClause(range?: PlateDateRange): string {
  const parts: string[] = [];
  if (isIsoDate(range?.from)) parts.push(`LOG_DATE >= '${range.from} 00:00:00'`);
  if (isIsoDate(range?.to)) parts.push(`LOG_DATE <= '${range.to} 23:59:59'`);
  return parts.length > 0 ? ` AND ${parts.join(" AND ")}` : "";
}
