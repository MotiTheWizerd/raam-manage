"use client";

import { Pagination } from "@/components/ui/Pagination";
import { LOG_FILTERS, LOG_PAGE_SIZE } from "../constants";
import { SegmentedToggle } from "../ui/SegmentedToggle";
import { FaceEventCard } from "./FaceEventCard";
import { useFaceEventsFeed } from "./useFaceEventsFeed";

export function FaceEventsLog() {
  const { filter, setFilter, page, setPage, rows, total, totalPages, loading } =
    useFaceEventsFeed();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium opacity-80">יומן כניסות מזוהות</h3>
        <SegmentedToggle
          options={LOG_FILTERS}
          value={filter}
          onChange={setFilter}
          size="sm"
        />
      </div>

      {loading && rows.length === 0 ? (
        <div className="py-8 text-center text-sm opacity-50">טוען…</div>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-black/10 px-4 py-6 text-center text-sm opacity-60 dark:border-white/10">
          עדיין אין כניסות מתועדות.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {rows.map((ev) => (
            <FaceEventCard key={ev.id} ev={ev} />
          ))}
        </div>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        pageSize={LOG_PAGE_SIZE}
        total={total}
        onPageChange={setPage}
      />
    </div>
  );
}
