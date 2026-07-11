"use client";

import { Modal } from "@/components/Modal";
import { LobbyistApartmentEditor } from "./LobbyistApartmentEditor";

type Props = {
  apartmentId: number;
  apartmentNumber: string;
  open: boolean;
  onClose: () => void;
};

// Lobbyist entry point to the directory editor: the SAME black-screen modal the
// manager gets (DirectoryRowEditor), but with the restricted three-field body.
// A touch narrower than the manager's tabbed editor since it holds far less.
export function LobbyistRowEditor({
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
      size="lg"
    >
      <LobbyistApartmentEditor
        apartmentId={apartmentId}
        apartmentNumber={apartmentNumber}
      />
    </Modal>
  );
}
