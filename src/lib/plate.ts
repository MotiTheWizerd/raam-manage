/**
 * Normalize a license plate into a stable match key: strip everything that
 * isn't a digit or A–Z and uppercase the rest. This lets a manually-typed
 * plate like "123-45-678" match the camera's "12345678" (or "40E93394").
 */
export function normalizePlate(raw: string | null | undefined): string {
  return (raw ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
}
