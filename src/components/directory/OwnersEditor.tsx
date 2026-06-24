"use client";

import { ChevronDown, Phone, Plus, Trash2, X } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  addOwnerMobile,
  createOwner,
  deleteOwner,
  deleteOwnerMobile,
  updateOwner,
  type OwnerFormState,
} from "@/app/owners/actions";
import type { EditOwner } from "@/app/directory/actions";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { cn } from "@/lib/cn";
import { useFormToasts } from "@/lib/hooks/useFormToasts";

const initial: OwnerFormState = {};

type Props = {
  apartmentId: number;
  owners: EditOwner[];
  onChanged: () => void;
};

// Editor for the apartment's registered owners (apartment_owners + owners_mobiles).
// Accordion-style: one owner expanded at a time. All writes reuse the /owners
// server actions; deletes call them directly so we don't nest a form-per-row.
export function OwnersEditor({ apartmentId, owners, onChanged }: Props) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-3">
      {owners.length === 0 && !adding && (
        <p className="text-sm opacity-60">אין בעלים רשומים לדירה זו.</p>
      )}

      <div className="space-y-2">
        {owners.map((owner) => (
          <OwnerRow
            key={owner.id}
            owner={owner}
            apartmentId={apartmentId}
            expanded={expandedId === owner.id}
            onToggle={() =>
              setExpandedId((id) => (id === owner.id ? null : owner.id))
            }
            onChanged={onChanged}
          />
        ))}
      </div>

      {adding ? (
        <AddOwnerForm
          apartmentId={apartmentId}
          onClose={() => setAdding(false)}
          onChanged={onChanged}
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setAdding(true)}
        >
          <Plus size={14} />
          הוסף בעלים
        </Button>
      )}
    </div>
  );
}

function OwnerRow({
  owner,
  apartmentId,
  expanded,
  onToggle,
  onChanged,
}: {
  owner: EditOwner;
  apartmentId: number;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const [state, action, pending] = useActionState(updateOwner, initial);
  useFormToasts(state, "הבעלים עודכן");
  useEffect(() => {
    if (state.submittedAt) onChanged();
  }, [state.submittedAt, onChanged]);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    const fd = new FormData();
    fd.set("id", String(owner.id));
    const res = await deleteOwner(initial, fd);
    setDeleting(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("הבעלים נמחק");
    setConfirmOpen(false);
    onChanged();
  }

  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex flex-1 items-center gap-2 text-start text-sm"
        >
          <ChevronDown
            size={14}
            className={cn(
              "shrink-0 opacity-60 transition-transform",
              expanded && "rotate-180"
            )}
          />
          <span className="font-medium">
            {owner.first_name} {owner.last_name}
          </span>
          {owner.mobiles.length > 0 && (
            <span className="text-xs opacity-50">
              · {owner.mobiles.length} טלפונים
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          aria-label="מחק בעלים"
          className="inline-flex h-7 w-7 items-center justify-center rounded opacity-40 transition-all hover:bg-red-500/10 hover:text-red-600 hover:opacity-100"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {expanded && (
        <div className="space-y-3 border-t border-black/10 p-3 dark:border-white/10">
          <form action={action} className="space-y-3">
            <input type="hidden" name="id" value={owner.id} />
            <input type="hidden" name="apartment_id" value={apartmentId} />
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs opacity-70">שם פרטי</span>
                <Input
                  name="first_name"
                  required
                  defaultValue={owner.first_name}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs opacity-70">שם משפחה</span>
                <Input
                  name="last_name"
                  required
                  defaultValue={owner.last_name}
                />
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs opacity-70">הערות</span>
              <Textarea
                name="comments"
                rows={2}
                defaultValue={owner.comments ?? ""}
              />
            </label>
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "שומר..." : "שמור בעלים"}
              </Button>
            </div>
          </form>

          <OwnerPhones owner={owner} onChanged={onChanged} />
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleDelete}
        pending={deleting}
        title="מחיקת בעלים"
        description={`למחוק את ${owner.first_name} ${owner.last_name} מרשימת הבעלים?`}
        confirmLabel="מחק"
      />
    </div>
  );
}

function OwnerPhones({
  owner,
  onChanged,
}: {
  owner: EditOwner;
  onChanged: () => void;
}) {
  const [phone, setPhone] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    const p = phone.trim();
    if (!p) return;
    setBusy(true);
    const fd = new FormData();
    fd.set("owner_id", String(owner.id));
    fd.set("phone", p);
    fd.set("comment", comment.trim());
    const res = await addOwnerMobile(initial, fd);
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setPhone("");
    setComment("");
    onChanged();
  }

  async function remove(id: number) {
    const fd = new FormData();
    fd.set("id", String(id));
    const res = await deleteOwnerMobile(initial, fd);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    onChanged();
  }

  return (
    <div className="space-y-2 border-t border-black/5 pt-3 dark:border-white/5">
      <p className="text-xs font-medium opacity-70">טלפונים</p>
      {owner.mobiles.length === 0 && (
        <p className="text-xs opacity-40">אין טלפונים</p>
      )}
      {owner.mobiles.map((m) => (
        <div key={m.id} className="flex items-center gap-2 text-xs">
          <Phone size={11} className="shrink-0 opacity-40" />
          <span dir="ltr" className="font-mono">
            {m.phone}
          </span>
          {m.comment && <span className="opacity-50">· {m.comment}</span>}
          <button
            type="button"
            onClick={() => remove(m.id)}
            aria-label="מחק טלפון"
            className="inline-flex h-5 w-5 items-center justify-center rounded opacity-30 transition-all hover:text-red-600 hover:opacity-100"
          >
            <X size={12} />
          </button>
        </div>
      ))}
      <div className="flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-[11px] opacity-60">מספר</span>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            dir="ltr"
            className="h-8 text-xs"
            placeholder="050-1234567"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-[11px] opacity-60">הערה</span>
          <Input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="h-8 text-xs"
            placeholder="לא חובה"
          />
        </label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={add}
          disabled={busy || !phone.trim()}
        >
          <Plus size={14} />
          הוסף
        </Button>
      </div>
    </div>
  );
}

function AddOwnerForm({
  apartmentId,
  onClose,
  onChanged,
}: {
  apartmentId: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [state, action, pending] = useActionState(createOwner, initial);
  useFormToasts(state, "הבעלים נוסף");
  useEffect(() => {
    if (state.submittedAt) {
      onChanged();
      onClose();
    }
  }, [state.submittedAt, onChanged, onClose]);

  return (
    <form
      action={action}
      className="space-y-3 rounded-lg border border-dashed border-black/15 p-3 dark:border-white/15"
    >
      <input type="hidden" name="apartment_id" value={apartmentId} />
      <p className="text-xs font-medium opacity-70">בעלים חדש</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs opacity-70">שם פרטי</span>
          <Input name="first_name" required autoFocus />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs opacity-70">שם משפחה</span>
          <Input name="last_name" required />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs opacity-70">הערות</span>
        <Textarea name="comments" rows={2} />
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          ביטול
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "מוסיף..." : "הוסף בעלים"}
        </Button>
      </div>
    </form>
  );
}
