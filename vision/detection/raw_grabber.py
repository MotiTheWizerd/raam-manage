"""Raw RTSP snapshot grabbers — view-only, no detection.

For cameras the app wants to SEE but not run YOLO on (the RTSP-only cameras:
Easy-Rtsp units, NVR channels, intercom panels). One lightweight grabber per RTSP
URL decodes the stream and turns a frame into a JPEG only when a viewer asks for
one. No model, no inference thread, so a wall of these is cheap.

Lazy + self-stopping, like the detection workers: a grabber (re)starts on demand
and exits on its own once no viewer has pulled a frame for RAW_IDLE_STOP seconds.
Keyed by the full RTSP URL (credentials included), so two cameras never share.

Live mode (the follow wall's video): while someone watches /live, the grabber
also encodes decoded frames continuously, up to the asked fps, into a separate
slot — so a snapshot viewer and a live viewer of the same URL don't disturb
each other.
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
# Live encoding stops this long after the last /live viewer asked for a frame.
LIVE_LINGER = 2.0


class RawGrabber:
    def __init__(self, url: str):
        self.url = url
        self.cond = threading.Condition()
        self.latest_jpeg: bytes | None = None
        self.seq = 0
        self.want = False  # a viewer is waiting: convert the next decoded frame
        # live slot (see the module docstring)
        self.live_jpeg: bytes | None = None
        self.live_seq = 0
        self.live_until = 0.0
        self.live_interval = 0.0
        self.live_quality = settings.jpeg_quality
        self.live_width = 0  # shrink wider frames to this (0 = as they come)
        self._next_live_at = 0.0
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
                now = time.time()
                live = now < self.live_until and now >= self._next_live_at
                if not self.want and not live:
                    continue
                ok, frame = cap.retrieve()
                if not ok:
                    continue
                snap = None
                if self.want:
                    ok, snap = cv2.imencode(
                        ".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, settings.jpeg_quality]
                    )
                    if not ok:
                        snap = None
                live_buf = None
                if live:
                    # Step the schedule by whole intervals so a 25 fps camera
                    # asked for 20 averages 20, without drifting behind.
                    self._next_live_at = max(
                        self._next_live_at + self.live_interval, now - self.live_interval
                    )
                    live_frame = frame
                    w = self.live_width
                    if w and frame.shape[1] > w:
                        h = round(frame.shape[0] * w / frame.shape[1])
                        live_frame = cv2.resize(frame, (w, h), interpolation=cv2.INTER_AREA)
                    ok, live_buf = cv2.imencode(
                        ".jpg", live_frame, [cv2.IMWRITE_JPEG_QUALITY, self.live_quality]
                    )
                    if not ok:
                        live_buf = None
                if snap is None and live_buf is None:
                    continue
                with self.cond:
                    if snap is not None:
                        self.latest_jpeg = snap.tobytes()
                        self.seq += 1
                        self.want = False
                    if live_buf is not None:
                        self.live_jpeg = live_buf.tobytes()
                        self.live_seq += 1
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

    def wait_live(
        self, after: int, fps: float, quality: int, width: int = 0, timeout: float = 5.0
    ):
        """The next live frame newer than `after` -> (jpeg, seq); (None, after)
        on timeout (cold start, or a stalled camera). Each call keeps live
        encoding on for LIVE_LINGER more seconds."""
        self.ensure_running()
        with self.cond:
            self.live_interval = 1.0 / fps
            self.live_quality = quality
            self.live_width = width
            deadline = time.time() + timeout
            while self.live_seq <= after or self.live_jpeg is None:
                now = time.time()
                if now >= deadline:
                    return None, after
                self.live_until = now + LIVE_LINGER
                self.cond.wait(timeout=min(deadline - now, 1.0))
            self.live_until = time.time() + LIVE_LINGER
            return self.live_jpeg, self.live_seq


_grabbers: dict[str, RawGrabber] = {}
_grabbers_lock = threading.Lock()


def get_raw_grabber(url: str) -> RawGrabber:
    with _grabbers_lock:
        g = _grabbers.get(url)
        if g is None:
            g = RawGrabber(url)
            _grabbers[url] = g
        return g
