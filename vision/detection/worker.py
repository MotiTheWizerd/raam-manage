"""Per-stream detection worker.

Reads one RTSP stream, runs YOLO+tracking, holds the latest annotated JPEG and
its structured detections. Two threads per worker, so detection NEVER falls behind
the live camera:

  * grabber   — owns the cv2 capture; grab()s (decodes) every frame as it arrives
    so ffmpeg's receive buffer stays drained and no backlog grows, but converts a
    frame to an image only when inference asks for one.
  * inference — asks for the newest frame, runs YOLO at most `fps` times a second.
    When it can't keep up it simply asks less often, so end-to-end lag stays ~one
    inference period forever.

Lazy + self-stopping: ensure_running() (re)starts both threads; they exit on their
own once no viewer has pulled a frame for idle_stop_seconds, and the model is
dropped then (an idle worker holds no GPU memory). Each worker owns its OWN YOLO
instance so ByteTrack track-IDs stay per-camera (a shared model would mix IDs
across cameras).
"""

from __future__ import annotations

import re
import threading
import time

import cv2
from ultralytics import YOLO

from .capture import open_capture
from .detections import extract
from .settings import settings


class CameraWorker:
    def __init__(self, source: str, fps: float, moving_only: bool = False):
        self.source = source
        # For logs — the URL without its credentials.
        self.label = re.sub(r"//[^@/]*@", "//", source)
        self.fps = fps
        # Draw only objects that have moved (see _moving) — parked cars stay unmarked.
        self.moving_only = moving_only
        # track id -> [anchor (cx, cy, w, h) where it first appeared, moved?, last seen]
        self._tracks: dict[int, list] = {}
        self.model: YOLO | None = None
        # processed-frame slot (inference -> HTTP viewers)
        self.cond = threading.Condition()
        self.latest_jpeg: bytes | None = None
        self.latest_detections: list[dict] = []
        self.frame_wh = (0, 0)  # (width, height) of the source frame
        self.frame_seq = 0
        # raw-frame handoff (grabber -> inference): inference sets _want, the
        # grabber converts the next frame it decodes and clears it
        self._raw_cond = threading.Condition()
        self._raw_frame = None
        self._raw_seq = 0
        self._want = False
        self.last_view_at = 0.0
        self.grab_thread: threading.Thread | None = None
        self.infer_thread: threading.Thread | None = None
        self._start_lock = threading.Lock()

    def touch(self) -> None:
        """Mark a viewer as active — keeps the worker alive."""
        self.last_view_at = time.time()

    def _idle(self) -> bool:
        return time.time() - self.last_view_at >= settings.idle_stop_seconds

    def is_running(self) -> bool:
        return self.infer_thread is not None and self.infer_thread.is_alive()

    def ensure_running(self) -> None:
        with self._start_lock:
            self.touch()
            if self.grab_thread is None or not self.grab_thread.is_alive():
                self.grab_thread = threading.Thread(
                    target=self._grab_loop, name=f"grab-{self.label}", daemon=True)
                self.grab_thread.start()
            if self.infer_thread is None or not self.infer_thread.is_alive():
                self.infer_thread = threading.Thread(
                    target=self._infer_loop, name=f"infer-{self.label}", daemon=True)
                self.infer_thread.start()

    def _grab_loop(self) -> None:
        """Drain the camera continuously; hand over a frame only when asked."""
        print(f"[{self.label}] opening stream")
        cap = open_capture(self.source)
        misses = 0
        try:
            while not self._idle():
                if not cap.isOpened():
                    cap = open_capture(self.source)
                    time.sleep(0.5)
                    continue
                if not cap.grab():  # decode only; paces at the camera's fps
                    misses += 1
                    if misses > 50:
                        cap.release()
                        cap = open_capture(self.source)
                        misses = 0
                    continue
                misses = 0
                if not self._want:
                    continue
                ok, frame = cap.retrieve()
                if not ok:
                    continue
                with self._raw_cond:
                    self._raw_frame = frame
                    self._raw_seq += 1
                    self._want = False
                    self._raw_cond.notify_all()
        finally:
            cap.release()
            print(f"[{self.label}] grabber stopped (idle)")

    def _infer_loop(self) -> None:
        """Run YOLO on the newest frame, at most `fps` times a second."""
        if self.model is None:
            print(f"[{self.label}] loading model {settings.model} on {settings.device}")
            self.model = YOLO(settings.model)
        last_raw = self._raw_seq
        try:
            while not self._idle():
                # Ask the grabber for its next frame and wait for it.
                with self._raw_cond:
                    self._want = True
                    while self._raw_seq <= last_raw:
                        if self._idle():
                            return
                        self._raw_cond.wait(timeout=1.0)
                    frame = self._raw_frame
                    last_raw = self._raw_seq
                if frame is None:
                    continue

                t0 = time.time()
                results = self.model.track(
                    frame, conf=settings.conf, imgsz=settings.imgsz, persist=True,
                    tracker="bytetrack.yaml", device=settings.device, verbose=False,
                )
                result = results[0]
                if self.moving_only:
                    result = self._moving(result)
                annotated = result.plot()
                dets = extract(result, self.model.names)
                ok, buf = cv2.imencode(
                    ".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, settings.jpeg_quality]
                )
                if not ok:
                    continue
                with self.cond:
                    self.latest_jpeg = buf.tobytes()
                    self.latest_detections = dets
                    self.frame_wh = (frame.shape[1], frame.shape[0])
                    self.frame_seq += 1
                    self.cond.notify_all()

                # Hold the inference rate at `fps`; the grabber keeps the stream
                # drained meanwhile, so we always resume on a fresh frame.
                spent = time.time() - t0
                min_interval = 1.0 / self.fps if self.fps > 0 else 0.0
                if min_interval > spent:
                    time.sleep(min_interval - spent)
        finally:
            # Idle: free the model (and its tracker — ids restart), and drop the
            # last picture so the next viewer waits for a fresh one instead of
            # getting a stale frame.
            self.model = None
            self._tracks.clear()
            with self.cond:
                self.latest_jpeg = None
                self.latest_detections = []
            print(f"[{self.label}] inference stopped (idle)")

    def _moving(self, result):
        """Keep only the tracks that have moved since they first appeared.

        A parked car never leaves its spot, so it's never marked; a person or
        car on the move is marked once its box centre has travelled
        moved_fraction of the box's own size, and stays marked while tracked
        (someone who walks in and stops at a door keeps their box).
        """
        boxes = result.boxes
        if boxes is None or boxes.id is None:
            return result[[]]
        now = time.time()
        keep = []
        for i, (tid, (cx, cy, w, h)) in enumerate(
            zip(boxes.id.int().tolist(), boxes.xywh.tolist())
        ):
            track = self._tracks.get(tid)
            if track is None:
                track = self._tracks[tid] = [(cx, cy, w, h), False, now]
            (ax, ay, aw, ah), moved, _ = track
            if not moved:
                f = settings.moved_fraction
                moved = track[1] = abs(cx - ax) > f * aw or abs(cy - ay) > f * ah
            track[2] = now
            if moved:
                keep.append(i)
        # Forget tracks the tracker has long since dropped.
        for tid in [t for t, tr in self._tracks.items() if now - tr[2] > 60]:
            del self._tracks[tid]
        return result[keep]

    def wait_for_frame(self, last_seq: int, timeout: float = 5.0):
        """Block until a frame newer than last_seq exists (or timeout).

        Pass last_seq=-1 to mean "give me the latest frame, waiting for the first
        one if none exists yet". The latest_jpeg-is-None guard makes the very first
        cold frame (model load + stream open) actually wait.

        A waiting caller is a viewer: it keeps the worker alive (and revives it
        if it just idled out). A cold start can take longer than
        idle_stop_seconds when several cameras start at once (a wall).
        """
        deadline = time.time() + timeout
        while True:
            self.ensure_running()
            with self.cond:
                if self.latest_jpeg is not None and self.frame_seq > last_seq:
                    return self.latest_jpeg, self.frame_seq
                remaining = deadline - time.time()
                if remaining <= 0:
                    return self.latest_jpeg, self.frame_seq
                self.cond.wait(timeout=min(remaining, 1.0))
