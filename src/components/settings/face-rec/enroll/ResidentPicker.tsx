"use client";

import { Search, X } from "lucide-react";
import { type ResidentSearchResult } from "@/app/renters/actions";
import { Input } from "@/components/ui/Input";

type Props = {
  query: string;
  results: ResidentSearchResult[];
  selected: ResidentSearchResult | null;
  disabled: boolean;
  onQueryChange: (value: string) => void;
  onPick: (r: ResidentSearchResult) => void;
  onClear: () => void;
};

/** Search box + results dropdown for picking the resident to enroll. */
export function ResidentPicker({
  query,
  results,
  selected,
  disabled,
  onQueryChange,
  onPick,
  onClear,
}: Props) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 opacity-40" />
      <Input
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="חיפוש דייר לפי שם או מספר דירה…"
        className="pr-9"
        disabled={disabled}
      />
      {selected && (
        <button
          type="button"
          onClick={onClear}
          className="absolute left-2 top-1/2 -translate-y-1/2 rounded p-1 opacity-50 hover:opacity-100"
          aria-label="נקה בחירה"
        >
          <X className="size-4" />
        </button>
      )}
      {results.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-black/10 bg-white shadow-lg dark:border-white/10 dark:bg-zinc-900">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onPick(r)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-right text-sm hover:bg-black/5 dark:hover:bg-white/5"
              >
                <span>
                  {r.first_name} {r.last_name}
                </span>
                <span className="text-xs opacity-50">
                  דירה {r.apartment_number}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
