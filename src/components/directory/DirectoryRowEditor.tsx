"use client";

import { Modal } from "@/components/Modal";
import { ApartmentEditor } from "./ApartmentEditor";

type Props = {
  apartmentId: number;
  apartmentNumber: string;
  open: boolean;
  onClose: () => void;
};

// Manager entry point to the full-record editor: the same ApartmentEditor body,
// wrapped in the tabbed modal. (The inline in-table row editor renders the same
// body with the "stacked" layout — see DirectoryTable.)
export function DirectoryRowEditor({
  apartmentId,
  apartmentNumber,
  open,
  onClose,
}: Props) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`עריכת דירה ${apartmentNumber}`}
      size="xl"
    >
      <ApartmentEditor
        apartmentId={apartmentId}
        apartmentNumber={apartmentNumber}
        layout="tabs"
      />
    </Modal>
  );
}
