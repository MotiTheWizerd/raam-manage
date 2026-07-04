"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { GAMES, findGame, type GameStatus } from "./registry";

// The lobby arcade. A self-contained dark panel that lives inside the normal
// app chrome (header + sidebar). The little games were built LTR, so the game
// stage is wrapped dir="ltr" to preserve their layout while the menu chrome
// stays in the app's Hebrew RTL.

const STATUS_LABEL: Record<GameStatus, string> = {
  playable: "זמין",
  wip: "בקרוב",
};

export function GamesView() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const game = selectedId ? findGame(selectedId) : undefined;

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 font-mono text-zinc-100 shadow-2xl">
      {game ? (
        <>
          <header className="flex items-center justify-between border-b border-zinc-900 px-5 py-3">
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="inline-flex items-center gap-1.5 text-sm text-zinc-400 transition hover:text-zinc-100"
            >
              <ArrowRight size={15} aria-hidden="true" />
              כל המשחקים
            </button>
            <div className="text-sm text-zinc-300">
              {game.emoji} {game.name}
            </div>
            <div className="w-24" />
          </header>
          <main dir="ltr" className="flex justify-center overflow-x-auto">
            <game.component />
          </main>
        </>
      ) : (
        <GamesMenu onPick={setSelectedId} />
      )}
    </div>
  );
}

function GamesMenu({ onPick }: { onPick: (id: string) => void }) {
  return (
    <div className="px-6 py-10">
      <header className="mb-8 flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">
          פינת המשחקים
        </p>
        <h2 className="text-3xl font-bold">
          🎮{" "}
          <span className="bg-gradient-to-r from-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
            בהפסקה?
          </span>
        </h2>
        <p className="max-w-lg text-sm text-zinc-400">
          משחקים קטנים שבנינו — מוטי וקלוד. בחרו משחק ותהנו.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {GAMES.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => onPick(g.id)}
            dir="ltr"
            className="group rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 text-left transition hover:border-zinc-600 hover:bg-zinc-900"
          >
            <div
              className={`mb-4 h-1 rounded-full bg-gradient-to-r ${g.accent} opacity-80 transition group-hover:opacity-100`}
            />
            <div className="mb-3 flex items-start justify-between">
              <div className="text-4xl">{g.emoji}</div>
              <span
                className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-widest ${
                  g.status === "playable"
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-zinc-700/40 text-zinc-400"
                }`}
              >
                {STATUS_LABEL[g.status]}
              </span>
            </div>
            <h3 className="mb-1 text-2xl font-semibold">{g.name}</h3>
            <p className="text-sm text-zinc-400">{g.tagline}</p>
            <div className="mt-4 text-xs text-zinc-500 transition group-hover:text-zinc-200">
              play →
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
