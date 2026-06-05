"use server";

import { isManager } from "@/lib/auth";
import {
  listBackups,
  runBackup,
  RETENTION,
  type BackupFile,
  type BackupKind,
} from "@/lib/backup";
import { getNextScheduledRun } from "@/lib/backup-scheduler";

export type BackupOverview = {
  files: BackupFile[];
  nextRun: string | null; // ISO
  retention: number;
};

async function buildOverview(): Promise<BackupOverview> {
  const files = await listBackups();
  const next = getNextScheduledRun();
  return {
    files,
    nextRun: next ? new Date(next).toISOString() : null,
    retention: RETENTION,
  };
}

export async function getBackupOverview(): Promise<BackupOverview> {
  if (!(await isManager())) throw new Error("אין הרשאה");
  return buildOverview();
}

export async function runBackupNow(kind: BackupKind): Promise<BackupOverview> {
  if (!(await isManager())) throw new Error("אין הרשאה");
  await runBackup(kind);
  return buildOverview();
}
