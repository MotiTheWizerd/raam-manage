import { KeyRound, type LucideIcon } from "lucide-react";

// Single source of truth for the reports inner side-menu. Add a report here and
// create its matching route at src/app/reports/<slug>/page.tsx — the nav and the
// /reports landing redirect both read from this list.
export type ReportDef = {
  slug: string;
  label: string;
  icon: LucideIcon;
};

export const REPORTS: ReportDef[] = [
  { slug: "lobby-keys", label: "דוח מפתחות לובי", icon: KeyRound },
];

export const reportHref = (slug: string) => `/reports/${slug}`;
