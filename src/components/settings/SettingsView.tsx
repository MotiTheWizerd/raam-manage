"use client";

import { useState } from "react";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { SystemMessagesTab } from "./SystemMessagesTab";

// SystemMessagesTab now contains the full CRUD; tab system reused.

const TABS: TabItem[] = [
  { value: "system-messages", label: "הודעות מערכת" },
];

export function SettingsView() {
  const [tab, setTab] = useState<string>("system-messages");

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">הגדרות</h1>
      </header>

      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      <section>{tab === "system-messages" && <SystemMessagesTab />}</section>
    </div>
  );
}
