import { redirect } from "next/navigation";
import { isManager } from "@/lib/auth";
import { SettingsView } from "@/components/settings/SettingsView";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  if (!(await isManager())) redirect("/");
  return <SettingsView />;
}
