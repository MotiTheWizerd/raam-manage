"""Opening an RTSP stream — shared by the detection workers and raw grabbers."""

from __future__ import annotations

import cv2

from .settings import settings


def open_capture(url: str) -> cv2.VideoCapture:
    return cv2.VideoCapture(
        url, cv2.CAP_FFMPEG, [cv2.CAP_PROP_N_THREADS, settings.decode_threads]
    )
