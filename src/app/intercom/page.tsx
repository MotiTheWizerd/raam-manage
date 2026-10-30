import { PageHeading } from "@/components/PageHeading";
import { IntercomWall } from "@/components/intercom/IntercomWall";
import { INTERCOM_PANELS } from "@/lib/intercom";

export const dynamic = "force-dynamic";

// The lobby intercom tablet, in the app: a live card per door panel. Only ids
// and names reach the browser; frames come through the auth-gated
// /api/gate-cam route.
export default function IntercomPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <PageHeading href="/intercom" fallback="אינטרקום" />
      </header>

      <IntercomWall panels={INTERCOM_PANELS.map(({ camId, name }) => ({ camId, name }))} />
    </div>
  );
}
