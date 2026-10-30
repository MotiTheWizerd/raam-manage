"""Raw RTSP snapshot grabbers — view-only, no detection.

For cameras the app wants to SEE but not run YOLO on (the RTSP-only cameras:
Easy-Rtsp units, NVR channels, intercom panels). One lightweight grabber per RTSP
URL decodes the stream and turns a frame into a JPEG only when a viewer asks for
one. No model, no inference thread, so a wall of these is cheap.

Lazy + self-stopping, like the detection workers: a grabber (re)starts on demand
and exits on its own once no viewer has pulled a frame for RAW_IDLE_STOP seconds.
Keyed by the full RTSP URL (credentials included), so two cameras never share.
"""

from __future__ import annotations

import threading
import time

import cv2

from .capture import open_capture
from .settings import settings

# Longer than the detection idle-stop: opening an RTSP stream costs ~1-2s, and
# these grabbers are cheap (no model), so keep them warm a bit between polls.
RAW_IDLE_STOP = 30.0
# Once a grabber has a picture, how long a viewer waits for a fresh one before
# taking the last (a stalled camera still shows something).
FRESH_WAIT = 2.0


class RawGrabber:
    def __init__(self, url: str):
        self.url = url
        self.cond = threading.Condition()
        self.latest_jpeg: bytes | None = None
        self.seq = 0
        self.want = False  # a viewer is waiting: convert the next decoded frame
        self.last_view_at = 0.0
        self.thread: threading.Thread | None = None
        self._start_lock = threading.Lock()

    def touch(self) -> None:
        self.last_view_at = time.time()

    def ensure_running(self) -> None:
        with self._start_lock:
            self.touch()
            if self.thread is None or not self.thread.is_alive():
                self.thread = threading.Thread(
                    target=self._loop, name="raw-grabber", daemon=True)
                self.thread.start()

    def _loop(self) -> None:
        cap = open_capture(self.url)
        misses = 0
        try:
            while time.time() - self.last_view_at < RAW_IDLE_STOP:
                if not cap.isOpened():
                    cap = open_capture(self.url)
                    time.sleep(0.5)
                    continue
                if not cap.grab():  # decode only; keeps the stream drained
                    misses += 1
                    if misses > 50:
                        cap.release()
                        cap = open_capture(self.url)
                        misses = 0
                    continue
                misses = 0
                if not self.want:
                    continue
                ok, frame = cap.retrieve()
                if not ok:
                    continue
                ok, buf = cv2.imencode(
                    ".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, settings.jpeg_quality]
                )
                if not ok:
                    continue
                with self.cond:
                    self.latest_jpeg = buf.tobytes()
                    self.seq += 1
                    self.want = False
                    self.cond.notify_all()
        finally:
            cap.release()

    def wait_for_frame(self, timeout: float = 15.0) -> bytes | None:
        """A frame decoded after this call (cold start = RTSP open, up to
        `timeout`); if the stream stalls, the last one we had."""
        with self.cond:
            deadline = time.time() + (timeout if self.latest_jpeg is None else FRESH_WAIT)
            seq = self.seq
            self.want = True
            while self.seq == seq:
                remaining = deadline - time.time()
                if remaining <= 0:
                    break
                self.cond.wait(timeout=remaining)
            return self.latest_jpeg


_grabbers: dict[str, RawGrabber] = {}
_grabbers_lock = threading.Lock()


def get_raw_grabber(url: str) -> RawGrabber:
    with _grabbers_lock:
        g = _grabbers.get(url)
        if g is None:
            g = RawGrabber(url)
            _grabbers[url] = g
        return g
