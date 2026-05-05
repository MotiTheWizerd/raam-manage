import Image from "next/image";
import { ThemeToggle } from "./ThemeToggle";

export function Header() {
  return (
    <header className="h-14 shrink-0 border-b border-black/10 dark:border-white/10 flex items-center justify-between px-4 bg-white dark:bg-black/40">
      <Image
        src="/logo.png"
        alt="רעם בטחון"
        width={279}
        height={91}
        priority
        className="h-9 w-auto"
      />
      <ThemeToggle />
    </header>
  );
}
