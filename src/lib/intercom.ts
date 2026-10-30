// The building's Hikvision door intercom panels (DS-KD8003 "OUTDOOR STATION").
// The lobby tablet (a Hikvision indoor station) shows them as six identical
// "OUTDOOR STATION" tiles; here each gets a real name. camId is the panel's
// FLEET_CAMERAS id, so its live picture comes through /api/gate-cam like any
// other camera (credentials stay server-side).
//
// Order = the tablet's grid, right to left in RTL (.71 is its top-right tile).
// Only .71 is confirmed on the tablet so far; the other names describe what
// each panel's camera looks at until the staff names the doors.
export type IntercomPanel = {
  camId: string;
  host: string;
  name: string;
};

export const INTERCOM_PANELS: IntercomPanel[] = [
  { camId: "net-71", host: "10.0.0.71", name: "דלת זכוכית" },
  { camId: "net-70", host: "10.0.0.70", name: "אולם החניון" },
  { camId: "net-72", host: "10.0.0.72", name: "חניון — עמוד כחול" },
  { camId: "net-73", host: "10.0.0.73", name: "דלת מתכת — מכונות" },
  { camId: "net-173", host: "10.0.0.173", name: "דלת אש" },
  { camId: "net-174", host: "10.0.0.174", name: "דלת בום — אשפה וספקים" },
];
