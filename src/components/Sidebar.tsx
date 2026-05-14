"use client";

import { motion } from "framer-motion";
import { Building2, ClipboardList, Home, MessageCircle, Settings, UserCog, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { useIsManager } from "@/components/AuthProvider";
import { useSidebarCollapsed } from "@/components/PreferencesProvider";
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
  { label: "דירות", href: "/apartments", icon: Building2 },
  { label: "דיירים", href: "/renters", icon: Users },
  { label: "פקידים", href: "/users", icon: UserCog, managerOnly: true },
  { label: "ווטסאפ", href: "/test/whatsapp", icon: MessageCircle },
  { label: "הגדרות", href: "/settings", icon: Settings },
];

const EASE = [0.16, 1, 0.3, 1] as const;

export function Sidebar() {
  const pathname = usePathname();
  const collapsed = useSidebarCollapsed();
  const isManager = useIsManager();
  const visibleItems = items.filter((it) => !it.managerOnly || isManager);

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
        <SidebarToggle />
      </div>

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
    </motion.aside>
  );
}
