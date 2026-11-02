"use server";

import { isManager } from "@/lib/auth";
import { listSupplierGateLog, type SupplierGateRow } from "@/lib/supplier-gate";

export async function getSupplierGateLog(): Promise<SupplierGateRow[]> {
  if (!(await isManager())) throw new Error("אין הרשאה");
  return listSupplierGateLog();
}
