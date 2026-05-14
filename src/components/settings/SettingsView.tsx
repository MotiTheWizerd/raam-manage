"use client";

import { useEffect, useState } from "react";
import { getOpenSuggestionCount } from "@/app/settings/suggestions-actions";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { onSuggestionsChanged } from "@/lib/suggestions-events";
import { SuggestionsTab } from "./SuggestionsTab";
import { SystemMessagesTab } from "./SystemMessagesTab";
import { ZonesTab } from "./ZonesTab";

export function SettingsView() {
  const [tab, setTab] = useState<string>("system-messages");
  const [openCount, setOpenCount] = useState<number>(0);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let active = true;
    getOpenSuggestionCount().then((c) => {
      if (active) setOpenCount(c);
    });
    return () => {
      active = false;
    };
  }, [refreshTick]);

  useEffect(() => {
    const bump = () => setRefreshTick((t) => t + 1);
    window.addEventListener("focus", bump);
    const unsubscribe = onSuggestionsChanged(bump);
    return () => {
      window.removeEventListener("focus", bump);
      unsubscribe();
    };
  }, []);

  const tabs: TabItem[] = [
    { value: "system-messages", label: "הודעות מערכת" },
    { value: "suggestions", label: "הצעות ייעול", badge: openCount },
    { value: "zones", label: "אזורים" },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">הגדרות</h1>
      </header>

      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      <section>
        {tab === "system-messages" && <SystemMessagesTab />}
        {tab === "suggestions" && <SuggestionsTab />}
        {tab === "zones" && <ZonesTab />}
      </section>
    </div>
  );
}
