"use client";

import { PanelRightClose, PanelRightOpen } from "lucide-react";
import {
  useSidebarCollapsed,
  useToggleSidebar,
} from "@/components/PreferencesProvider";

export function SidebarToggle() {
  const collapsed = useSidebarCollapsed();
  const toggle = useToggleSidebar();
  const Icon = collapsed ? PanelRightOpen : PanelRightClose;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={collapsed ? "פתח תפריט" : "סגור תפריט"}
      title={collapsed ? "פתח תפריט" : "סגור תפריט"}
      className="h-8 w-8 inline-flex items-center justify-center rounded-md text-foreground/70 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
    >
      <Icon size={18} aria-hidden="true" />
    </button>
  );
}
