"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { REPORTS, reportHref } from "./reports";

// Inner side-menu listing the available reports. Sits beside the report content
// (between the main sidebar and the page) and highlights the active report.
export function ReportsNav() {
  const pathname = usePathname();

  return (
    <nav className="w-52 shrink-0 print:hidden">
      <h2 className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide opacity-50">
        דוחות
      </h2>
      <ul className="flex flex-col gap-1 text-sm">
        {REPORTS.map((r) => {
          const href = reportHref(r.slug);
          const active = pathname === href;
          const Icon = r.icon;
          return (
            <li key={r.slug}>
              <Link
                href={href}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-md px-3 transition-colors",
                  active
                    ? "bg-red-50 font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300"
                    : "text-foreground/70 hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
                )}
              >
                <Icon size={16} aria-hidden="true" className="shrink-0" />
                <span className="truncate">{r.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
