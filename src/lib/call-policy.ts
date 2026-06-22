// Per-apartment contact policy: what the lobby must do before sending a
// delivery or a guest up. Stored in the apartments.must_call INTEGER column as
// a code, kept under the original name so existing data needs no migration:
//   0 = none    (אין צורך להתקשר/לעדכן)
//   1 = call    (חייבים להתקשר) — the original boolean flag's "on" state
//   2 = message (לעדכן רק בהודעה)
export type CallPolicy = "none" | "call" | "message";

export const CALL_POLICY_CODES: Record<CallPolicy, number> = {
  none: 0,
  call: 1,
  message: 2,
};

export function callPolicyFromCode(
  code: number | null | undefined
): CallPolicy {
  if (code === 1) return "call";
  if (code === 2) return "message";
  return "none";
}

// Narrow a raw form value to a CallPolicy (defaults to "none").
export function parseCallPolicy(value: unknown): CallPolicy {
  return value === "call" || value === "message" ? value : "none";
}

// Long labels (forms) and short labels (badges).
export const CALL_POLICY_LABEL: Record<CallPolicy, string> = {
  none: "אין צורך להתקשר/לעדכן",
  call: "חייבים להתקשר",
  message: "לעדכן רק בהודעה",
};

export const CALL_POLICY_SHORT: Record<CallPolicy, string> = {
  none: "אין צורך",
  call: "חייבים להתקשר",
  message: "עדכון בהודעה",
};
