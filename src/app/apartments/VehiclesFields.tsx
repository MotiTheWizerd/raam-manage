"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type Vehicle = {
  id: string;
  license_plate: string;
  color: string;
  model: string;
  notes: string;
};

export type VehicleInit = {
  license_plate: string;
  color?: string | null;
  model?: string | null;
  notes?: string | null;
};

function rid() {
  return Math.random().toString(36).slice(2);
}

function makeVehicle(): Vehicle {
  return { id: rid(), license_plate: "", color: "", model: "", notes: "" };
}

function fromInit(init: VehicleInit[]): Vehicle[] {
  return init.map((v) => ({
    id: rid(),
    license_plate: v.license_plate ?? "",
    color: v.color ?? "",
    model: v.model ?? "",
    notes: v.notes ?? "",
  }));
}

export function VehiclesFields({ initial }: { initial?: VehicleInit[] }) {
  const [vehicles, setVehicles] = useState<Vehicle[]>(() =>
    initial ? fromInit(initial) : []
  );

  function update(id: string, patch: Partial<Vehicle>) {
    setVehicles((vs) => vs.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  }

  function add() {
    setVehicles((vs) => [...vs, makeVehicle()]);
  }

  function remove(id: string) {
    setVehicles((vs) => vs.filter((v) => v.id !== id));
  }

  // Send all rows; server validates non-empty plate.
  const serialized = JSON.stringify(
    vehicles.map((v) => ({
      license_plate: v.license_plate.trim(),
      color: v.color.trim(),
      model: v.model.trim(),
      notes: v.notes.trim(),
    }))
  );

  const hasBlank = vehicles.some((v) => v.license_plate.trim() === "");

  return (
    <div className="space-y-2">
      <input type="hidden" name="vehicles" value={serialized} />

      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">רכבים</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={add}
          disabled={hasBlank}
          title={hasBlank ? "מלא מספר רישוי קודם" : undefined}
        >
          <Plus size={14} />
          הוסף רכב
        </Button>
      </div>

      {vehicles.length > 0 && (
        <div className="space-y-2">
          {vehicles.map((v) => (
            <div key={v.id} className="flex items-center gap-2">
              <Input
                value={v.license_plate}
                onChange={(e) =>
                  update(v.id, { license_plate: e.target.value })
                }
                placeholder="מספר רישוי"
                dir="ltr"
                className="w-32 text-end font-mono"
              />
              <Input
                value={v.model}
                onChange={(e) => update(v.id, { model: e.target.value })}
                placeholder="דגם"
                className="w-44"
              />
              <Input
                value={v.color}
                onChange={(e) => update(v.id, { color: e.target.value })}
                placeholder="צבע"
                className="w-28"
              />
              <Input
                value={v.notes}
                onChange={(e) => update(v.id, { notes: e.target.value })}
                placeholder="הערה (אופציונלי)"
                className="flex-1 max-w-72"
              />
              <button
                type="button"
                onClick={() => remove(v.id)}
                aria-label="מחק רכב"
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
