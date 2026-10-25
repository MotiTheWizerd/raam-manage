import { CameraExplorer, type CameraGroup } from "@/components/camera/CameraExplorer";
import { FLEET_CAMERAS } from "@/lib/fleet-cameras";
import { CAMERAS } from "@/lib/gates";

export const dynamic = "force-dynamic";

// Server component: every camera registry (incl. credentials) stays server-side;
// only id + name + group reach the browser. Live frames come through the
// auth-gated /api/gate-cam route, so passwords never leave the server.
//
// Three groups feed the explorer's side menu:
//   כניסה        — the 6 curated entrance cameras (gates.ts)
//   מצלמות רשת   — the wider IP-camera fleet discovered on the LAN
//   ערוצי DVR    — analog channels behind the .137 DVR (incl. רחבת ספקים ch24)
export default function CamerasPage() {
  const groups: CameraGroup[] = [
    {
      key: "entrance",
      label: "כניסה",
      cameras: CAMERAS.map((cam) => ({ id: cam.id, name: cam.name })),
    },
    {
      key: "network",
      label: "מצלמות רשת",
      cameras: FLEET_CAMERAS.filter((c) => c.group === "network").map((c) => ({
        id: c.id,
        name: c.name,
      })),
    },
    {
      key: "dvr",
      label: "ערוצי DVR",
      cameras: FLEET_CAMERAS.filter((c) => c.group === "dvr").map((c) => ({
        id: c.id,
        name: c.name,
      })),
    },
  ];

  return <CameraExplorer groups={groups} />;
}
