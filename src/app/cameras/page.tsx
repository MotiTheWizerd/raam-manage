import { listCameraGroups } from "@/app/cameras/actions";
import { cameraRegistryGroups } from "@/app/cameras/registry";
import { CameraExplorer } from "@/components/camera/CameraExplorer";

export const dynamic = "force-dynamic";

// Server component. The side menu shows the registry groups (entrance / network
// / DVR, see registry.ts) plus the user's own saved multi-camera groups, loaded
// from the DB.
export default async function CamerasPage() {
  const savedGroups = await listCameraGroups();

  return <CameraExplorer registryGroups={cameraRegistryGroups()} savedGroups={savedGroups} />;
}
