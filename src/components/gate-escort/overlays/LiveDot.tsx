import { cn } from "@/lib/cn";

/** Top-corner live indicator + active camera label. */
export function LiveDot({ label, live }: { label?: string; live: boolean }) {
  return (
    <div className="absolute top-2 right-2 flex items-center gap-1.5 rounded-full bg-black/50 px-2 py-0.5">
      <span
        className={cn(
          "size-2 animate-pulse rounded-full",
          live ? "bg-emerald-400" : "bg-red-500"
        )}
      />
      <span className="text-xs font-medium text-white">{label}</span>
    </div>
  );
}
