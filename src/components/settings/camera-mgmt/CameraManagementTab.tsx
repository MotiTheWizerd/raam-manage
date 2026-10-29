"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { CameraEditor } from "./CameraEditor";

// ניהול מצלמות — a side menu of camera-admin tools. First tool: editing the
// camera registry (names + locations). More (recorders, tracing) slot in here.
const SECTIONS = [{ value: "edit", label: "עריכת מצלמות", icon: Pencil }] as const;

type Section = (typeof SECTIONS)[number]["value"];

export function CameraManagementTab() {
  const [section, setSection] = useState<Section>("edit");

  return (
    <div className="grid gap-6 md:grid-cols-[11rem_minmax(0,1fr)]">
      <nav className="flex md:flex-col gap-1">
        {SECTIONS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => setSection(value)}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-start transition-colors",
              section === value
                ? "bg-black/5 dark:bg-white/10 font-medium"
                : "opacity-70 hover:opacity-100 hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
            )}
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </button>
        ))}
      </nav>

      <div>{section === "edit" && <CameraEditor />}</div>
    </div>
  );
}
