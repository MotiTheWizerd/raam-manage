"use client";

import { Plus, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";

type Phone = {
  id: string;
  number: string;
  label: string;
  comment: string;
  is_primary: boolean;
};

export type PhoneInit = {
  number: string;
  label?: string | null;
  comment?: string | null;
  is_primary?: boolean | number | null;
};

function rid() {
  return Math.random().toString(36).slice(2);
}

function makePhone(is_primary = false): Phone {
  return { id: rid(), number: "", label: "", comment: "", is_primary };
}

function fromInit(init: PhoneInit[]): Phone[] {
  return init.map((p) => ({
    id: rid(),
    number: p.number,
    label: p.label ?? "",
    comment: p.comment ?? "",
    is_primary: p.is_primary === true || p.is_primary === 1,
  }));
}

export function PhoneFields({ initial }: { initial?: PhoneInit[] }) {
  const [phones, setPhones] = useState<Phone[]>(() => {
    if (initial && initial.length > 0) {
      const seeded = fromInit(initial);
      if (!seeded.some((p) => p.is_primary)) seeded[0].is_primary = true;
      return seeded;
    }
    return [makePhone(true)];
  });

  function update(id: string, patch: Partial<Phone>) {
    setPhones((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function setPrimary(id: string) {
    setPhones((ps) => ps.map((p) => ({ ...p, is_primary: p.id === id })));
  }

  function add() {
    setPhones((ps) => [...ps, makePhone(ps.length === 0)]);
  }

  function remove(id: string) {
    setPhones((ps) => {
      const next = ps.filter((p) => p.id !== id);
      if (next.length > 0 && !next.some((p) => p.is_primary)) {
        next[0] = { ...next[0], is_primary: true };
      }
      return next;
    });
  }

  const serialized = JSON.stringify(
    phones
      .filter((p) => p.number.trim())
      .map((p) => ({
        number: p.number.trim(),
        label: p.label.trim() || null,
        comment: p.comment.trim() || null,
        is_primary: p.is_primary,
      }))
  );

  return (
    <div className="space-y-2">
      <input type="hidden" name="phones" value={serialized} />

      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">טלפונים</span>
        <Button type="button" variant="ghost" size="sm" onClick={add}>
          <Plus size={14} />
          הוסף טלפון
        </Button>
      </div>

      <div className="space-y-2">
        {phones.map((p) => (
          <div key={p.id} className="flex items-center gap-2">
            <Input
              value={p.number}
              onChange={(e) => update(p.id, { number: e.target.value })}
              placeholder="050-1234567"
              type="tel"
              className="w-44"
            />
            <Input
              value={p.comment}
              onChange={(e) => update(p.id, { comment: e.target.value })}
              placeholder="הערה (אופציונלי)"
              className="flex-1 max-w-72"
            />
            <button
              type="button"
              onClick={() => setPrimary(p.id)}
              aria-label={p.is_primary ? "טלפון ראשי" : "קבע כראשי"}
              title="ראשי"
              className="p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              <Star
                size={16}
                className={cn(
                  "transition-colors",
                  p.is_primary
                    ? "fill-red-500 text-red-500"
                    : "text-zinc-400 dark:text-zinc-500"
                )}
              />
            </button>
            <button
              type="button"
              onClick={() => remove(p.id)}
              disabled={phones.length === 1}
              aria-label="מחק טלפון"
              className="p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors disabled:opacity-30 disabled:pointer-events-none"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
