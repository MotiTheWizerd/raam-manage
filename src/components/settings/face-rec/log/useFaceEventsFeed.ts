"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getFaceEventsPage,
  type FaceEventFilter,
  type FaceEventRow,
} from "@/app/settings/face-actions";
import { LOG_PAGE_SIZE, LOG_REFRESH_MS } from "../constants";

/**
 * Paged entry-log feed. Keeps the first page live (auto-refresh) so new
 * appearances show up without a manual reload; switching filter resets to
 * page 1.
 */
export function useFaceEventsFeed() {
  const [filter, setFilterState] = useState<FaceEventFilter>("all");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<FaceEventRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await getFaceEventsPage(page, LOG_PAGE_SIZE, filter);
    setRows(res.rows);
    setTotal(res.total);
    setTotalPages(res.totalPages);
    setLoading(false);
  }, [page, filter]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // Keep the first page live so new entries appear without a manual refresh.
  useEffect(() => {
    if (page !== 1) return;
    const t = setInterval(load, LOG_REFRESH_MS);
    return () => clearInterval(t);
  }, [page, load]);

  function setFilter(next: FaceEventFilter) {
    setFilterState(next);
    setPage(1);
  }

  return { filter, setFilter, page, setPage, rows, total, totalPages, loading };
}
