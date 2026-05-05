import { forwardRef } from "react";
import { cn } from "@/lib/cn";

export const inputBase =
  "w-full h-9 px-3 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm transition-colors placeholder:opacity-50 focus:outline-none focus:ring-2 focus:ring-foreground/30 focus:border-transparent disabled:opacity-50";

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  /**
   * If true, Enter submits the surrounding form (browser default).
   * Default false: Enter is a no-op so multi-field forms don't submit by accident.
   */
  submitOnEnter?: boolean;
};

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { className, onKeyDown, submitOnEnter = false, ...props },
  ref
) {
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (
      e.key === "Enter" &&
      !submitOnEnter &&
      props.type !== "submit" &&
      props.type !== "button"
    ) {
      e.preventDefault();
    }
    onKeyDown?.(e);
  }

  return (
    <input
      ref={ref}
      className={cn(inputBase, className)}
      onKeyDown={handleKeyDown}
      {...props}
    />
  );
});
