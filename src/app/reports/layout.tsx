import type { ReactNode } from "react";
import { ReportsNav } from "./ReportsNav";

export default function ReportsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-6">
      <ReportsNav />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
