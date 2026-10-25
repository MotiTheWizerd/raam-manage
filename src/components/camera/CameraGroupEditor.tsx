"use client";

import { Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createCameraGroup,
  deleteCameraGroup,
  updateCameraGroup,
  type CameraGroup,
} from "@/app/cameras/actions";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";

export type PickGroup = { label: string; cameras: { id: string; name: string }[] };

// Create / edit a camera group: a name + a checklist of every known camera
// (grouped like the side menu, with a search filter). On save it calls the
// server action and hands the result back so the page can refresh.
export function CameraGroupEditor({
  open,
  onClose,
  pickGroups,
  editing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  pickGroups: PickGroup[];
  /** The group being edited, or null to create a new one. */
  editing: CameraGroup | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Seed the form whenever the modal opens (new or editing an existing group).
  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setSelected(new Set(editing?.cameras.map((c) => c.id) ?? []));
    setQuery("");
    setError(null);
  }, [open, editing]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return pickGroups;
    return pickGroups
      .map((g) => ({ ...g, cameras: g.cameras.filter((c) => c.name.includes(q)) }))
      .filter((g) => g.cameras.length > 0);
  }, [pickGroups, query]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function save() {
    setError(null);
    const camIds = Array.from(selected);
    startTransition(async () => {
      const res = editing
        ? await updateCameraGroup(editing.id, name, camIds)
        : await createCameraGroup(name, camIds);
      if (!res.ok) {
        setError(res.error ?? "השמירה נכשלה");
        return;
      }
      toast.success(editing ? "הקבוצה עודכנה" : "הקבוצה נוצרה");
      onSaved();
      onClose();
    });
  }

  function remove() {
    if (!editing) return;
    startTransition(async () => {
      const res = await deleteCameraGroup(editing.id);
      if (!res.ok) {
        setError(res.error ?? "המחיקה נכשלה");
        return;
      }
      toast.success("הקבוצה נמחקה");
      onSaved();
      onClose();
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "עריכת קבוצת מצלמות" : "קבוצת מצלמות חדשה"}
      size="xl"
    >
      <div className="space-y-4">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="שם הקבוצה (למשל: חניון מינוס 1)"
          maxLength={40}
          autoFocus
        />

        <div className="relative">
          <Search
            size={16}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-foreground/40"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="סינון מצלמות…"
            className="pr-9"
          />
        </div>

        <div className="max-h-[45vh] space-y-3 overflow-y-auto rounded-xl border border-black/10 p-2 dark:border-white/10">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-foreground/50">אין התאמות</p>
          ) : (
            filtered.map((group) => (
              <div key={group.label} className="flex flex-col">
                <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-foreground/40">
                  {group.label}
                </div>
                <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                  {group.cameras.map((cam) => {
                    const on = selected.has(cam.id);
                    return (
                      <button
                        key={cam.id}
                        type="button"
                        onClick={() => toggle(cam.id)}
                        className={cn(
                          "flex items-center gap-2 truncate rounded-lg px-2 py-1.5 text-right text-sm transition-colors",
                          on
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            : "text-foreground/70 hover:bg-black/5 dark:hover:bg-white/5"
                        )}
                        title={cam.name}
                      >
                        <span
                          className={cn(
                            "grid size-4 shrink-0 place-items-center rounded border text-[10px]",
                            on
                              ? "border-emerald-500 bg-emerald-500 text-white"
                              : "border-foreground/30"
                          )}
                        >
                          {on ? "✓" : ""}
                        </span>
                        <span className="truncate">{cam.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="text-sm text-foreground/50">נבחרו {selected.size}</div>
          <div className="flex items-center gap-2">
            {editing && (
              <Button variant="ghost" size="sm" onClick={remove} disabled={pending}>
                <Trash2 size={16} />
                מחק
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
              ביטול
            </Button>
            <Button size="sm" onClick={save} disabled={pending}>
              {pending ? "שומר…" : "שמור"}
            </Button>
          </div>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </Modal>
  );
}
