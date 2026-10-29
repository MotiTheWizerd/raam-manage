"use client";

import { Check, Pencil, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  createCameraGroup,
  deleteCameraGroup,
  getCameraGroups,
  renameCameraGroup,
  type CameraGroup,
} from "@/app/settings/camera-registry-actions";
import { useIsManager } from "@/components/AuthProvider";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";

// Building areas (parking, lobby, gym…) that cameras are sorted into. Cameras
// are assigned on their cards in עריכת מצלמות; here the groups themselves.
export function CameraGroupsManager() {
  const isManager = useIsManager();
  const [groups, setGroups] = useState<CameraGroup[] | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<CameraGroup | null>(null);

  useEffect(() => {
    let active = true;
    getCameraGroups().then((rows) => {
      if (active) setGroups(rows);
    });
    return () => {
      active = false;
    };
  }, [refreshTick]);

  const refresh = () => setRefreshTick((t) => t + 1);

  async function add() {
    setError(null);
    const res = await createCameraGroup(newName);
    if (!res.ok) return setError(res.error ?? "שמירה נכשלה");
    setNewName("");
    refresh();
  }

  if (groups === null) {
    return <div className="text-sm opacity-60 py-8 text-center">טוען...</div>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-medium opacity-80">
        {groups.length === 0 ? "אין קבוצות" : `${groups.length} קבוצות`}
      </h2>

      {isManager && (
        <div className="flex items-center gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && newName.trim() && add()}
            placeholder="שם קבוצה חדשה (למשל: חניון מינוס 1)"
            className="max-w-xs"
          />
          <Button size="sm" onClick={add} disabled={!newName.trim()}>
            הוסף
          </Button>
          {error && <span className="text-xs text-red-500">{error}</span>}
        </div>
      )}

      {groups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-black/10 dark:border-white/10 p-8 text-center text-sm opacity-60">
          אין קבוצות עדיין. הוסף את הקבוצה הראשונה.
        </div>
      ) : (
        <ul className="border border-black/10 dark:border-white/10 rounded-lg divide-y divide-black/10 dark:divide-white/10">
          {groups.map((g) => (
            <GroupRow key={g.id} group={g} canEdit={isManager} onChanged={refresh} onDelete={setToDelete} />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="מחיקת קבוצה"
        description={
          toDelete
            ? `למחוק את "${toDelete.name}"? המצלמות עצמן לא יימחקו, רק השיוך שלהן לקבוצה.`
            : undefined
        }
        confirmLabel="מחק"
        onConfirm={async () => {
          if (toDelete) await deleteCameraGroup(toDelete.id);
          setToDelete(null);
          refresh();
        }}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}

function GroupRow({
  group,
  canEdit,
  onChanged,
  onDelete,
}: {
  group: CameraGroup;
  canEdit: boolean;
  onChanged: () => void;
  onDelete: (g: CameraGroup) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const res = await renameCameraGroup(group.id, name);
    if (!res.ok) return setError(res.error ?? "שמירה נכשלה");
    setError(null);
    setEditing(false);
    onChanged();
  }

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2.5">
      {editing ? (
        <div className="flex items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            className="h-8 max-w-xs"
            autoFocus
          />
          <Button size="icon-sm" variant="ghost" onClick={save} title="שמור">
            <Check className="size-4" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            title="ביטול"
            onClick={() => {
              setName(group.name);
              setError(null);
              setEditing(false);
            }}
          >
            <X className="size-4" />
          </Button>
          {error && <span className="text-xs text-red-500">{error}</span>}
        </div>
      ) : (
        <span>
          {group.name}
          <span className="ms-2 text-xs opacity-60">{group.cameraCount} מצלמות</span>
        </span>
      )}

      {canEdit && !editing && (
        <div className="flex items-center gap-1">
          <Button size="icon-sm" variant="ghost" onClick={() => setEditing(true)} title="שנה שם">
            <Pencil className="size-4" />
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={() => onDelete(group)} title="מחק">
            <Trash2 className="size-4" />
          </Button>
        </div>
      )}
    </li>
  );
}
