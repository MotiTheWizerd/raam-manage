"use client";

import { motion, Reorder } from "framer-motion";
import { Building2, Cctv, ClipboardList, Crown, FileText, GripVertical, Home, Megaphone, MessageCircle, Rows3, Settings, UserCog, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { useIsManager } from "@/components/AuthProvider";
import { useEditMode } from "@/components/EditModeProvider";
import {
  useSetSidebarOrder,
  useSidebarCollapsed,
  useSidebarOrder,
} from "@/components/PreferencesProvider";
import { SidebarToggle } from "@/components/SidebarToggle";

type Item = {
  label: string;
  href: string;
  icon: typeof Home;
  managerOnly?: boolean;
};

const items: Item[] = [
  { label: "כללי", href: "/", icon: Home },
  { label: "אירועים", href: "/events", icon: ClipboardList },
  { label: "הודעות לובי", href: "/lobby-messages", icon: Megaphone },
  { label: "מצלמות", href: "/cameras", icon: Cctv },
  { label: "דירות", href: "/apartments", icon: Building2 },
  { label: "דיירים", href: "/renters", icon: Users },
  { label: "בעלי דירות", href: "/owners", icon: Crown },
  { label: "מדריך הבניין", href: "/directory", icon: Rows3 },
  { label: "דוחות", href: "/reports", icon: FileText },
  { label: "פקידי לובי", href: "/users", icon: UserCog, managerOnly: true },
  { label: "ווטסאפ", href: "/test/whatsapp", icon: MessageCircle },
  { label: "הגדרות", href: "/settings", icon: Settings, managerOnly: true },
];

const EASE = [0.16, 1, 0.3, 1] as const;

// Routes that force the sidebar collapsed for more horizontal room (e.g. the
// wide Excel-style directory). Derived from the path, so the user's saved
// preference is left untouched and restored automatically on leaving.
const FORCE_COLLAPSE_ROUTES = ["/directory"];

// Sort the menu by the manager-chosen `order` (list of hrefs). Items missing
// from `order` (e.g. a menu entry added in a later release) keep their default
// relative position at the end, so the menu never silently drops an item.
function applyOrder(list: Item[], order: string[]): Item[] {
  if (order.length === 0) return list;
  const rank = new Map(order.map((href, i) => [href, i]));
  return list
    .map((it, i) => ({ it, i }))
    .sort((a, b) => {
      const ra = rank.get(a.it.href) ?? Number.MAX_SAFE_INTEGER;
      const rb = rank.get(b.it.href) ?? Number.MAX_SAFE_INTEGER;
      return ra === rb ? a.i - b.i : ra - rb;
    })
    .map((x) => x.it);
}

export function Sidebar() {
  const pathname = usePathname();
  const collapsedPref = useSidebarCollapsed();
  const isManager = useIsManager();
  const { editMode } = useEditMode();
  const order = useSidebarOrder();
  const setOrder = useSetSidebarOrder();

  const orderedAll = useMemo(() => applyOrder(items, order), [order]);
  const visibleItems = useMemo(
    () => orderedAll.filter((it) => !it.managerOnly || isManager),
    [orderedAll, isManager]
  );

  const forceCollapsed = FORCE_COLLAPSE_ROUTES.some((r) =>
    pathname.startsWith(r)
  );
  const collapsed = forceCollapsed || collapsedPref;
  const reordering = editMode && isManager;

  // Local draft of the order while dragging; framer's Reorder needs a
  // controlled values array. Kept in sync with the saved order otherwise.
  const [draft, setDraft] = useState<Item[]>(visibleItems);
  useEffect(() => {
    setDraft(visibleItems);
  }, [visibleItems]);

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 64 : 224 }}
      transition={{ duration: 0.2, ease: EASE }}
      className="shrink-0 border-e border-black/10 dark:border-white/10 p-2 flex flex-col gap-2 overflow-hidden"
    >
      <div
        className={cn(
          "flex items-center h-8",
          collapsed ? "justify-center" : "justify-end px-1"
        )}
      >
        {/* While a route forces the sidebar collapsed, the toggle would be
            inert — hide it. It returns automatically off the route. */}
        {!forceCollapsed && <SidebarToggle />}
      </div>

      {reordering ? (
        <Reorder.Group
          axis="y"
          values={draft}
          onReorder={(next: Item[]) => {
            setDraft(next);
            setOrder(next.map((it) => it.href));
          }}
          className="flex flex-col gap-1 text-sm list-none m-0 p-0"
        >
          {!collapsed && (
            <li className="px-3 pb-1 text-[11px] opacity-50 select-none">
              גרור לסידור התפריט
            </li>
          )}
          {draft.map((item) => {
            const Icon = item.icon;
            return (
              <Reorder.Item
                key={item.href}
                value={item}
                className={cn(
                  "h-9 rounded-md flex items-center gap-2 cursor-grab active:cursor-grabbing select-none",
                  "bg-black/[0.03] dark:bg-white/[0.06] border border-dashed border-red-400/40 dark:border-red-400/30",
                  collapsed ? "justify-center px-0" : "px-2"
                )}
              >
                {!collapsed && (
                  <GripVertical
                    size={15}
                    aria-hidden="true"
                    className="shrink-0 opacity-40"
                  />
                )}
                <Icon size={18} aria-hidden="true" className="shrink-0" />
                {!collapsed && (
                  <span className="truncate font-normal">{item.label}</span>
                )}
              </Reorder.Item>
            );
          })}
        </Reorder.Group>
      ) : (
        <nav className="flex flex-col gap-1 text-sm">
          {visibleItems.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "h-9 rounded-md flex items-center gap-3 transition-colors relative",
                  collapsed ? "justify-center px-0" : "px-3",
                  active
                    ? "bg-linear-to-b from-red-500 to-red-600 text-white shadow-sm"
                    : "text-foreground/80 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10"
                )}
              >
                <Icon size={18} aria-hidden="true" className="shrink-0" />
                <motion.span
                  initial={false}
                  animate={{
                    opacity: collapsed ? 0 : 1,
                    width: collapsed ? 0 : "auto",
                  }}
                  transition={{ duration: 0.15, ease: EASE }}
                  className={cn(
                    "truncate",
                    active ? "font-medium" : "font-normal"
                  )}
                >
                  {item.label}
                </motion.span>
              </Link>
            );
          })}
        </nav>
      )}
    </motion.aside>
  );
}
