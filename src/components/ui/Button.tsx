import { forwardRef } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "destructive";
type Size = "sm" | "md" | "lg" | "icon" | "icon-sm";

const base = cn(
  "inline-flex items-center justify-center gap-2 rounded-md font-medium select-none",
  "transition-all duration-150 ease-out",
  "disabled:opacity-50 disabled:pointer-events-none",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  "active:scale-[0.98]"
);

const variants: Record<Variant, string> = {
  primary: cn(
    "bg-linear-to-b from-red-500 to-red-700 text-white",
    "shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_2px_4px_rgba(127,29,29,0.35)]",
    "hover:from-red-500 hover:to-red-600",
    "hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_6px_16px_rgba(220,38,38,0.5)]"
  ),
  secondary: cn(
    "bg-white text-zinc-900 border border-zinc-200",
    "dark:bg-zinc-900 dark:text-zinc-50 dark:border-zinc-800",
    "shadow-sm",
    "hover:bg-zinc-50 hover:border-zinc-300",
    "dark:hover:bg-zinc-800 dark:hover:border-zinc-700"
  ),
  ghost: "text-foreground hover:bg-black/5 dark:hover:bg-white/10",
  outline: cn(
    "border border-zinc-300 dark:border-zinc-700 text-foreground bg-transparent",
    "hover:bg-zinc-50 dark:hover:bg-zinc-900/50",
    "hover:border-zinc-400 dark:hover:border-zinc-600"
  ),
  destructive: cn(
    "bg-transparent text-red-600 border border-red-300",
    "dark:text-red-400 dark:border-red-900/60",
    "hover:bg-red-50 hover:border-red-400 hover:text-red-700",
    "dark:hover:bg-red-950/30 dark:hover:border-red-800 dark:hover:text-red-300"
  ),
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-9 px-4 text-sm",
  lg: "h-10 px-5 text-base",
  icon: "h-9 w-9",
  "icon-sm": "h-8 w-8",
};

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "primary", size = "md", type = "button", className, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    />
  );
});
