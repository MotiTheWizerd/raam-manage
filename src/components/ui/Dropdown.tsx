"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { inputBase } from "./Input";

export type DropdownOption = { value: string; label: string };

type Props = {
  options: DropdownOption[];
  name?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
};

export function Dropdown({
  options,
  name,
  defaultValue = "",
  value: controlledValue,
  onChange,
  placeholder = "— בחר —",
  id,
  className,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [internal, setInternal] = useState(defaultValue);
  const [highlight, setHighlight] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : internal;
  const selected = options.find((o) => o.value === value);

  // Reset highlight to current selection whenever the menu opens
  useEffect(() => {
    if (open) {
      const idx = options.findIndex((o) => o.value === value);
      setHighlight(idx >= 0 ? idx : 0);
    }
  }, [open, options, value]);

  // Auto-scroll highlighted option into view
  useEffect(() => {
    if (!open) return;
    const li = listRef.current?.children[highlight] as HTMLElement | undefined;
    li?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  // Click outside closes
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);

  // ESC closes — capture phase so we win over a parent Modal's window-level handler
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  function commit(v: string) {
    if (!isControlled) setInternal(v);
    onChange?.(v);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(options.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = options[highlight];
      if (opt) commit(opt.value);
    } else if (e.key === "Home") {
      e.preventDefault();
      setHighlight(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setHighlight(options.length - 1);
    }
  }

  return (
    <div
      ref={containerRef}
      className={cn("relative", className)}
      onKeyDown={onKeyDown}
    >
      {name && <input type="hidden" name={name} value={value} />}

      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          inputBase,
          "flex items-center justify-between gap-2 cursor-pointer text-start",
          !selected && "text-zinc-500"
        )}
      >
        <span className="truncate">{selected?.label ?? placeholder}</span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={cn(
            "shrink-0 opacity-60 transition-transform duration-150",
            open && "rotate-180"
          )}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            ref={listRef}
            role="listbox"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
            className="absolute top-full mt-1 w-full z-20 max-h-64 overflow-auto rounded-md border border-zinc-200 dark:border-zinc-700 bg-background shadow-xl py-1"
          >
            {options.map((opt, i) => {
              const isSelected = opt.value === value;
              const isActive = i === highlight;
              return (
                <li
                  key={opt.value}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setHighlight(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commit(opt.value);
                  }}
                  className={cn(
                    "px-3 py-1.5 text-sm cursor-pointer flex items-center justify-between gap-2 transition-colors",
                    isActive
                      ? "bg-linear-to-b from-red-500 to-red-600 text-white"
                      : "text-foreground"
                  )}
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected && (
                    <Check
                      size={14}
                      className={cn(
                        "shrink-0",
                        isActive ? "text-white" : "text-red-600 dark:text-red-400"
                      )}
                      aria-hidden="true"
                    />
                  )}
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
