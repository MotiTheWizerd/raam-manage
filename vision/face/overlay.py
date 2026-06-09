"""Annotated-frame drawing — the visual overlay on the MJPEG feed.

Pure drawing helpers (no state): a top banner and the face box + landmarks. The
worker decides WHAT to draw (text/color, the transient status message); this just
renders it.
"""

from __future__ import annotations

import cv2

FONT = cv2.FONT_HERSHEY_SIMPLEX


def draw_banner(frame, cam_id: str, text: str, color) -> None:
    cv2.rectangle(frame, (0, 0), (frame.shape[1], 46), (0, 0, 0), -1)
    cv2.putText(frame, f"[{cam_id}] {text}", (12, 33), FONT, 0.9, color, 2, cv2.LINE_AA)


def draw_face(frame, bbox, kps, color) -> None:
    x1, y1, x2, y2 = bbox.astype(int)
    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
    if kps is not None:
        for (kx, ky) in kps.astype(int):
            cv2.circle(frame, (kx, ky), 2, color, -1)
