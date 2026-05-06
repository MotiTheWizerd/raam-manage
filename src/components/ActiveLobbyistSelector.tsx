"use client";

import { UserCog } from "lucide-react";
import { useEffect, useState } from "react";
import {
  getActiveLobbyists,
  type LobbyistOption,
} from "@/app/users/actions";
import {
  useActiveLobbyist,
  useSetActiveLobbyist,
} from "@/components/PreferencesProvider";
import { Dropdown } from "@/components/ui/Dropdown";
import { cn } from "@/lib/cn";

type Props = {
  className?: string;
};

export function ActiveLobbyistSelector({ className }: Props) {
  const activeLobbyist = useActiveLobbyist();
  const setActiveLobbyist = useSetActiveLobbyist();
  const [lobbyists, setLobbyists] = useState<LobbyistOption[] | null>(null);

  useEffect(() => {
    let active = true;
    getActiveLobbyists().then((rows) => {
      if (active) setLobbyists(rows);
    });
    return () => {
      active = false;
    };
  }, []);

  // If the active lobbyist was deactivated/renamed, reflect the change.
  // Skip while the list is still loading — empty list during fetch
  // would otherwise clear the persisted selection on every mount.
  useEffect(() => {
    if (lobbyists === null) return;
    if (!activeLobbyist) return;
    const match = lobbyists.find((l) => l.id === activeLobbyist.id);
    if (!match) {
      setActiveLobbyist(null);
    } else if (match.lobbyist_name !== activeLobbyist.lobbyist_name) {
      setActiveLobbyist({
        id: match.id,
        lobbyist_name: match.lobbyist_name,
      });
    }
  }, [lobbyists, activeLobbyist, setActiveLobbyist]);

  const value = activeLobbyist ? String(activeLobbyist.id) : "";

  const options = [
    { value: "", label: "— ללא סדרן —" },
    ...(lobbyists ?? []).map((l) => ({
      value: String(l.id),
      label: l.lobbyist_name,
    })),
  ];

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <UserCog
        size={16}
        aria-hidden="true"
        className="opacity-60 shrink-0"
      />
      <Dropdown
        value={value}
        onChange={(v) => {
          if (!v) {
            setActiveLobbyist(null);
            return;
          }
          const id = parseInt(v, 10);
          const match = lobbyists?.find((l) => l.id === id);
          if (match) {
            setActiveLobbyist({
              id: match.id,
              lobbyist_name: match.lobbyist_name,
            });
          }
        }}
        options={options}
        placeholder="סדרן פעיל"
        className="w-44"
      />
    </div>
  );
}
