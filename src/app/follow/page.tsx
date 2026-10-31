import type { Metadata } from "next";
import { cameraRegistryGroups } from "@/app/cameras/registry";
import { FollowView } from "@/components/camera/FollowView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "מעקב תנועה — רעם" };

// The motion-follow wall alone, full screen — what the dock's camera button
// opens on the camera computer's screen. Shown bare (see lib/bare-pages.ts).
export default function FollowPage() {
  return <FollowView cameras={cameraRegistryGroups().flatMap((g) => g.cameras)} />;
}
