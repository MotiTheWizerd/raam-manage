"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/Button";
import { createResident } from "./actions";
import { ResidentForm, type ApartmentOption } from "./ResidentForm";

export function AddResidentButton({
  apartments,
}: {
  apartments: ApartmentOption[];
}) {
  const [open, setOpen] = useState(false);
  const noApartments = apartments.length === 0;

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" disabled={noApartments}>
        <Plus size={16} />
        הוסף דייר
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="דייר חדש"
        size="lg"
      >
        {open && (
          <ResidentForm
            apartments={apartments}
            action={createResident}
            onCancel={() => setOpen(false)}
            onSuccess={() => setOpen(false)}
          />
        )}
      </Modal>
    </>
  );
}
