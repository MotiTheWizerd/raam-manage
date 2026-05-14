import { db } from "@/lib/db";

export type DayPoint = { day: string; label: string };
export type PackagesWaitingData = {
  pending: number;
  series: (DayPoint & { incoming: number; delivered: number })[];
};
export type KeyInLobbyEvent = {
  id: number;
  apartment_number: string;
  nickname: string | null;
  since: string | null;
};
export type KeysInLobbyData = {
  count: number;
  recent: KeyInLobbyEvent[];
};
export type GuestCarEvent = {
  id: number;
  car_plate: string;
  guest_name: string;
  apartment_number: string | null;
  created_at: string;
};
export type GuestCarsTodayData = {
  count: number;
  recent: GuestCarEvent[];
};
export type ActivityTimelineData = {
  series: { hour: string; keys: number; packages: number; guests: number }[];
};
export type WhatsAppVolumeData = {
  total: number;
  series: (DayPoint & { sent: number; received: number })[];
};
export type SystemMessagesData = {
  total: number;
  byPriority: { priority: "low" | "med" | "high"; count: number }[];
};
export type SuggestionsData = {
  open: number;
  byStatus: { status: "open" | "in_progress" | "done" | "wont_fix"; count: number }[];
};

const HE_DAY_FORMATTER = new Intl.DateTimeFormat("he-IL", {
  weekday: "short",
  day: "numeric",
});

function lastNDays(n: number): DayPoint[] {
  const days: DayPoint[] = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    days.push({
      day: `${y}-${m}-${day}`,
      label: HE_DAY_FORMATTER.format(d),
    });
  }
  return days;
}

export function getPackagesWaiting(): PackagesWaitingData {
  const pending = (
    db
      .prepare(
        `SELECT COUNT(*) as n FROM packages WHERE direction = 'in' AND is_delivered = 0`
      )
      .get() as { n: number }
  ).n;

  const incomingRows = db
    .prepare(
      `SELECT date(created_at, 'localtime') as day, COUNT(*) as n
       FROM packages
       WHERE direction = 'in'
         AND date(created_at, 'localtime') >= date('now', '-6 days', 'localtime')
       GROUP BY day`
    )
    .all() as { day: string; n: number }[];

  const deliveredRows = db
    .prepare(
      `SELECT date(delivered_at, 'localtime') as day, COUNT(*) as n
       FROM packages
       WHERE is_delivered = 1
         AND delivered_at IS NOT NULL
         AND date(delivered_at, 'localtime') >= date('now', '-6 days', 'localtime')
       GROUP BY day`
    )
    .all() as { day: string; n: number }[];

  const inMap = new Map(incomingRows.map((r) => [r.day, r.n]));
  const outMap = new Map(deliveredRows.map((r) => [r.day, r.n]));

  return {
    pending,
    series: lastNDays(7).map((d) => ({
      ...d,
      incoming: inMap.get(d.day) ?? 0,
      delivered: outMap.get(d.day) ?? 0,
    })),
  };
}

export function getKeysInLobby(): KeysInLobbyData {
  const total = (
    db
      .prepare(
        `SELECT COUNT(*) as n FROM apartment_keys WHERE is_in_lobby = 1 AND is_active = 1`
      )
      .get() as { n: number }
  ).n;

  const recent = db
    .prepare(
      `SELECT
         k.id,
         k.nickname,
         a.number as apartment_number,
         (SELECT MAX(h.created_at)
            FROM apartment_keys_history h
           WHERE h.apartment_key_id = k.id AND h.is_in_lobby = 1) as since
       FROM apartment_keys k
       JOIN apartments a ON a.id = k.apartment_id
       WHERE k.is_in_lobby = 1 AND k.is_active = 1
       ORDER BY since DESC, k.id DESC
       LIMIT 5`
    )
    .all() as KeyInLobbyEvent[];

  return { count: total, recent };
}

