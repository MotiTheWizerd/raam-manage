"use client";

import { useSidebarLabels } from "@/components/PreferencesProvider";
import { cn } from "@/lib/cn";

/**
 * A page's <h1> that follows the (manager-editable) side-menu name.
 *
 * When a manager renames a menu item in edit mode we store the override in
 * `user_preferences.sidebar.labels` keyed by href. This heading reads the same
 * map so the page title tracks the rename automatically. Until an item is
 * actually renamed it shows `fallback` — the page's own original title — so
 * pages whose title differs from the default menu label on purpose (e.g. home:
 * menu "כללי" vs title "לוח בקרה") keep their wording until a manager changes it.
 *
 * A client component, but SSR-safe: PreferencesProvider is seeded server-side
 * with the same labels, so the server and first client render match.
 */
export function PageHeading({
  href,
  fallback,
  className,
}: {
  /** The sidebar item's href — the rename key in sidebar.labels. */
  href: string;
  /** The page's original title, shown until the menu item is renamed. */
  fallback: string;
  /** Extra classes; merges over the default `text-2xl font-semibold tracking-tight`. */
  className?: string;
}) {
  const labels = useSidebarLabels();
  return (
    <h1 className={cn("text-2xl font-semibold tracking-tight", className)}>
      {labels[href] ?? fallback}
    </h1>
  );
}
