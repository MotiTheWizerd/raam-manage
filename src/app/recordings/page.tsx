import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// הקלטות is hidden for now (2026-11-11, by request): nobody should use it yet,
// so every visit goes home. The feature is intact — the view, the API routes
// and src/lib/recordings.ts are untouched. To bring it back, restore this file
// from commit 943052a (git show 943052a:src/app/recordings/page.tsx) and set
// SHOW_RECORDINGS to true in src/components/Sidebar.tsx.
export default async function RecordingsPage() {
  redirect("/");
}
