import { getRecentOpenings, type IntercomOpening } from "@/lib/intercom-calls";

const when = new Intl.DateTimeFormat("he-IL", {
  timeZone: "Asia/Jerusalem",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function byLabel(o: IntercomOpening) {
  if (o.openedBy === "tablet") return "הטאבלט בלובי";
  if (o.openedBy === "remote") return o.lobbyist ? `${o.lobbyist} · מהמערכת` : "מהמערכת / iVMS";
  return o.openedBy ?? "לא ידוע";
}

// Who was let in: every door opening the panels reported, with the photo the
// panel's camera took at that moment (kept 30 days by the listener).
export async function IntercomOpenings() {
  const openings = await getRecentOpenings();

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-bold">פתיחות אחרונות</h2>
        <p className="text-sm opacity-60">תמונה ממצלמת העמדה ברגע פתיחת הדלת · נשמרות 30 יום</p>
      </div>
      {openings.length === 0 ? (
        <p className="text-sm opacity-60">עוד לא נרשמו פתיחות.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {openings.map((o) => (
            <figure
              key={`${o.at}-${o.name}`}
              className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              {o.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/intercom/photo?f=${encodeURIComponent(o.photo)}`}
                  alt={`פתיחה — ${o.name}`}
                  loading="lazy"
                  className="aspect-video w-full bg-zinc-800 object-cover"
                />
              ) : (
                <div className="flex aspect-video items-center justify-center bg-zinc-800 text-xs text-zinc-400">
                  אין תמונה
                </div>
              )}
              <figcaption className="space-y-0.5 px-2.5 py-2 text-xs">
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate font-bold">{o.name}</span>
                  {o.replay && (
                    <span className="shrink-0 rounded bg-amber-500/15 px-1 text-[10px] text-amber-600 dark:text-amber-400">
                      סימולציה
                    </span>
                  )}
                </div>
                <div className="tabular-nums opacity-70">{when.format(o.at)}</div>
                <div className="truncate opacity-70">{byLabel(o)}</div>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}
