"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/Button";
import { createApartment } from "./actions";
import { ApartmentForm, type Zone } from "./ApartmentForm";

export function AddApartmentButton({ zones }: { zones: Zone[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm">
        <Plus size={16} />
        הוסף דירה
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="דירה חדשה"
        size="lg"
      >
        {open && (
          <ApartmentForm
            zones={zones}
            action={createApartment}
            onCancel={() => setOpen(false)}
            onSuccess={() => setOpen(false)}
          />
        )}
      </Modal>
    </>
  );
}
