import { CameraWall } from "@/components/camera/CameraWall";
import { CAMERAS } from "@/lib/gates";

export const dynamic = "force-dynamic";

// Server component: the camera registry (incl. credentials) stays server-side;
// only the id + display name reach the browser. The live frames come through
// the auth-gated /api/gate-cam route, so passwords never leave the server.
export default function CamerasPage() {
  const cameras = CAMERAS.map((cam) => ({ id: cam.id, name: cam.name }));
  return <CameraWall cameras={cameras} />;
}
