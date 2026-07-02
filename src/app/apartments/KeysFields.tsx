"use client";

import { Home, Plus, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { cn } from "@/lib/cn";

type Key = {
  id: string;
  nickname: string;
  is_default: boolean;
  is_active: boolean;
  is_in_lobby: boolean;
};

export type KeyInit = {
  nickname: string;
  is_default?: boolean | number | null;
  is_active?: boolean | number | null;
  is_in_lobby?: boolean | number | null;
};

function rid() {
  return Math.random().toString(36).slice(2);
}

function makeKey(): Key {
  return {
    id: rid(),
    nickname: "",
    is_default: false,
    is_active: true,
    is_in_lobby: true,
  };
}

function fromInit(init: KeyInit[]): Key[] {
  return init.map((k) => ({
    id: rid(),
    nickname: k.nickname ?? "",
    is_default: k.is_default === true || k.is_default === 1,
    is_active: k.is_active === true || k.is_active === 1,
    is_in_lobby:
      k.is_in_lobby === undefined || k.is_in_lobby === null
        ? true
        : k.is_in_lobby === true || k.is_in_lobby === 1,
  }));
}

export function KeysFields({
  initial,
  initialComment,
}: {
  initial?: KeyInit[];
  initialComment?: string | null;
}) {
  const [keys, setKeys] = useState<Key[]>(() => {
    if (initial && initial.length > 0) {
      const seeded = fromInit(initial);
      if (!seeded.some((k) => k.is_default)) seeded[0].is_default = true;
      return seeded;
    }
    return [];
  });

  function update(id: string, patch: Partial<Key>) {
    setKeys((ks) => ks.map((k) => (k.id === id ? { ...k, ...patch } : k)));
  }

  function setDefault(id: string) {
    setKeys((ks) => ks.map((k) => ({ ...k, is_default: k.id === id })));
  }

  function remove(id: string) {
    setKeys((ks) => {
      const next = ks.filter((k) => k.id !== id);
      // Keep a default among the survivors so events keep a fallback key.
      if (next.length > 0 && !next.some((k) => k.is_default)) {
        return next.map((k, i) => (i === 0 ? { ...k, is_default: true } : k));
      }
      return next;
    });
  }

  function toggleInLobby(id: string) {
    setKeys((ks) =>
      ks.map((k) =>
        k.id === id ? { ...k, is_in_lobby: !k.is_in_lobby } : k
      )
    );
  }

  function add() {
    setKeys((ks) => {
      const next = [...ks, makeKey()];
      if (!next.some((k) => k.is_default)) next[0].is_default = true;
      return next;
    });
  }

  const serialized = JSON.stringify(
    keys.map((k) => ({
      nickname: k.nickname.trim(),
      is_default: k.is_default,
      // Inactive was retired in favour of delete — every listed key is active.
      is_active: true,
      is_in_lobby: k.is_in_lobby,
    }))
  );

  return (
    <div className="space-y-3">
      <input type="hidden" name="keys" value={serialized} />

      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">מפתחות</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={add}
          disabled={keys.some((k) => k.nickname.trim() === "")}
          title={
            keys.some((k) => k.nickname.trim() === "")
              ? "מלא כינוי קודם"
              : undefined
          }
        >
          <Plus size={14} />
          הוסף מפתח
        </Button>
      </div>

      {keys.length > 0 && (
        <div className="space-y-2">
          {keys.map((k) => (
            <div key={k.id} className="flex items-center gap-2">
              <Input
                value={k.nickname}
                onChange={(e) => update(k.id, { nickname: e.target.value })}
                placeholder="כינוי (כניסה ראשית, מחסן, חדר כושר…)"
                className="flex-1 max-w-72"
              />
              <button
                type="button"
                onClick={() => setDefault(k.id)}
                aria-label={k.is_default ? "מפתח ברירת מחדל" : "קבע כברירת מחדל"}
                title="ברירת מחדל"
                className="p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              >
                <Star
                  size={16}
                  className={cn(
                    "transition-colors",
                    k.is_default
                      ? "fill-red-500 text-red-500"
                      : "text-zinc-400 dark:text-zinc-500"
                  )}
                />
              </button>
              <button
                type="button"
                onClick={() => toggleInLobby(k.id)}
                aria-label={k.is_in_lobby ? "בלובי" : "מחוץ ללובי"}
                title={k.is_in_lobby ? "בלובי" : "מחוץ ללובי"}
                className="p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              >
                <Home
                  size={16}
                  className={cn(
                    "transition-colors",
                    k.is_in_lobby
                      ? "text-sky-600 dark:text-sky-400"
                      : "text-zinc-400 dark:text-zinc-500"
                  )}
                />
              </button>
              <button
                type="button"
                onClick={() => remove(k.id)}
                aria-label="מחק מפתח"
                title="מחיקה"
                className="p-1.5 rounded text-zinc-400 transition-colors hover:bg-red-500/10 hover:text-red-600 dark:text-zinc-500 dark:hover:text-red-400"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-1">
        <label htmlFor="keys-comment" className="text-xs opacity-70">
          הערת מפתחות
        </label>
        <Textarea
          id="keys-comment"
          name="keys_comment"
          rows={2}
          placeholder="הערה כללית שתופיע בעמוד אירועי המפתחות"
          defaultValue={initialComment ?? ""}
        />
      </div>
    </div>
  );
}
