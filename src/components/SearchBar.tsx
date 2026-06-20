"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Loader2, PhoneCall, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  searchResidents,
  type ResidentSearchResult,
} from "@/app/renters/actions";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { cn } from "@/lib/cn";
import { inputBase } from "@/components/ui/Input";
import {
  useSelectedResident,
  useSetSelectedResident,
} from "@/components/PreferencesProvider";
import { SelectedResidentChip } from "@/components/SelectedResidentChip";

const TYPE_LABEL: Record<ResidentSearchResult["type"], string> = {
  owner: "בעלים",
  renter: "שוכר",
};

type Props = {
  className?: string;
};

export function SearchBar({ className }: Props) {
  const selectedResident = useSelectedResident();
  const setSelectedResident = useSetSelectedResident();

  const [q, setQ] = useState("");
  const debounced = useDebouncedValue(q, 250);

  const [results, setResults] = useState<ResidentSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);

  const trimmed = debounced.trim();
  const hasQuery = trimmed.length > 0;

  // After clearing the selected resident chip, refocus the input
  const hadResidentRef = useRef(false);
  useEffect(() => {
    if (hadResidentRef.current && !selectedResident) {
      inputRef.current?.focus();
    }
    hadResidentRef.current = !!selectedResident;
  }, [selectedResident]);

  // Fire search when debounced query changes
  useEffect(() => {
    if (!hasQuery) return;
    const reqId = ++requestIdRef.current;
    searchResidents(trimmed)
      .then((rows) => {
        if (reqId !== requestIdRef.current) return;
        setResults(rows);
        setHighlight(0);
        setLoading(false);
      })
      .catch(() => {
        if (reqId !== requestIdRef.current) return;
        setLoading(false);
      });
  }, [trimmed, hasQuery]);

  // Click-outside closes
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);

  // ESC closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function selectResult(r: ResidentSearchResult) {
    setSelectedResident({
      id: r.id,
      first_name: r.first_name,
      last_name: r.last_name,
      apartment_id: r.apartment_id,
      apartment_number: r.apartment_number,
      floor: r.floor,
      zone_name: r.zone_name,
      must_call: r.must_call,
    });
    setOpen(false);
    setQ("");
    setResults([]);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      const r = results[highlight];
      if (r) selectResult(r);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (results.length === 0) return;
      setOpen(true);
      setHighlight((h) => Math.min(results.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    }
  }

  const showPanel = open && hasQuery;

  if (selectedResident) {
    return <SelectedResidentChip className={className} />;
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Search
          size={16}
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-3 opacity-50"
        />
        <input
          ref={inputRef}
          type="search"
          value={q}
          onChange={(e) => {
            const v = e.target.value;
            setQ(v);
            setOpen(true);
            if (v.trim()) {
              setLoading(true);
            } else {
              setResults([]);
              setLoading(false);
            }
          }}
          onFocus={() => hasQuery && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="חפש דייר לפי שם או דירה..."
          aria-label="חיפוש דייר"
          className={cn(inputBase, "ps-9 pe-9")}
        />
        {loading && (
          <Loader2
            size={14}
            aria-hidden="true"
            className="absolute top-1/2 -translate-y-1/2 end-3 opacity-60 animate-spin"
          />
        )}
      </div>

      <AnimatePresence>
        {showPanel && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
            className="absolute top-full mt-1 w-full z-30 max-h-80 overflow-auto rounded-md border border-zinc-200 dark:border-zinc-700 bg-background shadow-xl py-1"
          >
            {results.length === 0 && !loading ? (
              <p className="px-3 py-2 text-sm opacity-60">אין תוצאות</p>
            ) : (
              <ul role="listbox">
                {results.map((r, i) => {
                  const isActive = i === highlight;
                  return (
                    <li
                      key={r.id}
                      role="option"
                      aria-selected={isActive}
                      onMouseEnter={() => setHighlight(i)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selectResult(r);
                      }}
                      className={cn(
                        "px-3 py-2 text-sm cursor-pointer flex items-center justify-between gap-3 transition-colors",
                        isActive
                          ? "bg-linear-to-b from-red-500 to-red-600 text-white"
                          : "text-foreground"
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium">
                          {r.first_name} {r.last_name}
                        </span>
                        {r.must_call === 1 && (
                          <span
                            className={cn(
                              "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                              isActive
                                ? "bg-white/25 text-white"
                                : "bg-red-500/15 text-red-700 dark:text-red-300"
                            )}
                          >
                            <PhoneCall size={11} aria-hidden="true" />
                            חייבים להתקשר
                          </span>
                        )}
                      </span>
                      <span
                        className={cn(
                          "flex items-center gap-2 shrink-0 text-xs",
                          isActive ? "text-white/90" : "opacity-70"
                        )}
                      >
                        <span>דירה {r.apartment_number}</span>
                        <span
                          className={cn(
                            "rounded-sm px-1.5 py-0.5 text-[10px] uppercase tracking-wide",
                            isActive
                              ? "bg-white/20"
                              : "bg-black/[0.06] dark:bg-white/[0.08]"
                          )}
                        >
                          {TYPE_LABEL[r.type]}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
