import Image from "next/image";
import { ActiveLobbyistSelector } from "./ActiveLobbyistSelector";
import { SearchBar } from "./SearchBar";
import { ThemeToggle } from "./ThemeToggle";

export function Header() {
  return (
    <header className="h-14 shrink-0 border-b border-black/10 dark:border-white/10 flex items-center justify-between gap-4 px-4 bg-white dark:bg-black/40">
      <Image
        src="/logo.png"
        alt="רעם בטחון"
        width={279}
        height={91}
        priority
        className="h-9 w-auto shrink-0"
      />
      <div className="flex-1 flex items-center justify-center gap-3 min-w-0">
        <SearchBar className="flex-1 max-w-sm" />
        <ActiveLobbyistSelector />
      </div>
      <ThemeToggle />
    </header>
  );
}
