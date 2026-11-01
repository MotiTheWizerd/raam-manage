"use client";

import { useRouter } from "next/navigation";
import { Tabs, type TabItem } from "@/components/ui/Tabs";

const INTERCOM_TABS: TabItem[] = [
  { value: "cameras", label: "מצלמות אינטרקום" },
  { value: "calls", label: "שיחות אינטרקום" },
];

// The page renders the chosen tab on the server (?tab=), so the live door feeds
// stop polling while the calls tab is open.
export function IntercomTabs({ value }: { value: string }) {
  const router = useRouter();
  return (
    <Tabs
      tabs={INTERCOM_TABS}
      value={value}
      onChange={(tab) => router.replace(`/intercom?tab=${tab}`, { scroll: false })}
    />
  );
}
