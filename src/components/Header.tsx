import Image from "next/image";
import { CurrentUserChip } from "./CurrentUserChip";
import { SearchBar } from "./SearchBar";
import { ThemeToggle } from "./ThemeToggle";

type Props = {
  lobbyistName: string;
  isDark: boolean;
};

export function Header({ lobbyistName, isDark }: Props) {
  return (
    <header className="h-14 shrink-0 border-b border-black/10 dark:border-white/10 flex items-center justify-between gap-4 px-4 bg-white dark:bg-black/40">
      <div className="flex items-center gap-2 shrink-0">
        <Image
          src="/logo.png"
          alt="רעם בטחון"
          width={279}
          height={91}
          priority
          unoptimized
          className="h-9 w-auto"
        />
        <span className="text-lg font-semibold tracking-tight">
          רעם בטחון
        </span>
      </div>
      <div className="flex-1 flex items-center justify-center gap-3 min-w-0">
        <SearchBar className="flex-1 max-w-sm" />
        <CurrentUserChip lobbyistName={lobbyistName} />
      </div>
      <ThemeToggle initialIsDark={isDark} />
    </header>
  );
}
