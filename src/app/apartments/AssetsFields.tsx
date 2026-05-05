"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type AssetKind = "parking" | "storage";

type Asset = {
  id: string;
  floor: string;
  number: string;
  notes: string;
};

export type AssetInit = {
  floor: number | string;
  number: string;
  notes?: string | null;
};

const labels: Record<
  AssetKind,
  { section: string; add: string; numberPlaceholder: string }
> = {
  parking: { section: "חניות", add: "הוסף חניה", numberPlaceholder: "120" },
  storage: { section: "מחסנים", add: "הוסף מחסן", numberPlaceholder: "12" },
};

function rid() {
  return Math.random().toString(36).slice(2);
}

function makeAsset(): Asset {
  return { id: rid(), floor: "", number: "", notes: "" };
}

function fromInit(init: AssetInit[]): Asset[] {
  return init.map((a) => ({
    id: rid(),
    floor: String(a.floor ?? ""),
    number: a.number ?? "",
    notes: a.notes ?? "",
  }));
}

export function AssetsFields({
  kind,
  initial,
}: {
  kind: AssetKind;
  initial?: AssetInit[];
}) {
  const [assets, setAssets] = useState<Asset[]>(() =>
    initial ? fromInit(initial) : []
  );
  const lbl = labels[kind];

  function update(id: string, patch: Partial<Asset>) {
    setAssets((as) => as.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  function add() {
    setAssets((as) => [...as, makeAsset()]);
  }

  function remove(id: string) {
    setAssets((as) => as.filter((a) => a.id !== id));
  }

  const serialized = JSON.stringify(
    assets
      .filter((a) => a.number.trim() !== "" && a.floor.trim() !== "")
      .map((a) => ({
        floor: parseInt(a.floor, 10),
        number: a.number.trim(),
        notes: a.notes.trim() || null,
      }))
      .filter((a) => !Number.isNaN(a.floor))
  );

  return (
    <div className="space-y-2">
      <input type="hidden" name={kind} value={serialized} />

      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{lbl.section}</span>
        <Button type="button" variant="ghost" size="sm" onClick={add}>
          <Plus size={14} />
          {lbl.add}
        </Button>
      </div>

      {assets.length > 0 && (
        <div className="space-y-2">
          {assets.map((a) => (
            <div key={a.id} className="flex items-center gap-2">
              <Input
                value={a.floor}
                onChange={(e) => update(a.id, { floor: e.target.value })}
                placeholder="קומה"
                type="number"
                className="w-20"
              />
              <Input
                value={a.number}
                onChange={(e) => update(a.id, { number: e.target.value })}
                placeholder={lbl.numberPlaceholder}
                className="w-28"
              />
              <Input
                value={a.notes}
                onChange={(e) => update(a.id, { notes: e.target.value })}
                placeholder="הערה (אופציונלי)"
                className="flex-1 max-w-72"
              />
              <button
                type="button"
                onClick={() => remove(a.id)}
                aria-label={`מחק ${kind === "parking" ? "חניה" : "מחסן"}`}
                className="p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
