import {
  getActivityTimeline,
  getGuestCarsToday,
  getKeysInLobby,
  getPackagesWaiting,
  getSuggestions,
  getSystemMessages,
  getWhatsAppVolume,
} from "@/lib/dashboard-queries";
import { ActivityTimelineTile } from "@/components/dashboard/ActivityTimelineTile";
import { GuestCarsTodayTile } from "@/components/dashboard/GuestCarsTodayTile";
import { KeysInLobbyTile } from "@/components/dashboard/KeysInLobbyTile";
import { PackagesWaitingTile } from "@/components/dashboard/PackagesWaitingTile";
import { SuggestionsTile } from "@/components/dashboard/SuggestionsTile";
import { SystemMessagesTile } from "@/components/dashboard/SystemMessagesTile";
import { WhatsAppVolumeTile } from "@/components/dashboard/WhatsAppVolumeTile";

export const dynamic = "force-dynamic";

export default function Dashboard() {
  const packagesWaiting = getPackagesWaiting();
  const keysInLobby = getKeysInLobby();
  const guestCarsToday = getGuestCarsToday();
  const activity = getActivityTimeline();
  const whatsapp = getWhatsAppVolume();
  const systemMessages = getSystemMessages();
  const suggestions = getSuggestions();

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">לוח בקרה</h1>
          <p className="text-sm opacity-60 mt-1">
            {new Intl.DateTimeFormat("he-IL", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            }).format(new Date())}
          </p>
        </div>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <PackagesWaitingTile data={packagesWaiting} delay={0} />
        <KeysInLobbyTile data={keysInLobby} delay={0.05} />
        <GuestCarsTodayTile data={guestCarsToday} delay={0.1} />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ActivityTimelineTile data={activity} delay={0.15} />
        <WhatsAppVolumeTile data={whatsapp} delay={0.2} />
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <SystemMessagesTile data={systemMessages} delay={0.25} />
        <SuggestionsTile data={suggestions} delay={0.3} />
      </section>
    </div>
  );
}
