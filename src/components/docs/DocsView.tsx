"use client";

import { BookOpen, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { DOC_SECTIONS, flattenDocs } from "@/content/building-docs";
import { cn } from "@/lib/cn";

// נהלים browser: the manual's structure (main sections → groups → procedures)
// on the start side, reading pane on the end side. Content is a static import
// (src/content/building-docs.ts) — the same tree the assistant answers from,
// so what you read here is exactly what the bot knows. Entries without content
// yet show a "coming soon" note (and are excluded from the bot's knowledge).

export function DocsView() {
  const all = useMemo(() => flattenDocs(), []);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(
    all.find((e) => e.doc.content.trim() !== "")?.doc.slug ??
      all[0]?.doc.slug ??
      null
  );
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const q = query.trim();
    if (!q) return null; // no filter
    return new Set(
      all
        .filter(
          ({ doc, group }) =>
            doc.title.includes(q) ||
            doc.content.includes(q) ||
            (group ?? "").includes(q)
        )
        .map(({ doc }) => doc.slug)
    );
  }, [all, query]);

  const selected = all.find((e) => e.doc.slug === selectedSlug) ?? null;
  const hasResults =
    matches === null ? all.length > 0 : matches.size > 0;

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start">
      {/* Manual tree */}
      <aside className="w-full shrink-0 space-y-4 md:w-72">
        <div className="relative">
          <Search
            size={15}
            className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-zinc-400"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש בנהלים…"
            className="h-9 w-full rounded-lg border border-zinc-200/80 bg-white/80 ps-9 pe-3 text-sm outline-none transition focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900/80"
          />
        </div>

        {!hasResults && (
          <div className="rounded-lg border border-dashed border-zinc-300 p-4 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            לא נמצאו נהלים תואמים
          </div>
        )}

        {DOC_SECTIONS.map((section) => {
          const sectionDocs = section.groups.flatMap((g) =>
            g.docs.filter((d) => matches === null || matches.has(d.slug))
          );
          if (sectionDocs.length === 0) return null;
          return (
            <div key={section.title} className="space-y-2">
              <div className="border-b border-zinc-200/80 px-1 pb-1.5 text-sm font-bold dark:border-zinc-700">
                {section.title}
              </div>
              {section.groups.map((group, gi) => {
                const docs = group.docs.filter(
                  (d) => matches === null || matches.has(d.slug)
                );
                if (docs.length === 0) return null;
                return (
                  <div key={group.title ?? `ungrouped-${gi}`} className="space-y-0.5">
                    {group.title && (
                      <div className="px-1 pt-1 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                        {group.title}
                      </div>
                    )}
                    {docs.map((doc) => {
                      const empty = doc.content.trim() === "";
                      return (
                        <button
                          key={doc.slug}
                          type="button"
                          onClick={() => setSelectedSlug(doc.slug)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-start text-sm transition-colors",
                            selectedSlug === doc.slug
                              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                              : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate">{doc.title}</span>
                          {empty && (
                            <span
                              className={cn(
                                "shrink-0 rounded-full px-1.5 py-0.5 text-[10px]",
                                selectedSlug === doc.slug
                                  ? "bg-white/20"
                                  : "bg-zinc-200/80 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400"
                              )}
                            >
                              בקרוב
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}
      </aside>

      {/* Reading pane */}
      <article className="min-w-0 flex-1 rounded-xl border border-zinc-200/80 bg-white/80 p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/60">
        {selected ? (
          <>
            <div className="mb-4 flex items-center gap-2 border-b border-zinc-200/80 pb-3 dark:border-zinc-700">
              <BookOpen size={18} className="shrink-0 text-zinc-400" />
              <div className="min-w-0">
                <h2 className="text-lg font-semibold leading-tight">
                  {selected.doc.title}
                </h2>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  {selected.section}
                  {selected.group ? ` · ${selected.group}` : ""}
                </div>
              </div>
            </div>
            {selected.doc.content.trim() !== "" ? (
              <div className="whitespace-pre-wrap text-sm leading-relaxed">
                {selected.doc.content}
              </div>
            ) : (
              <div className="py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
                התוכן של הנוהל הזה עדיין לא הוזן — בקרוב 📖
              </div>
            )}
          </>
        ) : (
          <div className="py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
            עדיין אין נהלים — התוכן בדרך 📖
          </div>
        )}
      </article>
    </div>
  );
}
