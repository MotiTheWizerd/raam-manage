import "server-only";

import type { CameraCreds } from "@/lib/gates";

// The FULL reachable camera fleet — everything on the building LAN that
// served a snapshot during the session-56 sweep, beyond the 6 curated
// entrance cameras in gates.ts. Names here are PROVISIONAL (most cameras
// report no name over the network); they're placeholders for Moti to
// identify by eye in the cameras explorer and rename. Credentials stay
// server-side — only id + name + group reach the browser.
//
// Two groups:
//   network — IP cameras reachable directly (ISAPI snapshot, creds below)
//   dvr     — analog channels behind the .137 DVR (the supplier-yard boom
//             camera 'רחבת ספקים' is analog channel 24 here)
export type FleetGroup = "network" | "dvr";
export type FleetCameraDef = CameraCreds & { id: string; name: string; group: FleetGroup };

export const FLEET_CAMERAS: readonly FleetCameraDef[] = [
  { id: "net-70", name: "עמדת חוץ (70)", group: "network", host: "10.0.0.70", user: "admin", pass: "Sami0207" },
  { id: "net-71", name: "עמדת חוץ (71)", group: "network", host: "10.0.0.71", user: "admin", pass: "Sami0207" },
  { id: "net-72", name: "עמדת חוץ (72)", group: "network", host: "10.0.0.72", user: "admin", pass: "Sami0207" },
  { id: "net-73", name: "עמדת חוץ (73)", group: "network", host: "10.0.0.73", user: "admin", pass: "Sami0207" },
  { id: "net-101", name: "מצלמת רשת (101)", group: "network", host: "10.0.0.101", user: "admin", pass: "Sami0207" },
  { id: "net-102", name: "מצלמת רשת (102)", group: "network", host: "10.0.0.102", user: "admin", pass: "Sami0207" },
  { id: "net-104", name: "חצר אחורית (104)", group: "network", host: "10.0.0.104", user: "admin", pass: "Sami0207" },
  { id: "net-105", name: "מצלמת רשת (105)", group: "network", host: "10.0.0.105", user: "admin", pass: "Sami0207" },
  { id: "net-106", name: "מצלמת רשת (106)", group: "network", host: "10.0.0.106", user: "admin", pass: "Sami0207" },
  { id: "net-109", name: "מבט רחוב (109)", group: "network", host: "10.0.0.109", user: "admin", pass: "Sami0207" },
  { id: "net-111", name: "מצלמת רשת (111)", group: "network", host: "10.0.0.111", user: "admin", pass: "Sami0207" },
  { id: "net-113", name: "מצלמת רשת (113)", group: "network", host: "10.0.0.113", user: "admin", pass: "Sami0207" },
  { id: "net-114", name: "מצלמת רשת (114)", group: "network", host: "10.0.0.114", user: "admin", pass: "Sami0207" },
  { id: "net-115", name: "מצלמת רשת (115)", group: "network", host: "10.0.0.115", user: "admin", pass: "Sami0207" },
  { id: "net-116", name: "מצלמת רשת (116)", group: "network", host: "10.0.0.116", user: "admin", pass: "Sami0207" },
  { id: "net-117", name: "מצלמת רשת (117)", group: "network", host: "10.0.0.117", user: "admin", pass: "Sami0207" },
  { id: "net-118", name: "מצלמת רשת (118)", group: "network", host: "10.0.0.118", user: "admin", pass: "Sami0207" },
  { id: "net-122", name: "מצלמת רשת (122)", group: "network", host: "10.0.0.122", user: "admin", pass: "Sami0207" },
  { id: "net-123", name: "מצלמת רשת (123)", group: "network", host: "10.0.0.123", user: "admin", pass: "Sami0207" },
  { id: "net-124", name: "מצלמת רשת (124)", group: "network", host: "10.0.0.124", user: "admin", pass: "Sami0207" },
  { id: "net-125", name: "מצלמת רשת (125)", group: "network", host: "10.0.0.125", user: "admin", pass: "Sami0207" },
  { id: "net-152", name: "מינוס 1 (152)", group: "network", host: "10.0.0.152", user: "admin", pass: "Sami0207" },
  { id: "net-153", name: "מינוס 1 (153)", group: "network", host: "10.0.0.153", user: "admin", pass: "Sami0207" },
  { id: "net-154", name: "מינוס 1 (154)", group: "network", host: "10.0.0.154", user: "admin", pass: "Sami0207" },
  { id: "net-155", name: "מינוס 1 (155)", group: "network", host: "10.0.0.155", user: "admin", pass: "Sami0207" },
  { id: "net-156", name: "מינוס 1 — פחי אשפה (156)", group: "network", host: "10.0.0.156", user: "admin", pass: "Sami0207" },
  { id: "net-157", name: "מינוס 1 (157)", group: "network", host: "10.0.0.157", user: "admin", pass: "Sami0207" },
  { id: "net-158", name: "מינוס 1 (158)", group: "network", host: "10.0.0.158", user: "admin", pass: "Sami0207" },
  { id: "net-159", name: "מינוס 1 (159)", group: "network", host: "10.0.0.159", user: "admin", pass: "Sami0207" },
  { id: "net-168", name: "מינוס 1 (168)", group: "network", host: "10.0.0.168", user: "admin", pass: "Sami0207" },
  { id: "net-169", name: "מינוס 1 (169)", group: "network", host: "10.0.0.169", user: "admin", pass: "Sami0207" },
  { id: "net-173", name: "עמדת חוץ (173)", group: "network", host: "10.0.0.173", user: "admin", pass: "Sami0207" },
  { id: "net-174", name: "עמדת חוץ (174)", group: "network", host: "10.0.0.174", user: "admin", pass: "Sami0207" },
  { id: "dvr-1", name: "ערוץ DVR 1", group: "dvr", host: "10.0.0.137", user: "admin", pass: "Sami0207", path: "/ISAPI/Streaming/channels/101/picture" },
  { id: "dvr-2", name: "ערוץ DVR 2", group: "dvr", host: "10.0.0.137", user: "admin", pass: "Sami0207", path: "/ISAPI/Streaming/channels/201/picture" },
  { id: "dvr-3", name: "ערוץ DVR 3", group: "dvr", host: "10.0.0.137", user: "admin", pass: "Sami0207", path: "/ISAPI/Streaming/channels/301/picture" },
  { id: "dvr-4", name: "ערוץ DVR 4", group: "dvr", host: "10.0.0.137", user: "admin", pass: "Sami0207", path: "/ISAPI/Streaming/channels/401/picture" },
  { id: "dvr-5", name: "ערוץ DVR 5", group: "dvr", host: "10.0.0.137", user: "admin", pass: "Sami0207", path: "/ISAPI/Streaming/channels/501/picture" },
  { id: "dvr-6", name: "ערוץ DVR 6", group: "dvr", host: "10.0.0.137", user: "admin", pass: "Sami0207", path: "/ISAPI/Streaming/channels/601/picture" },
  { id: "dvr-7", name: "ערוץ DVR 7", group: "dvr", host: "10.0.0.137", user: "admin", pass: "Sami0207", path: "/ISAPI/Streaming/channels/701/picture" },
  { id: "dvr-8", name: "ערוץ DVR 8", group: "dvr", host: "10.0.0.137", user: "admin", pass: "Sami0207", path: "/ISAPI/Streaming/channels/801/picture" },
  { id: "dvr-9", name: "ערוץ DVR 9", group: "dvr", host: "10.0.0.137", user: "admin", pass: "Sami0207", path: "/ISAPI/Streaming/channels/901/picture" },
  { id: "dvr-10", name: "ערוץ DVR 10", group: "dvr", host: "10.0.0.137", user: "admin", pass: "Sami0207", path: "/ISAPI/Streaming/channels/1001/picture" },
  { id: "dvr-11", name: "ערוץ DVR 11", group: "dvr", host: "10.0.0.137", user: "admin", pass: "Sami0207", path: "/ISAPI/Streaming/channels/1101/picture" },
  { id: "dvr-12", name: "ערוץ DVR 12", group: "dvr", host: "10.0.0.137", user: "admin", pass: "Sami0207", path: "/ISAPI/Streaming/channels/1201/picture" },
  { id: "dvr-13", name: "ערוץ DVR 13", group: "dvr", host: "10.0.0.137", user: "admin", pass: "Sami0207", path: "/ISAPI/Streaming/channels/1301/picture" },
  { id: "dvr-14", name: "ערוץ DVR 14", group: "dvr", host: "10.0.0.137", user: "admin", pass: "Sami0207", path: "/ISAPI/Streaming/channels/1401/picture" },
  { id: "dvr-15", name: "ערוץ DVR 15", group: "dvr", host: "10.0.0.137", user: "admin", pass: "Sami0207", path: "/ISAPI/Streaming/channels/1501/picture" },
  { id: "dvr-16", name: "ערוץ DVR 16", group: "dvr", host: "10.0.0.137", user: "admin", pass: "Sami0207", path: "/ISAPI/Streaming/channels/1601/picture" },
  { id: "dvr-17", name: "ערוץ DVR 17", group: "dvr", host: "10.0.0.137", user: "admin", pass: "Sami0207", path: "/ISAPI/Streaming/channels/1701/picture" },
  { id: "dvr-18", name: "ערוץ DVR 18", group: "dvr", host: "10.0.0.137", user: "admin", pass: "Sami0207", path: "/ISAPI/Streaming/channels/1801/picture" },
  { id: "dvr-19", name: "ערוץ DVR 19", group: "dvr", host: "10.0.0.137", user: "admin", pass: "Sami0207", path: "/ISAPI/Streaming/channels/1901/picture" },
  { id: "dvr-20", name: "ערוץ DVR 20", group: "dvr", host: "10.0.0.137", user: "admin", pass: "Sami0207", path: "/ISAPI/Streaming/channels/2001/picture" },
  { id: "dvr-21", name: "ערוץ DVR 21", group: "dvr", host: "10.0.0.137", user: "admin", pass: "Sami0207", path: "/ISAPI/Streaming/channels/2101/picture" },
  { id: "dvr-22", name: "ערוץ DVR 22", group: "dvr", host: "10.0.0.137", user: "admin", pass: "Sami0207", path: "/ISAPI/Streaming/channels/2201/picture" },
  { id: "dvr-23", name: "ערוץ DVR 23", group: "dvr", host: "10.0.0.137", user: "admin", pass: "Sami0207", path: "/ISAPI/Streaming/channels/2301/picture" },
  { id: "dvr-24", name: "רחבת ספקים (ערוץ 24)", group: "dvr", host: "10.0.0.137", user: "admin", pass: "Sami0207", path: "/ISAPI/Streaming/channels/2401/picture" },
  { id: "dvr-25", name: "ערוץ DVR 25", group: "dvr", host: "10.0.0.137", user: "admin", pass: "Sami0207", path: "/ISAPI/Streaming/channels/2501/picture" },
  { id: "dvr-26", name: "ערוץ DVR 26", group: "dvr", host: "10.0.0.137", user: "admin", pass: "Sami0207", path: "/ISAPI/Streaming/channels/2601/picture" },
  { id: "dvr-27", name: "ערוץ DVR 27", group: "dvr", host: "10.0.0.137", user: "admin", pass: "Sami0207", path: "/ISAPI/Streaming/channels/2701/picture" },
  { id: "dvr-28", name: "ערוץ DVR 28", group: "dvr", host: "10.0.0.137", user: "admin", pass: "Sami0207", path: "/ISAPI/Streaming/channels/2801/picture" },
  { id: "dvr-29", name: "שביל כניסה רכבים (ערוץ 29)", group: "dvr", host: "10.0.0.137", user: "admin", pass: "Sami0207", path: "/ISAPI/Streaming/channels/2901/picture" },
  { id: "dvr-30", name: "ערוץ DVR 30", group: "dvr", host: "10.0.0.137", user: "admin", pass: "Sami0207", path: "/ISAPI/Streaming/channels/3001/picture" },
  { id: "dvr-31", name: "ערוץ DVR 31", group: "dvr", host: "10.0.0.137", user: "admin", pass: "Sami0207", path: "/ISAPI/Streaming/channels/3101/picture" },
  { id: "dvr-32", name: "ערוץ DVR 32", group: "dvr", host: "10.0.0.137", user: "admin", pass: "Sami0207", path: "/ISAPI/Streaming/channels/3201/picture" },
];

export function getFleetCamera(id: string): FleetCameraDef | undefined {
  return FLEET_CAMERAS.find((c) => c.id === id);
}
