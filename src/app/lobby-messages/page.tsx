import { LobbyMessagesView } from "@/components/lobby-messages/LobbyMessagesView";

export const dynamic = "force-dynamic";

// Lobby messages live in the normal logged-in area (every lobby staff member
// can see them); creating/editing stays manager-only, enforced in the actions.
export default function LobbyMessagesPage() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">הודעות לובי</h1>
      </header>

      <LobbyMessagesView />
    </div>
  );
}
