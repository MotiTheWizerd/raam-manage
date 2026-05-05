"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { label: "כללי", href: "/" },
  { label: "אזורים", href: "/zones" },
  { label: "דירות", href: "/apartments" },
  { label: "דיירים", href: "/renters" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 shrink-0 border-e border-black/10 dark:border-white/10 p-3">
      <nav className="flex flex-col gap-1 text-sm">
        {items.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`px-2 py-1.5 rounded transition-colors ${
                active
                  ? "bg-black/10 dark:bg-white/15 font-medium"
                  : "hover:bg-black/5 dark:hover:bg-white/10"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
