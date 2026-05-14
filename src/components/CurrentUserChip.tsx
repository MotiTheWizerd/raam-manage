import { LogOut, UserCog } from "lucide-react";
import { logout } from "@/app/login/actions";

type Props = {
  lobbyistName: string;
  className?: string;
};

export function CurrentUserChip({ lobbyistName, className }: Props) {
  return (
    <div
      className={`flex items-center gap-2 h-9 rounded-md border border-black/10 dark:border-white/10 px-2.5 ${className ?? ""}`}
    >
      <UserCog size={16} aria-hidden="true" className="opacity-60 shrink-0" />
      <span className="text-sm font-medium truncate">{lobbyistName}</span>
      <form action={logout} className="contents">
        <button
          type="submit"
          aria-label="יציאה"
          title="יציאה"
          className="h-7 w-7 -me-1 rounded-md inline-flex items-center justify-center hover:bg-black/[0.06] dark:hover:bg-white/[0.08] text-foreground/70 hover:text-foreground transition-colors"
        >
          <LogOut size={14} aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
