"""
Vision service — serves live object-detection feeds over localhost HTTP so the
Next app can embed them behind a "detection mode" toggle.

Design for a CPU-only box: detection workers are LAZY. A camera only runs YOLO
while someone is actually viewing its stream, and the worker auto-stops a few
seconds after the last viewer disconnects. So we never burn CPU on cameras
nobody is watching.

Endpoints (all localhost-only):
    GET /stream/<cam>     annotated MJPEG (multipart/x-mixed-replace) — for <img>
    GET /snapshot/<cam>   single annotated JPEG (latest frame)
    GET /healthz          liveness + which workers are running

<cam> is any name from the registry in detect.py (lobby, upper, ramp, ...).

Run:
    .venv/Scripts/python server.py                 # default 127.0.0.1:8089
    .venv/Scripts/python server.py --port 8089 --stream sub --conf 0.35
"""

from __future__ import annotations

import os

# Quiet ffmpeg's per-frame H.264 decode chatter ("error while decoding MB ...")
# — those are harmless recoverable glitches on imperfect RTSP frames, and they
# otherwise flood the pm2 error log and bury real problems. Must be set before
# cv2 loads its ffmpeg backend.
os.environ.setdefault("OPENCV_FFMPEG_LOGLEVEL", "-8")  # AV_LOG_QUIET

import argparse
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

import cv2
from ultralytics import YOLO

from detect import CAMERAS, rtsp_url

# --- config (set from CLI in main) -----------------------------------------
MODEL = "yolo11n.pt"
STREAM = "main"   # HD 1080p. ~17 fps on the CPU lobby PC; localhost = free bandwidth.
CONF = 0.35
IDLE_STOP_SECONDS = 8.0   # stop a worker this long after its last viewer leaves
JPEG_QUALITY = 90
BOUNDARY = "frame"


class CameraWorker:
    """Reads one camera's RTSP, runs YOLO+tracking, holds the latest JPEG.

    Lazy + self-stopping: ensure_running() (re)starts the capture thread; the
    thread exits on its own once no viewer has pulled a frame for
    IDLE_STOP_SECONDS. Each worker owns its OWN YOLO instance so ByteTrack
    track-IDs stay per-camera (a shared model would mix IDs across cameras).
    """

    def __init__(self, cam_id: str):
        self.cam_id = cam_id
        self.source = rtsp_url(CAMERAS[cam_id], STREAM)
        self.model: YOLO | None = None
        self.cond = threading.Condition()
        self.latest_jpeg: bytes | None = None
        self.frame_seq = 0
        self.last_view_at = 0.0
        self.thread: threading.Thread | None = None
        self._start_lock = threading.Lock()

    def touch(self) -> None:
        """Mark a viewer as active — keeps the worker alive."""
        self.last_view_at = time.time()

    def ensure_running(self) -> None:
        with self._start_lock:
            if self.thread is not None and self.thread.is_alive():
                return
            self.touch()
            self.thread = threading.Thread(target=self._run, name=f"cam-{self.cam_id}", daemon=True)
            self.thread.start()

    def _run(self) -> None:
        if self.model is None:
            print(f"[{self.cam_id}] loading model {MODEL}")
            self.model = YOLO(MODEL)
        print(f"[{self.cam_id}] opening stream")
        cap = cv2.VideoCapture(self.source, cv2.CAP_FFMPEG)
        misses = 0
        try:
            while time.time() - self.last_view_at < IDLE_STOP_SECONDS:
                if not cap.isOpened():
                    cap = cv2.VideoCapture(self.source, cv2.CAP_FFMPEG)
                    time.sleep(0.5)
                    continue
                ok, frame = cap.read()
                if not ok:
                    misses += 1
                    if misses > 50:
                        cap.release()
                        cap = cv2.VideoCapture(self.source, cv2.CAP_FFMPEG)
                        misses = 0
                    continue
                misses = 0

                results = self.model.track(
                    frame, conf=CONF, persist=True, tracker="bytetrack.yaml", verbose=False
                )
                annotated = results[0].plot()
                ok, buf = cv2.imencode(
                    ".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY]
                )
                if not ok:
                    continue
                with self.cond:
                    self.latest_jpeg = buf.tobytes()
                    self.frame_seq += 1
                    self.cond.notify_all()
        finally:
            cap.release()
            print(f"[{self.cam_id}] worker stopped (idle)")

    def wait_for_frame(self, last_seq: int, timeout: float = 5.0):
        """Block until a frame newer than last_seq exists (or timeout).

        Pass last_seq=-1 to mean "give me the latest frame, waiting for the
        first one if none exists yet". The latest_jpeg-is-None guard makes the
        very first cold frame (model load + stream open) actually wait.
        """
        deadline = time.time() + timeout
        with self.cond:
            while self.frame_seq <= last_seq or self.latest_jpeg is None:
                remaining = deadline - time.time()
                if remaining <= 0:
                    break
                self.cond.wait(timeout=remaining)
            return self.latest_jpeg, self.frame_seq


_workers: dict[str, CameraWorker] = {}
_workers_lock = threading.Lock()


def get_worker(cam_id: str) -> CameraWorker:
    with _workers_lock:
        w = _workers.get(cam_id)
        if w is None:
            w = CameraWorker(cam_id)
            _workers[cam_id] = w
        return w


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
                "running": [c for c, w in _workers.items()
                            if w.thread is not None and w.thread.is_alive()],
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
        self.send_response(200)
        self.send_header("Content-Type", "image/jpeg")
        self.send_header("Content-Length", str(len(jpeg)))
        self.send_header("Cache-Control", "no-store")
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

    def _send_json(self, code: int, obj: dict):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    global MODEL, STREAM, CONF
    p = argparse.ArgumentParser(description="Localhost vision service (MJPEG detection feeds)")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8089)
    p.add_argument("--model", default=MODEL)
    p.add_argument("--stream", choices=["main", "sub"], default=STREAM)
    p.add_argument("--conf", type=float, default=CONF)
    args = p.parse_args()
    MODEL, STREAM, CONF = args.model, args.stream, args.conf

    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"[vision] serving on http://{args.host}:{args.port}")
    print(f"[vision] cameras: {', '.join(sorted(CAMERAS))}")
    print(f"[vision] try: http://{args.host}:{args.port}/stream/lobby")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[vision] shutting down")


if __name__ == "__main__":
    main()
