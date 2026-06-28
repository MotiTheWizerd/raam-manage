"use client";

import { motion, Reorder, useDragControls } from "framer-motion";
import { Building2, Cctv, ClipboardList, Crown, GripVertical, Home, Megaphone, MessageCircle, Rows3, Settings, UserCog, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { applyOrder } from "@/lib/ordering";
import { useIsManager } from "@/components/AuthProvider";
import { useEditMode } from "@/components/EditModeProvider";
import {
  useSetSidebarLabel,
  useSetSidebarOrder,
  useSidebarCollapsed,
  useSidebarLabels,
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
  { label: "דירות", href: "/apartments", icon: Building2, managerOnly: true },
  { label: "דיירים", href: "/renters", icon: Users, managerOnly: true },
  { label: "בעלי דירות", href: "/owners", icon: Crown },
  { label: "מדריך הבניין", href: "/directory", icon: Rows3 },
  { label: "פקידי לובי", href: "/users", icon: UserCog, managerOnly: true },
  { label: "ווטסאפ", href: "/test/whatsapp", icon: MessageCircle },
  { label: "הגדרות", href: "/settings", icon: Settings, managerOnly: true },
];

const EASE = [0.16, 1, 0.3, 1] as const;

// Routes that force the sidebar collapsed for more horizontal room (e.g. the
// wide Excel-style directory). Derived from the path, so the user's saved
// preference is left untouched and restored automatically on leaving.
const FORCE_COLLAPSE_ROUTES = ["/directory"];

export function Sidebar() {
  const pathname = usePathname();
  const collapsedPref = useSidebarCollapsed();
  const isManager = useIsManager();
  const { editMode } = useEditMode();
  const order = useSidebarOrder();
  const setOrder = useSetSidebarOrder();
  const labels = useSidebarLabels();
  const setLabel = useSetSidebarLabel();

  const orderedAll = useMemo(
    () => applyOrder(items, order, (it) => it.href),
    [order]
  );
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
            <li className="px-3 pb-1 text-[11px] opacity-50 select-none leading-snug">
              גרור לסידור · ערוך את הטקסט לשינוי שם (מחיקה = ברירת מחדל)
            </li>
          )}
          {draft.map((item) => (
            <ReorderRow
              key={item.href}
              item={item}
              collapsed={collapsed}
              label={labels[item.href] ?? item.label}
              onRename={setLabel}
            />
          ))}
        </Reorder.Group>
      ) : (
        <nav className="flex flex-col gap-1 text-sm">
          {visibleItems.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            const label = labels[item.href] ?? item.label;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? label : undefined}
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
                  {label}
                </motion.span>
              </Link>
            );
          })}
        </nav>
      )}
    </motion.aside>
  );
}

// One row of the edit-mode list: drags only by the grip handle (dragListener
// off + dragControls) so the rename field stays freely editable. The text is
// uncontrolled — committed on blur/Enter; clearing it resets to the default.
function ReorderRow({
  item,
  collapsed,
  label,
  onRename,
}: {
  item: Item;
  collapsed: boolean;
  label: string;
  onRename: (href: string, label: string) => void;
}) {
  const controls = useDragControls();
  const Icon = item.icon;
  return (
    <Reorder.Item
      value={item}
      // Collapsed (icons only): drag the whole row. Expanded: drag only by the
      // grip handle so the rename field stays clickable/editable.
      dragListener={collapsed}
      dragControls={controls}
      className={cn(
        "h-9 rounded-md flex items-center gap-2 select-none",
        "bg-black/[0.03] dark:bg-white/[0.06] border border-dashed border-red-400/40 dark:border-red-400/30",
        collapsed ? "justify-center px-0 cursor-grab active:cursor-grabbing" : "px-2"
      )}
    >
      {!collapsed && (
        <button
          type="button"
          onPointerDown={(e) => controls.start(e)}
          aria-label="גרור לסידור"
          className="shrink-0 cursor-grab touch-none opacity-40 transition-opacity hover:opacity-70 active:cursor-grabbing"
        >
          <GripVertical size={15} aria-hidden="true" />
        </button>
      )}
      <Icon size={18} aria-hidden="true" className="shrink-0" />
      {!collapsed && (
        <input
          defaultValue={label}
          dir="rtl"
          aria-label={`שם הפריט ${item.label}`}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              e.currentTarget.value = label;
              e.currentTarget.blur();
            }
          }}
          onBlur={(e) => {
            const value = e.target.value.trim();
            onRename(item.href, value);
            if (!value) e.target.value = item.label; // cleared -> back to default
          }}
          className={cn(
            "min-w-0 flex-1 rounded bg-transparent px-1 text-sm font-normal outline-none",
            "focus:bg-white/70 dark:focus:bg-black/30"
          )}
        />
      )}
    </Reorder.Item>
  );
}
