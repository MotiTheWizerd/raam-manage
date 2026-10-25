import { listCameraGroups } from "@/app/cameras/actions";
import { CameraExplorer, type CameraGroup } from "@/components/camera/CameraExplorer";
import { FLEET_CAMERAS } from "@/lib/fleet-cameras";
import { CAMERAS } from "@/lib/gates";

export const dynamic = "force-dynamic";

// Server component: every camera registry (incl. credentials) stays server-side;
// only id + name + group reach the browser. Live frames come through the
// auth-gated /api/gate-cam route, so passwords never leave the server.
//
// The side menu shows the registry groups (entrance / network / DVR) plus the
// user's own saved multi-camera groups, loaded from the DB.
export default async function CamerasPage() {
  const registryGroups: CameraGroup[] = [
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
    {
      key: "rtsp",
      label: "מצלמות RTSP",
      cameras: FLEET_CAMERAS.filter((c) => c.group === "rtsp").map((c) => ({
        id: c.id,
        name: c.name,
      })),
    },
  ];

  const savedGroups = await listCameraGroups();

  return <CameraExplorer registryGroups={registryGroups} savedGroups={savedGroups} />;
}
