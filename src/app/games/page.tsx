import { GamesView } from "@/components/games/GamesView";
import { PageHeading } from "@/components/PageHeading";

export default function GamesPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeading href="/games" fallback="משחקים" />
      <GamesView />
    </div>
  );
}
