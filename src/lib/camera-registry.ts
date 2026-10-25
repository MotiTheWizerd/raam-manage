import "server-only";

import { FLEET_CAMERAS } from "@/lib/fleet-cameras";
import { CAMERAS } from "@/lib/gates";

// The single flat list of EVERY camera the app knows — the curated entrance
// cameras (gates.ts) plus the discovered fleet (fleet-cameras.ts). Used to
// validate camera-group membership and to resolve an id to its display name.
// Credentials never appear here; only id + name.
export type CameraOption = { id: string; name: string };

export const ALL_CAMERAS: readonly CameraOption[] = [
  ...CAMERAS.map((c) => ({ id: c.id, name: c.name })),
  ...FLEET_CAMERAS.map((c) => ({ id: c.id, name: c.name })),
];

const BY_ID = new Map(ALL_CAMERAS.map((c) => [c.id, c]));

export function isKnownCamera(id: string): boolean {
  return BY_ID.has(id);
}

export function cameraName(id: string): string | undefined {
  return BY_ID.get(id)?.name;
}
