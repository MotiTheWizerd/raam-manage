"use client";

import {
  Clock,
  Database,
  Download,
  HardDriveDownload,
  Loader2,
  Server,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getBackupOverview,
  runBackupNow,
  type BackupOverview,
} from "@/app/settings/backup-actions";
import type { BackupFile, BackupKind } from "@/lib/backup";
import { Button } from "@/components/ui/Button";

const DB_META: Record<
  BackupKind,
  { label: string; description: string; icon: typeof Database }
> = {
  app: {
    label: "מסד הנתונים של המערכת",
    description: "דיירים, דירות, מפתחות, חבילות ועוד",
    icon: Database,
  },
  slpr: {
    label: "מסד נתונים של החניון (LPR)",
    description: "מערכת זיהוי הלוחיות — גיבוי לקריאה בלבד",
    icon: Server,
  },
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function DbCard({
  kind,
  files,
  retention,
  busy,
  onBackup,
}: {
  kind: BackupKind;
  files: BackupFile[];
  retention: number;
  busy: boolean;
  onBackup: () => void;
}) {
  const meta = DB_META[kind];
  const Icon = meta.icon;
  const latest = files[0];

  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10 bg-white/40 dark:bg-white/[0.02] p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-md bg-black/[0.04] dark:bg-white/[0.06] p-2">
            <Icon size={18} className="opacity-70" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">{meta.label}</h3>
            <p className="text-xs opacity-60">{meta.description}</p>
            <p className="mt-1 text-xs opacity-70">
              {latest ? (
                <>
                  גיבוי אחרון: {formatDateTime(latest.createdAt)} ·{" "}
                  {formatBytes(latest.sizeBytes)}
                </>
              ) : (
                "אין גיבוי עדיין"
              )}
            </p>
          </div>
        </div>

        <span className="shrink-0 rounded-full bg-black/[0.05] dark:bg-white/[0.08] px-2 py-0.5 text-[11px] tabular-nums opacity-70">
          {files.length}/{retention}
        </span>
      </div>

      <div>
        <Button size="sm" onClick={onBackup} disabled={busy}>
          {busy ? (
            <Loader2 size={15} className="animate-spin" aria-hidden="true" />
          ) : (
            <HardDriveDownload size={15} aria-hidden="true" />
          )}
          {busy ? "מגבה..." : "גבה עכשיו"}
        </Button>
      </div>

      {files.length > 0 && (
        <ul className="divide-y divide-black/5 dark:divide-white/5 rounded-md border border-black/10 dark:border-white/10 overflow-hidden">
          {files.map((f) => (
            <li
              key={f.name}
              className="flex items-center justify-between gap-3 px-3 py-2 text-xs hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors"
            >
              <div className="min-w-0">
                <div className="truncate font-mono opacity-80" dir="ltr">
                  {f.name}
                </div>
                <div className="opacity-50">
                  {formatDateTime(f.createdAt)} · {formatBytes(f.sizeBytes)}
                </div>
              </div>
              <a
                href={`/api/backup/download?kind=${f.kind}&name=${encodeURIComponent(
                  f.name
                )}`}
                download
                className="shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1 opacity-70 hover:opacity-100 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition"
                aria-label={`הורד ${f.name}`}
              >
                <Download size={14} aria-hidden="true" />
                הורד
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function BackupTab() {
  const [overview, setOverview] = useState<BackupOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<BackupKind | null>(null);

  useEffect(() => {
    let active = true;
    getBackupOverview()
      .then((o) => active && setOverview(o))
      .catch(
        (e) =>
          active &&
          setError(e instanceof Error ? e.message : "טעינת הגיבויים נכשלה")
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  async function handleBackup(kind: BackupKind) {
    setBusy(kind);
    try {
      const updated = await runBackupNow(kind);
      setOverview(updated);
      toast.success("הגיבוי הושלם בהצלחה");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "הגיבוי נכשל");
    } finally {
      setBusy(null);
    }
  }

  const filesFor = (kind: BackupKind) =>
    overview?.files.filter((f) => f.kind === kind) ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-medium opacity-80">גיבוי מסדי הנתונים</h2>
        <p className="text-xs opacity-60">
          גיבוי אוטומטי מתבצע מדי לילה בסביבות 01:00, נשמרים 10 הגיבויים האחרונים
          לכל מסד נתונים.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] px-4 py-2.5 text-xs opacity-80">
        <span className="inline-flex items-center gap-1.5">
          <Clock size={14} aria-hidden="true" />
          {overview?.nextRun
            ? `גיבוי אוטומטי הבא: ${formatDateTime(overview.nextRun)}`
            : "גיבוי אוטומטי לילי פעיל"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck size={14} aria-hidden="true" />
          לצפייה והורדה בלבד — אין שחזור מתוך המערכת
        </span>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-950 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      ) : loading ? (
        <div className="py-8 text-center text-sm opacity-60">טוען גיבויים...</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(["app", "slpr"] as BackupKind[]).map((kind) => (
            <DbCard
              key={kind}
              kind={kind}
              files={filesFor(kind)}
              retention={overview?.retention ?? 10}
              busy={busy === kind}
              onBackup={() => handleBackup(kind)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
