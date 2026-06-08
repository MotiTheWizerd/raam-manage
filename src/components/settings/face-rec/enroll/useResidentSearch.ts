"use client";

import { useEffect, useState } from "react";
import {
  searchResidents,
  type ResidentSearchResult,
} from "@/app/renters/actions";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";

/**
 * Debounced resident lookup for the enroll panel. Search is suppressed while
 * disabled (staff mode) or once a resident is selected.
 */
export function useResidentSearch(enabled: boolean) {
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 250);
  const [results, setResults] = useState<ResidentSearchResult[]>([]);
  const [selected, setSelected] = useState<ResidentSearchResult | null>(null);

  useEffect(() => {
    let active = true;
    const q = debounced.trim();
    if (!enabled || !q || selected) {
      setResults([]);
      return;
    }
    searchResidents(q).then((r) => {
      if (active) setResults(r);
    });
    return () => {
      active = false;
    };
  }, [debounced, selected, enabled]);

  function onQueryChange(value: string) {
    setQuery(value);
    if (selected) setSelected(null);
  }

  function pick(r: ResidentSearchResult) {
    setSelected(r);
    setQuery(`${r.first_name} ${r.last_name}`);
    setResults([]);
  }

  function clear() {
    setSelected(null);
    setQuery("");
    setResults([]);
  }

  return { query, results, selected, onQueryChange, pick, clear };
}
