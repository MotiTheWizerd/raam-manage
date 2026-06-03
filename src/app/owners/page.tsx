import { getApartmentOptions, getOwners } from "./actions";
import { OwnersView } from "@/components/owners/OwnersView";

export default async function OwnersPage() {
  const [owners, apartments] = await Promise.all([getOwners(), getApartmentOptions()]);
  return <OwnersView initial={owners} apartments={apartments} />;
}
