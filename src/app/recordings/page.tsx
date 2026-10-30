import { redirect } from "next/navigation";
import { PageHeading } from "@/components/PageHeading";
import { RecordingsView } from "@/components/recordings/RecordingsView";
import { isManager } from "@/lib/auth";
import { listRecordableCameras } from "@/lib/recordings";

export const dynamic = "force-dynamic";

// הקלטות — find recorded footage by asking for it ("הלובי היום בין 14:00
// ל-16:00") instead of scrubbing through iVMS. Managers only: it's residents'
// footage, and every search is audited.
export default async function RecordingsPage() {
  if (!(await isManager())) redirect("/");
  const cameras = await listRecordableCameras();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <PageHeading href="/recordings" fallback="הקלטות" />
      </header>

      <RecordingsView cameras={cameras.map(({ id, name }) => ({ id, name }))} />
    </div>
  );
}
