"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";

type Props = {
  page: number;
  totalPages: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
  className?: string;
};

export function Pagination({
  page,
  totalPages,
  pageSize,
  total,
  onPageChange,
  disabled = false,
  className,
}: Props) {
  if (totalPages <= 1 && total <= pageSize) return null;

  const safePage = Math.min(Math.max(page, 1), Math.max(totalPages, 1));
  const firstRecord = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const lastRecord = Math.min(total, safePage * pageSize);
  const canGoPrevious = safePage > 1;
  const canGoNext = safePage < totalPages;

  return (
    <nav
      className={className}
      aria-label="ניווט בין עמודי היסטוריה"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="opacity-70">
          {firstRecord}-{lastRecord} מתוך {total}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPageChange(safePage - 1)}
            disabled={disabled || !canGoPrevious}
          >
            <ChevronRight size={14} aria-hidden="true" />
            הקודם
          </Button>
          <span className="min-w-24 text-center text-xs opacity-70">
            עמוד {safePage} מתוך {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPageChange(safePage + 1)}
            disabled={disabled || !canGoNext}
          >
            הבא
            <ChevronLeft size={14} aria-hidden="true" />
          </Button>
        </div>
      </div>
    </nav>
  );
}
