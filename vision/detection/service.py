"""Worker registry — the composition root.

Lazily creates one CameraWorker per RTSP stream and hands them out. The app asks
by URL (any camera it knows — it builds the URL server-side, credentials never
reach a browser); the six registry names in detect.CAMERAS (the gate escort's
/stream/<cam>) map onto the same URL-keyed workers. The HTTP layer talks to
this, never to module globals.
"""

from __future__ import annotations

import threading

from detect import CAMERAS, rtsp_url

from .settings import settings
from .worker import CameraWorker

_workers: dict[str, CameraWorker] = {}
_workers_lock = threading.Lock()


def get_worker(url: str, fps: float | None = None, moving_only: bool = False) -> CameraWorker:
    """The worker for one RTSP stream; `fps` caps its inference rate,
    `moving_only` draws just the objects that move (the app's views)."""
    with _workers_lock:
        w = _workers.get(url)
        if w is None:
            w = CameraWorker(url, fps or settings.max_infer_fps, moving_only)
            _workers[url] = w
        else:
            if fps:
                w.fps = fps
            w.moving_only = moving_only
        return w


def get_named_worker(cam_id: str) -> CameraWorker:
    """A registry camera by name (lobby, upper, ...)."""
    return get_worker(rtsp_url(CAMERAS[cam_id], settings.stream))


def running_workers() -> list[str]:
    """Streams whose inference thread is currently alive (for /healthz)."""
    return [w.label for w in _workers.values() if w.is_running()]
