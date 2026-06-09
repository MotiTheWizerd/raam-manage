"""Composition root.

Builds and holds the shared singletons (engine, gallery, door, event log) and the
per-camera worker registry. This is the one place that wires collaborators
together; the HTTP layer (server.py) talks to this, never to module globals.
"""

from __future__ import annotations

import threading

from .door import GeoVisionDoor
from .engine import FaceEngine
from .events import EventLog
from .gallery import FaceGallery
from .settings import settings
from .worker import CameraWorker


class Service:
    def __init__(self):
        self.engine: FaceEngine | None = None
        self.gallery: FaceGallery | None = None
        self.door: GeoVisionDoor | None = None
        self.events: EventLog | None = None
        self._workers: dict[str, CameraWorker] = {}
        self._lock = threading.Lock()

    def init(self, det: int, armed: bool) -> None:
        self.events = EventLog(settings.events_capacity)
        self.door = GeoVisionDoor(armed=armed)
        self.engine = FaceEngine(det)
        self.gallery = FaceGallery()

    def get_worker(self, cam_id: str) -> CameraWorker:
        with self._lock:
            w = self._workers.get(cam_id)
            if w is None:
                w = CameraWorker(cam_id, self.engine, self.gallery, self.door, self.events)
                self._workers[cam_id] = w
            w.ensure_running()
            return w

    def worker_if_running(self, cam_id: str) -> CameraWorker | None:
        return self._workers.get(cam_id)

    def running(self) -> list[str]:
        return sorted(self._workers)


service = Service()
