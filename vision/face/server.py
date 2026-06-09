"""HTTP layer — annotated MJPEG, snapshots, enroll/list/forget, live tuning,
the entry-event feed, and door arm/fire. Routing only; it talks to `service` and
`settings`, never to module globals.
"""

from __future__ import annotations

import json
import threading
import time
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

from detect import CAMERAS

from .service import service
from .settings import BOUNDARY, CAM_DOOR, DEFAULT_CAM, DEFAULT_DOOR, settings


def _knobs() -> dict:
    """The live-tunable knob values, for /list and /threshold responses."""
    return {"log": settings.match_threshold, "door_score": settings.door_min_score,
            "margin": settings.door_margin, "weight": settings.accum_weight_min,
            "consensus": settings.accum_consensus, "votes": settings.accum_min_votes,
            "window": settings.accum_window, "px_floor": settings.px_floor,
            "px_full": settings.px_full}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def _json(self, code: int, obj: dict):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.close_connection = True
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(body)

    def _send_jpeg(self, jpeg: bytes):
        self.close_connection = True
        self.send_response(200)
        self.send_header("Content-Type", "image/jpeg")
        self.send_header("Content-Length", str(len(jpeg)))
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(jpeg)

    def do_GET(self):
        u = urlparse(self.path)
        qs = parse_qs(u.query)
        parts = [p for p in u.path.split("/") if p]
        head = parts[0] if parts else ""

        # camera views: "/", "/<cam>", "/<cam>/snapshot", "/snapshot"
        if head == "" or head in CAMERAS or head == "snapshot":
            if head in CAMERAS:
                cam = head
                snap = len(parts) > 1 and parts[1] == "snapshot"
            else:
                cam = DEFAULT_CAM
                snap = head == "snapshot"
            return self._serve_snapshot(cam) if snap else self._serve_stream(cam)

        if head == "list":
            self._json(200, {"enrolled": service.gallery.names(),
                             "armed": service.door.armed,
                             "running": service.running(), **_knobs()})
            return

        if head == "enroll":
            cam = (qs.get("cam", [DEFAULT_CAM])[0])
            cam = cam if cam in CAMERAS else DEFAULT_CAM
            name = (qs.get("name", ["resident"])[0]).strip() or "resident"
            service.get_worker(cam).start_enroll(name)
            self._json(200, {"ok": True, "enrolling": name, "cam": cam,
                             "msg": f"Look at the {cam} camera for {settings.enroll_seconds:.0f}s…"})
            return

        if head == "threshold":
            # Live-tune any knob. Logging: v. Door (accumulator): score = winner's
            # weighted-mean score, margin = its weighted margin, weight = total
            # evidence, consensus = its share, votes = min frames, window = seconds.
            # Quality ramp: pxfloor / pxfull.
            try:
                if "v" in qs:
                    settings.match_threshold = float(qs["v"][0])
                if "score" in qs:
                    settings.door_min_score = float(qs["score"][0])
                if "margin" in qs:
                    settings.door_margin = float(qs["margin"][0])
                if "weight" in qs:
                    settings.accum_weight_min = float(qs["weight"][0])
                if "consensus" in qs:
                    settings.accum_consensus = float(qs["consensus"][0])
                if "votes" in qs:
                    settings.accum_min_votes = int(qs["votes"][0])
                if "window" in qs:
                    settings.accum_window = float(qs["window"][0])
                if "pxfloor" in qs:
                    settings.px_floor = int(qs["pxfloor"][0])
                if "pxfull" in qs:
                    settings.px_full = int(qs["pxfull"][0])
            except ValueError:
                self._json(400, {"error": "knobs: v score margin weight consensus "
                                          "votes window pxfloor pxfull"})
                return
            self._json(200, {"ok": True, **_knobs()})
            return

        if head == "forget":
            name = (qs.get("name", [""])[0]).strip()
            self._json(200, {"ok": service.gallery.forget(name), "forgot": name})
            return

        if head == "debug":
            cam = qs.get("cam", [DEFAULT_CAM])[0]
            cam = cam if cam in CAMERAS else DEFAULT_CAM
            w = service.worker_if_running(cam)
            self._json(200, w.debug_state() if w else {"cam": cam, "running": False})
            return

        if head == "selftest":
            # Measure the recognizer's REAL speed inside this live process (so we
            # can tune perf without making someone walk to the camera). Uses a
            # bundled multi-face image -> exercises detect + one recognition.
            import insightface as _ins
            try:
                n = max(1, min(30, int(qs.get("n", ["8"])[0])))
            except ValueError:
                n = 8
            img = _ins.data.get_image("t1")
            service.engine.detect_recognize_biggest(img)  # warmup
            t = time.time()
            for _ in range(n):
                service.engine.detect_recognize_biggest(img)
            ms = (time.time() - t) / n * 1000.0
            self._json(200, {"ok": True, "n": n, "ms_per_frame": round(ms, 1),
                             "fps": round(1000.0 / ms, 2)})
            return

        if head == "door":
            if "arm" in qs:
                service.door.armed = qs["arm"][0] not in ("0", "false", "off", "no")
                self._json(200, {"ok": True, "armed": service.door.armed})
                return
            ctrl, dr = CAM_DOOR.get(DEFAULT_CAM, DEFAULT_DOOR)
            threading.Thread(target=service.door.open, args=(ctrl, dr), daemon=True).start()
            self._json(200, {"ok": True, "msg": "opening door…"})
            return

        # entry-event feed: /events?since=<id>&limit=<n> + /events/snap?id=<id>
        if head == "events":
            if len(parts) > 1 and parts[1] == "snap":
                try:
                    eid = int(qs.get("id", ["0"])[0])
                except ValueError:
                    eid = 0
                jpeg = service.events.snap(eid)
                if jpeg is None:
                    self._json(404, {"error": "no snapshot"})
                    return
                self._send_jpeg(jpeg)
                return
            try:
                since = int(qs.get("since", ["0"])[0])
                limit = min(200, max(1, int(qs.get("limit", ["100"])[0])))
            except ValueError:
                since, limit = 0, 100
            evs, last_id = service.events.since(since, limit)
            self._json(200, {"events": evs, "last_id": last_id})
            return

        self._json(404, {"error": "not found"})

    def _serve_snapshot(self, cam: str):
        jpeg, _ = service.get_worker(cam).wait_jpeg(-1, timeout=15.0)
        if jpeg is None:
            self._json(503, {"error": "no frame yet"})
            return
        self._send_jpeg(jpeg)

    def _serve_stream(self, cam: str):
        worker = service.get_worker(cam)
        self.send_response(200)
        self.send_header("Content-Type", f"multipart/x-mixed-replace; boundary={BOUNDARY}")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.end_headers()
        last = -1
        try:
            while True:
                jpeg, last = worker.wait_jpeg(last, timeout=5.0)
                if jpeg is None:
                    continue
                self.wfile.write(b"--" + BOUNDARY.encode() + b"\r\n")
                self.wfile.write(b"Content-Type: image/jpeg\r\n")
                self.wfile.write(f"Content-Length: {len(jpeg)}\r\n\r\n".encode())
                self.wfile.write(jpeg)
                self.wfile.write(b"\r\n")
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass
