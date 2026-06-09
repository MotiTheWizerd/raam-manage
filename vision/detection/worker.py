"""Per-camera detection worker.

Reads one camera's RTSP, runs YOLO+tracking, holds the latest annotated JPEG and
its structured detections. Two threads per worker, so detection NEVER falls behind
the live camera:

  * grabber   — owns the cv2 capture; reads frames as fast as they arrive and
    keeps ONLY the most recent one (everything in between is dropped), so ffmpeg's
    receive buffer stays drained and no backlog grows.
  * inference — takes whatever frame is newest, runs YOLO at most max_infer_fps.
    When the CPU can't keep up it skips frames instead of queueing them, so
    end-to-end lag stays ~one inference period forever.

Lazy + self-stopping: ensure_running() (re)starts both threads; they exit on their
own once no viewer has pulled a frame for idle_stop_seconds. Each worker owns its
OWN YOLO instance so ByteTrack track-IDs stay per-camera (a shared model would mix
IDs across cameras).
"""

from __future__ import annotations

import threading
import time

import cv2
from ultralytics import YOLO

from detect import CAMERAS, rtsp_url

from .detections import extract
from .settings import settings


class CameraWorker:
    def __init__(self, cam_id: str):
        self.cam_id = cam_id
        self.source = rtsp_url(CAMERAS[cam_id], settings.stream)
        self.model: YOLO | None = None
        # processed-frame slot (inference -> HTTP viewers)
        self.cond = threading.Condition()
        self.latest_jpeg: bytes | None = None
        self.latest_detections: list[dict] = []
        self.frame_wh = (0, 0)  # (width, height) of the source frame
        self.frame_seq = 0
        # raw-frame slot (grabber -> inference); only the newest is kept
        self._raw_cond = threading.Condition()
        self._raw_frame = None
        self._raw_seq = 0
        self.last_view_at = 0.0
        self.grab_thread: threading.Thread | None = None
        self.infer_thread: threading.Thread | None = None
        self._start_lock = threading.Lock()

    def touch(self) -> None:
        """Mark a viewer as active — keeps the worker alive."""
        self.last_view_at = time.time()

    def is_running(self) -> bool:
        return self.infer_thread is not None and self.infer_thread.is_alive()

    def ensure_running(self) -> None:
        with self._start_lock:
            self.touch()
            if self.grab_thread is None or not self.grab_thread.is_alive():
                self.grab_thread = threading.Thread(
                    target=self._grab_loop, name=f"grab-{self.cam_id}", daemon=True)
                self.grab_thread.start()
            if self.infer_thread is None or not self.infer_thread.is_alive():
                self.infer_thread = threading.Thread(
                    target=self._infer_loop, name=f"infer-{self.cam_id}", daemon=True)
                self.infer_thread.start()

    def _grab_loop(self) -> None:
        """Drain the camera continuously, publishing only the latest frame."""
        print(f"[{self.cam_id}] opening stream")
        cap = cv2.VideoCapture(self.source, cv2.CAP_FFMPEG)
        misses = 0
        try:
            while time.time() - self.last_view_at < settings.idle_stop_seconds:
                if not cap.isOpened():
                    cap = cv2.VideoCapture(self.source, cv2.CAP_FFMPEG)
                    time.sleep(0.5)
                    continue
                ok, frame = cap.read()  # grab+decode; paces at the camera's fps
                if not ok:
                    misses += 1
                    if misses > 50:
                        cap.release()
                        cap = cv2.VideoCapture(self.source, cv2.CAP_FFMPEG)
                        misses = 0
                    continue
                misses = 0
                with self._raw_cond:
                    self._raw_frame = frame
                    self._raw_seq += 1
                    self._raw_cond.notify_all()
        finally:
            cap.release()
            print(f"[{self.cam_id}] grabber stopped (idle)")

    def _infer_loop(self) -> None:
        """Run YOLO on the newest grabbed frame, capped at max_infer_fps."""
        if self.model is None:
            print(f"[{self.cam_id}] loading model {settings.model}")
            self.model = YOLO(settings.model)
        last_raw = -1
        min_interval = 1.0 / settings.max_infer_fps if settings.max_infer_fps > 0 else 0.0
        try:
            while time.time() - self.last_view_at < settings.idle_stop_seconds:
                # Block for a frame strictly newer than the one we last ran —
                # this skips everything the grabber overwrote in between.
                with self._raw_cond:
                    while self._raw_seq <= last_raw:
                        if time.time() - self.last_view_at >= settings.idle_stop_seconds:
                            return
                        self._raw_cond.wait(timeout=1.0)
                    frame = self._raw_frame
                    last_raw = self._raw_seq
                if frame is None:
                    continue

                t0 = time.time()
                results = self.model.track(
                    frame, conf=settings.conf, imgsz=settings.imgsz, persist=True,
                    tracker="bytetrack.yaml", verbose=False,
                )
                result = results[0]
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

                # Hold the inference rate at max_infer_fps; the grabber keeps
                # refreshing the latest frame while we sleep, so we always resume
                # on a fresh one (never a stale queued one).
                spent = time.time() - t0
                if min_interval > spent:
                    time.sleep(min_interval - spent)
        finally:
            print(f"[{self.cam_id}] inference stopped (idle)")

    def wait_for_frame(self, last_seq: int, timeout: float = 5.0):
        """Block until a frame newer than last_seq exists (or timeout).

        Pass last_seq=-1 to mean "give me the latest frame, waiting for the first
        one if none exists yet". The latest_jpeg-is-None guard makes the very first
        cold frame (model load + stream open) actually wait.
        """
        deadline = time.time() + timeout
        with self.cond:
            while self.frame_seq <= last_seq or self.latest_jpeg is None:
                remaining = deadline - time.time()
                if remaining <= 0:
                    break
                self.cond.wait(timeout=remaining)
            return self.latest_jpeg, self.frame_seq
