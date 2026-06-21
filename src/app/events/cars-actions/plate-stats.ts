/**
 * Lifetime visit-stats for plates, read from the SLPR `log` history, with a
 * per-plate cache. Plain module (NOT "use server"): `getPlateVisitStats` is an
 * internal helper used by the feed action, not a public endpoint.
 */

import { querySlpr } from "@/lib/slpr-mysql";
import { parseNullableNumber, sqlStr } from "./slpr-sql";
import type { PlateVisitStats } from "./types";

/** Visit stats plus the cam-3 read count used to classify the building. */
export type PlateAggregate = PlateVisitStats & { cam3Reads: number };

/** Raw row shape of the grouped stats query. */
export type PlateStatsRow = {
  LP: string | null;
  visits: string | null;
  firstSeen: string | null;
  lastSeen: string | null;
  cam3: string | null;
};

/**
 * The aggregate columns for a per-plate stats query. Shared so the feed
 * (many plates, IN-list) and the plate-check lookup (one plate, date-scoped)
 * compute visits/firstSeen/lastSeen/cam3 identically. Both callers GROUP BY LP.
 */
export const PLATE_STATS_COLUMNS = `
  LP,
  COUNT(DISTINCT FLOOR(UNIX_TIMESTAMP(LOG_DATE) / 120)) AS visits,
  MIN(LOG_DATE) AS firstSeen,
  MAX(LOG_DATE) AS lastSeen,
  SUM(CAM_ID = 3) AS cam3`;

/**
 * Per-plate stats cache. Computing lifetime stats for every plate on screen
 * (~770 over 3 days) is a near-full scan of the 65k-row `log` (~1.7s), and the
 * feed re-fetches every 10s — but a plate's stats barely move between refreshes.
 * So we cache each plate for STATS_TTL_MS and only query the DB for plates we've
 * never seen or whose entry has expired. After the first load almost every plate
 * is a cache hit, so a refresh only costs a tiny query for the new arrivals.
 *
 * Trade-off: a plate's building tag / visit count can be up to STATS_TTL_MS
 * stale — fine for a lobby view (the instant gate notifier is the live signal).
 */
const STATS_TTL_MS = 5 * 60_000;
const statsCache = new Map<string, { agg: PlateAggregate; at: number }>();

/**
 * Lifetime visit stats for the given plates, deduped by 2-minute window so the
 * twin entry cameras don't double-count. Also tallies cam-3 reads so the caller
 * can tell our-lane ("boutique") cars from the neighbour lane ("manhattan").
 * Cached per plate; only uncached/expired plates hit the DB (one grouped query).
 */
export async function getPlateVisitStats(
  plates: string[]
): Promise<Map<string, PlateAggregate>> {
  const unique = Array.from(
    new Set(plates.map((p) => p.trim()).filter((p) => p.length > 0))
  );
  if (unique.length === 0) return new Map();

  const now = Date.now();
  const map = new Map<string, PlateAggregate>();
  const stale: string[] = [];
  for (const lp of unique) {
    const hit = statsCache.get(lp);
    if (hit && now - hit.at < STATS_TTL_MS) map.set(lp, hit.agg);
    else stale.push(lp);
  }

  if (stale.length > 0) {
    const inList = stale.map(sqlStr).join(", ");
    const rows = await querySlpr<PlateStatsRow>(
      `SELECT ${PLATE_STATS_COLUMNS}
       FROM \`log\`
       WHERE LP IN (${inList})
       GROUP BY LP`
    );

    const fetched = new Map<string, PlateAggregate>();
    for (const row of rows) {
      const lp = (row.LP ?? "").trim();
      if (!lp) continue;
      fetched.set(lp, {
        visits: parseNullableNumber(row.visits) ?? 0,
        firstSeen: row.firstSeen ?? "",
        lastSeen: row.lastSeen ?? "",
        cam3Reads: parseNullableNumber(row.cam3) ?? 0,
      });
    }

    // Cache every requested plate (even ones with no row, so we don't re-query
    // them) and add them to the result.
    for (const lp of stale) {
      const agg =
        fetched.get(lp) ??
        { visits: 0, firstSeen: "", lastSeen: "", cam3Reads: 0 };
      statsCache.set(lp, { agg, at: now });
      map.set(lp, agg);
    }
  }

  return map;
}