export function getGuestCarsToday(): GuestCarsTodayData {
  const n = (
    db
      .prepare(
        `SELECT COUNT(*) as n FROM guest_parking
         WHERE date(created_at, 'localtime') = date('now', 'localtime')`
      )
      .get() as { n: number }
  ).n;

  const recent = db
    .prepare(
      `SELECT
         gp.id,
         gp.car_plate,
         gp.guest_name,
         gp.created_at,
         a.number as apartment_number
       FROM guest_parking gp
       LEFT JOIN residents r ON r.id = gp.resident_id
       LEFT JOIN apartments a ON a.id = r.apartment_id
       WHERE date(gp.created_at, 'localtime') = date('now', 'localtime')
       ORDER BY gp.created_at DESC, gp.id DESC
       LIMIT 5`
    )
    .all() as GuestCarEvent[];

  return { count: n, recent };
}

export function getActivityTimeline(): ActivityTimelineData {
  const today = `date(created_at, 'localtime') = date('now', 'localtime')`;
  const fetchHourly = (table: string) =>
    db
      .prepare(
        `SELECT strftime('%H', created_at, 'localtime') as h, COUNT(*) as n
         FROM ${table}
         WHERE ${today}
         GROUP BY h`
      )
      .all() as { h: string; n: number }[];

  const keysMap = new Map(fetchHourly("apartment_keys_history").map((r) => [r.h, r.n]));
  const pkgsMap = new Map(fetchHourly("packages").map((r) => [r.h, r.n]));
  const guestsMap = new Map(fetchHourly("guest_parking").map((r) => [r.h, r.n]));

  const series = Array.from({ length: 24 }, (_, i) => {
    const h = String(i).padStart(2, "0");
    return {
      hour: `${h}:00`,
      keys: keysMap.get(h) ?? 0,
      packages: pkgsMap.get(h) ?? 0,
      guests: guestsMap.get(h) ?? 0,
    };
  });

  return { series };
}

export function getWhatsAppVolume(): WhatsAppVolumeData {
  const rows = db
    .prepare(
      `SELECT date(created_at, 'localtime') as day, direction, COUNT(*) as n
       FROM whatsapp_messages
       WHERE date(created_at, 'localtime') >= date('now', '-6 days', 'localtime')
       GROUP BY day, direction`
    )
    .all() as { day: string; direction: "in" | "out"; n: number }[];

  const sentMap = new Map<string, number>();
  const recvMap = new Map<string, number>();
  for (const r of rows) {
    if (r.direction === "out") sentMap.set(r.day, r.n);
    else recvMap.set(r.day, r.n);
  }

  const series = lastNDays(7).map((d) => ({
    ...d,
    sent: sentMap.get(d.day) ?? 0,
    received: recvMap.get(d.day) ?? 0,
  }));

  return {
    total: series.reduce((acc, s) => acc + s.sent + s.received, 0),
    series,
  };
}

export function getSystemMessages(): SystemMessagesData {
  const rows = db
    .prepare(
      `SELECT priority, COUNT(*) as n
       FROM system_messages
       WHERE start_at <= strftime('%Y-%m-%dT%H:%M', 'now', 'localtime')
         AND end_at   >= strftime('%Y-%m-%dT%H:%M', 'now', 'localtime')
       GROUP BY priority`
    )
    .all() as { priority: "low" | "med" | "high"; n: number }[];

  const map = new Map(rows.map((r) => [r.priority, r.n]));
  const byPriority: SystemMessagesData["byPriority"] = (["high", "med", "low"] as const).map(
    (p) => ({ priority: p, count: map.get(p) ?? 0 })
  );

  return {
    total: byPriority.reduce((acc, b) => acc + b.count, 0),
    byPriority,
  };
}

export function getSuggestions(): SuggestionsData {
  const rows = db
    .prepare(`SELECT status, COUNT(*) as n FROM suggestions GROUP BY status`)
    .all() as { status: SuggestionsData["byStatus"][number]["status"]; n: number }[];

  const map = new Map(rows.map((r) => [r.status, r.n]));
  const byStatus: SuggestionsData["byStatus"] = (
    ["open", "in_progress", "done", "wont_fix"] as const
  ).map((s) => ({ status: s, count: map.get(s) ?? 0 }));

  return {
    open: map.get("open") ?? 0,
    byStatus,
  };
}
