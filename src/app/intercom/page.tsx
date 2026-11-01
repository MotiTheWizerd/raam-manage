import { PageHeading } from "@/components/PageHeading";
import { IntercomOpenings } from "@/components/intercom/IntercomOpenings";
import { IntercomSimulate } from "@/components/intercom/IntercomSimulate";
import { IntercomTabs } from "@/components/intercom/IntercomTabs";
import { IntercomWall } from "@/components/intercom/IntercomWall";
import { INTERCOM_PANELS } from "@/lib/intercom";

export const dynamic = "force-dynamic";

// The lobby intercom tablet, in the app: a live card per door panel, and the
// calls tab — every door opening with the panel's photo. Only ids and names
// reach the browser; frames come through the auth-gated /api/gate-cam route.
export default async function IntercomPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { tab } = await searchParams;
  const view = tab === "calls" ? "calls" : "cameras";
  const panels = INTERCOM_PANELS.map(({ camId, name }) => ({ camId, name }));
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <PageHeading href="/intercom" fallback="אינטרקום" />
      </header>

      <IntercomTabs value={view} />

      {view === "cameras" ? (
        <IntercomWall panels={panels} />
      ) : (
        <div className="space-y-6">
          {/* For while we test the call popup — remove after. */}
          <IntercomSimulate panels={panels} />
          <IntercomOpenings />
        </div>
      )}
    </div>
  );
}
