import { forwardRef } from "react";
import { cn } from "@/lib/cn";

const textareaBase =
  "w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm transition-colors placeholder:opacity-50 focus:outline-none focus:ring-2 focus:ring-foreground/30 focus:border-transparent disabled:opacity-50 resize-y min-h-[5rem]";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(textareaBase, className)} {...props} />;
});
