import { DocsView } from "@/components/docs/DocsView";
import { PageHeading } from "@/components/PageHeading";

// נהלי הבניין — the human-readable side of the building manual. The same
// content (src/content/building-docs.ts) feeds the assistant's system prompt,
// so this page always shows exactly what the bot knows.
export default function DocsPage() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <header className="space-y-1">
        <PageHeading href="/docs" fallback="נהלים" />
      </header>

      <DocsView />
    </div>
  );
}
