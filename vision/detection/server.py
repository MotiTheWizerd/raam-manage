"""HTTP layer — annotated MJPEG, snapshots, the detections JSON feed, healthz.

Routing only; it talks to `service` (the worker registry) and `settings`, never
to module globals. All endpoints are localhost-only and CORS-open for the app.
"""

from __future__ import annotations

import json
import time
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse

from detect import CAMERAS

from .service import get_worker, running_workers
from .settings import BOUNDARY


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):  # quieter logs
        pass

    def _cam_from_path(self, prefix: str) -> str | None:
        path = urlparse(self.path).path
        if not path.startswith(prefix):
            return None
        cam = path[len(prefix):].strip("/")
        return cam if cam in CAMERAS else None

    def do_GET(self):
        path = urlparse(self.path).path

        if path == "/healthz":
            self._send_json(200, {
                "ok": True,
                "cameras": sorted(CAMERAS),
                "running": running_workers(),
            })
            return

        if path.startswith("/snapshot/"):
            cam = self._cam_from_path("/snapshot/")
            if not cam:
                self._send_json(404, {"error": "unknown camera"})
                return
            self._serve_snapshot(cam)
            return

        if path.startswith("/stream/"):
            cam = self._cam_from_path("/stream/")
            if not cam:
                self._send_json(404, {"error": "unknown camera"})
                return
            self._serve_stream(cam)
            return

        if path.startswith("/detections/"):
            cam = self._cam_from_path("/detections/")
            if not cam:
                self._send_json(404, {"error": "unknown camera"})
                return
            self._serve_detections(cam)
            return

        self._send_json(404, {"error": "not found"})

    def _serve_snapshot(self, cam: str):
        worker = get_worker(cam)
        worker.touch()
        worker.ensure_running()
        # Cold first frame = model load + RTSP open; give it room.
        jpeg, _ = worker.wait_for_frame(-1, timeout=15.0)
        if jpeg is None:
            self._send_json(503, {"error": "no frame yet"})
            return
        self.close_connection = True
        self.send_response(200)
        self.send_header("Content-Type", "image/jpeg")
        self.send_header("Content-Length", str(len(jpeg)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(jpeg)

    def _serve_stream(self, cam: str):
        worker = get_worker(cam)
        worker.touch()
        worker.ensure_running()

        self.send_response(200)
        self.send_header(
            "Content-Type", f"multipart/x-mixed-replace; boundary={BOUNDARY}"
        )
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Connection", "close")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

        last_seq = -1
        try:
            while True:
                jpeg, last_seq = worker.wait_for_frame(last_seq, timeout=5.0)
                worker.touch()
                worker.ensure_running()  # revive if it idled out between views
                if jpeg is None:
                    continue
                self.wfile.write(b"--" + BOUNDARY.encode() + b"\r\n")
                self.wfile.write(b"Content-Type: image/jpeg\r\n")
                self.wfile.write(f"Content-Length: {len(jpeg)}\r\n\r\n".encode())
                self.wfile.write(jpeg)
                self.wfile.write(b"\r\n")
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass  # viewer closed the tab — normal

    def _serve_detections(self, cam: str):
        worker = get_worker(cam)
        worker.touch()
        worker.ensure_running()
        # Wait for a real frame so detections exist (cold start = model load +
        # RTSP open). Like /snapshot, this also keeps the worker alive — so
        # polling /detections is enough to drive a camera, no <img> needed.
        jpeg, seq = worker.wait_for_frame(-1, timeout=15.0)
        if jpeg is None:
            self._send_json(503, {"error": "no frame yet"})
            return
        with worker.cond:
            objects = list(worker.latest_detections)
            width, height = worker.frame_wh
        counts: dict[str, int] = {}
        for o in objects:
            counts[o["cls"]] = counts.get(o["cls"], 0) + 1
        self._send_json(200, {
            "cam": cam,
            "ts": time.time(),
            "frame_seq": seq,
            "width": width,
            "height": height,
            "count": len(objects),
            "counts": counts,
            "objects": objects,
        })

    def _send_json(self, code: int, obj: dict):
        body = json.dumps(obj).encode()
        # Close after the response so frequent pollers (the /detections feed,
        # health checks) don't leave keep-alive threads lingering all day.
        self.close_connection = True
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Connection", "close")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)
