import { create } from "zustand";
import type { AutoOpen } from "@/lib/intercom-calls";

// Live intercom state shared across the page, fed by the call popup's 1s poll
// of /api/intercom/calls — so the calls tab's פתיחה אוטומטית switch follows a
// change made on another screen without polling on its own. Client-only;
// starts off, so the server render matches.
export const useIntercomLive = create<{ autoOpen: AutoOpen | null }>(() => ({ autoOpen: null }));
