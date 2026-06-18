"use client";

import {
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

/**
 * A read-only, Excel-looking data grid: grey sticky header, full gridlines,
 * row numbers down the (RTL) start edge with a sticky first column, and
 * click + arrow-key cell selection. Built to feel familiar to non-technical
 * staff who live in spreadsheets — not an editable sheet.
 *
 * Generic over the row type; columns describe how to render each cell. Sorting
 * is optional and page-controlled (pass sortKey/sortDir/onSort).
 */

export type SheetColumn<T> = {
  /** Stable identifier — also the default sort key. */
  key: string;
  /** Column header content (usually a Hebrew label). */
  header: ReactNode;
  /** Cell content; defaults to String(row[key]) when omitted. */
  render?: (row: T, rowIndex: number) => ReactNode;
  /** Horizontal alignment of the cell content. */
  align?: "start" | "center" | "end";
  /** Optional fixed width (e.g. "8rem" or 120). */
  width?: number | string;
  /** Cap how wide the column grows; content wraps instead of stretching. */
  maxWidth?: number | string;
  /** Extra classes for the body cells in this column. */
  cellClassName?: string;
  /** When true (and onSort is provided), the header is a sort button. */
  sortable?: boolean;
};

export type SheetSortDir = "asc" | "desc";

type Props<T> = {
  columns: SheetColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string | number;
  /** Active sort column key, for the header indicator. */
  sortKey?: string;
  sortDir?: SheetSortDir;
  /** Called when a sortable header is clicked. */
  onSort?: (key: string) => void;
  /** Wrapper classes (e.g. max-height for the scroll area). */
  className?: string;
  /** Shown when there are no rows. */
  emptyText?: string;
  /**
   * Rows whose content is taller than this (px) collapse to it with a fade and
   * a one-click expand toggle. Set to 0 to disable clamping. Default 100.
   */
  maxCellHeight?: number;
};

function setsEqual(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

const ALIGN_CLASS: Record<NonNullable<SheetColumn<unknown>["align"]>, string> = {
  start: "text-start",
  center: "text-center",
  end: "text-end",
};

// The grid is a forced "light island" — white cells, grey header, dark text —
// in BOTH themes, so it always reads like a real Excel sheet (Moti's call).
const CELL_BORDER = "border-b border-e border-zinc-300";
const HEADER_BG = "bg-zinc-100";

export function SheetTable<T>({
  columns,
  rows,
  rowKey,
  sortKey,
  sortDir,
  onSort,
  className,
  emptyText = "אין נתונים להצגה",
  maxCellHeight = 100,
}: Props<T>) {
  // Selected cell as [rowIndex, colIndex]; null = nothing selected.
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(
    null
  );
  // Rows tall enough to be clamped, and which of those the user has opened.
  const [overflowing, setOverflowing] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedCellRef = useRef<HTMLTableCellElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  const colCount = columns.length;
  const rowCount = rows.length;
  const clampEnabled = maxCellHeight > 0;

  const toggleExpand = useCallback((r: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });
  }, []);

  // Detect which rows have any cell taller than the clamp. scrollHeight reports
  // the FULL content height regardless of the clamp, so this stays correct
  // whether a row is currently collapsed or expanded.
  const measure = useCallback(() => {
    if (!clampEnabled) return;
    const root = tableRef.current;
    if (!root) return;
    const next = new Set<number>();
    root.querySelectorAll<HTMLElement>("[data-sheet-cell]").forEach((el) => {
      if (el.scrollHeight - maxCellHeight > 1) {
        const r = Number(el.dataset.row);
        if (!Number.isNaN(r)) next.add(r);
      }
    });
    setOverflowing((prev) => (setsEqual(prev, next) ? prev : next));
  }, [clampEnabled, maxCellHeight]);

  useLayoutEffect(() => {
    measure();
  }, [measure, rows]);

  // Re-measure on resize (wrapping changes cell heights).
  useEffect(() => {
    if (!clampEnabled) return;
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [clampEnabled, measure]);

  // Keyboard navigation. In RTL the columns run right-to-left, so the visual
  // ArrowRight moves toward column 0 and ArrowLeft toward the last column.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!selected) return;
      let { r, c } = selected;
      switch (e.key) {
        case "ArrowUp":
          r -= 1;
          break;
        case "ArrowDown":
          r += 1;
          break;
        case "ArrowRight":
          c -= 1;
          break;
        case "ArrowLeft":
          c += 1;
          break;
        default:
          return;
      }
      e.preventDefault();
      r = Math.max(0, Math.min(rowCount - 1, r));
      c = Math.max(0, Math.min(colCount - 1, c));
      setSelected({ r, c });
    },
    [selected, rowCount, colCount]
  );

  // Keep the selected cell in view as it moves under the sticky header/column.
  useEffect(() => {
    selectedCellRef.current?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }, [selected]);

  if (rowCount === 0) {
    return (
      <div className="rounded-lg border border-dashed border-black/10 p-8 text-center text-sm opacity-60 dark:border-white/10">
        {emptyText}
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className={cn(
        "overflow-auto rounded-lg border border-zinc-300 bg-white text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40",
        className
      )}
    >
      <table ref={tableRef} className="border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            {/* Corner cell above the row numbers. */}
            <th
              className={cn(
                "sticky start-0 top-0 z-30 w-10 min-w-10",
                CELL_BORDER,
                HEADER_BG
              )}
            />
            {columns.map((col) => {
              const active = sortKey === col.key;
              const Icon: LucideIcon = active
                ? sortDir === "desc"
                  ? ChevronDown
                  : ChevronUp
                : ChevronsUpDown;
              const canSort = col.sortable && onSort;
              return (
                <th
                  key={col.key}
                  style={col.width ? { width: col.width } : undefined}
                  className={cn(
                    "sticky top-0 z-20 px-0 py-0 text-xs font-semibold uppercase tracking-wide text-zinc-600",
                    CELL_BORDER,
                    HEADER_BG,
                    ALIGN_CLASS[col.align ?? "start"]
                  )}
                >
                  {canSort ? (
                    <button
                      type="button"
                      onClick={() => onSort(col.key)}
                      className={cn(
                        "inline-flex w-full items-center gap-1.5 px-3 py-2 transition-colors hover:bg-zinc-200",
                        col.align === "center" && "justify-center",
                        col.align === "end" && "justify-end"
                      )}
                    >
                      <span>{col.header}</span>
                      <Icon
                        size={12}
                        aria-hidden="true"
                        className={cn("shrink-0", active ? "opacity-90" : "opacity-40")}
                      />
                    </button>
                  ) : (
                    <div className="px-3 py-2">{col.header}</div>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => {
            const isOverflowing = overflowing.has(r);
            const isExpanded = expanded.has(r);
            const clamp = clampEnabled && isOverflowing && !isExpanded;
            return (
            <tr key={rowKey(row, r)} className="group">
              {/* Row number — sticky grey header column, like Excel. Doubles as
                  the expand toggle when the row is clamped. */}
              <td
                className={cn(
                  "sticky start-0 z-10 select-none px-1 py-2 align-top text-center text-xs tabular-nums text-zinc-500",
                  CELL_BORDER,
                  HEADER_BG
                )}
              >
                <div className="flex flex-col items-center gap-0.5">
                  <span>{r + 1}</span>
                  {isOverflowing && (
                    <button
                      type="button"
                      onClick={() => toggleExpand(r)}
                      aria-label={isExpanded ? "כווץ שורה" : "הרחב שורה"}
                      aria-expanded={isExpanded}
                      title={isExpanded ? "כווץ" : "הצג הכול"}
                      className="inline-flex h-5 w-5 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-zinc-800"
                    >
                      {isExpanded ? (
                        <ChevronUp size={14} />
                      ) : (
                        <ChevronDown size={14} />
                      )}
                    </button>
                  )}
                </div>
              </td>
              {columns.map((col, c) => {
                const isSelected = selected?.r === r && selected?.c === c;
                const content = col.render
                  ? col.render(row, r)
                  : String((row as Record<string, unknown>)[col.key] ?? "");
                return (
                  <td
                    key={col.key}
                    ref={isSelected ? selectedCellRef : undefined}
                    onClick={() => {
                      setSelected({ r, c });
                      // Focus the grid so arrow-key nav works even after
                      // clicking a cell that contains a link.
                      scrollRef.current?.focus({ preventScroll: true });
                    }}
                    className={cn(
                      "bg-white px-3 py-2 align-top transition-colors group-hover:bg-zinc-50",
                      CELL_BORDER,
                      ALIGN_CLASS[col.align ?? "start"],
                      col.cellClassName,
                      isSelected &&
                        "bg-blue-50 ring-2 ring-inset ring-blue-500 group-hover:bg-blue-50"
                    )}
                  >
                    <div
                      data-sheet-cell
                      data-row={r}
                      className={cn(
                        "relative break-words",
                        clamp && "overflow-hidden"
                      )}
                      style={{
                        ...(col.maxWidth ? { maxWidth: col.maxWidth } : null),
                        ...(clamp ? { maxHeight: maxCellHeight } : null),
                      }}
                    >
                      {content}
                      {clamp && (
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-white to-transparent group-hover:from-zinc-50" />
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
