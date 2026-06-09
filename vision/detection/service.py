"""Worker registry — the composition root.

Lazily creates one CameraWorker per camera and hands them out. The HTTP layer
talks to this, never to module globals.
"""

from __future__ import annotations

import threading

from .worker import CameraWorker

_workers: dict[str, CameraWorker] = {}
_workers_lock = threading.Lock()


def get_worker(cam_id: str) -> CameraWorker:
    with _workers_lock:
        w = _workers.get(cam_id)
        if w is None:
            w = CameraWorker(cam_id)
            _workers[cam_id] = w
        return w


def running_workers() -> list[str]:
    """Cameras whose inference thread is currently alive (for /healthz)."""
    return [c for c, w in _workers.items() if w.is_running()]
