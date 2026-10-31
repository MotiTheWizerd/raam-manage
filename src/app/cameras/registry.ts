import "server-only";

import type { CameraGroup } from "@/components/camera/CameraExplorer";
import { FLEET_CAMERAS } from "@/lib/fleet-cameras";
import { CAMERAS } from "@/lib/gates";
import { INTERCOM_PANELS } from "@/lib/intercom";

const intercomIds = new Set(INTERCOM_PANELS.map((p) => p.camId));

// Every camera registry (incl. credentials) stays server-side; only id + name +
// group reach the browser. Live frames come through the auth-gated
// /api/gate-cam route, so passwords never leave the server. Feeds the /cameras
// side menu and the names on the /follow wall.
export function cameraRegistryGroups(): CameraGroup[] {
  const fleet = (group: string) =>
    FLEET_CAMERAS.filter((c) => c.group === group).map((c) => ({ id: c.id, name: c.name }));
  return [
    {
      key: "entrance",
      label: "כניסה",
      cameras: CAMERAS.map((cam) => ({ id: cam.id, name: cam.name })),
    },
    {
      // The door intercom panels, under their door names (they're also in the
      // fleet as "עמדת חוץ (N)" network cams, so they're left out of that group).
      key: "intercom",
      label: "אינטרקום",
      cameras: INTERCOM_PANELS.map((p) => ({ id: p.camId, name: p.name })),
    },
    {
      key: "network",
      label: "מצלמות רשת",
      cameras: fleet("network").filter((c) => !intercomIds.has(c.id)),
    },
    { key: "dvr", label: "ערוצי DVR", cameras: fleet("dvr") },
    { key: "nvr", label: "ערוצי NVR", cameras: fleet("nvr") },
    { key: "elevator", label: "מעליות", cameras: fleet("elevator") },
    { key: "rtsp", label: "מצלמות RTSP", cameras: fleet("rtsp") },
  ];
}
