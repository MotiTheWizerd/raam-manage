import { db } from "@/lib/db";
import { LobbyKeysReport, type LobbyKeyRow } from "./LobbyKeysReport";

export const dynamic = "force-dynamic";

export default async function LobbyKeysReportPage() {
  // Every active key, joined to its apartment and to its most recent history
  // row (the last status change — who moved it in/out of the lobby and when).
  // The client filters by lobby status (in / out / all); is_in_lobby carries
  // the current location.
  const rows = db
    .prepare(
      `SELECT
         k.id,
         k.nickname,
         k.is_default,
         k.is_in_lobby,
         a.id            AS apartment_id,
         a.number        AS apartment_number,
         a.floor         AS floor,
         z.name          AS zone_name,
         h.created_at    AS since,
         h.lobbyist_name AS last_lobbyist,
         h.comment       AS comment
       FROM apartment_keys k
       JOIN apartments a ON a.id = k.apartment_id
       LEFT JOIN zones z ON z.id = a.zone_id
       LEFT JOIN apartment_keys_history h ON h.id = (
         SELECT h2.id
         FROM apartment_keys_history h2
         WHERE h2.apartment_key_id = k.id
         ORDER BY h2.created_at DESC, h2.id DESC
         LIMIT 1
       )
       WHERE k.is_active = 1
       ORDER BY a.number, k.id`
    )
    .all() as LobbyKeyRow[];

  return <LobbyKeysReport rows={rows} />;
}
