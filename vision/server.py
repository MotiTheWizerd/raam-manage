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
    GET /detections/<cam> latest frame's detections as JSON (class, conf,
                          track-id, box, per-class counts) — the data feed the
                          Next app reads to know what a camera actually sees
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
STREAM = "main"   # HD 1080p. localhost = free bandwidth; decode runs in the grabber thread.
CONF = 0.35
IDLE_STOP_SECONDS = 3.0   # stop a worker this long after its last viewer leaves.
                          # Kept short so cameras you've looked away from free the
                          # CPU fast — overlapping workers are what cause slowdowns.
JPEG_QUALITY = 90
BOUNDARY = "frame"

# Inference tuning for the CPU-only box. The grabber thread always keeps the
# NEWEST frame, so these just trade detail/CPU without ever building lag.
IMGSZ = 480              # YOLO inference size (was the implicit 640). 480 is a
                         # multiple of 32 and ~1.5-1.8x faster on CPU.
MAX_INFER_FPS = 20.0     # cap the inference rate. 20 = near-full-motion for the
                         # interactive views (gate popups, car-escort) at ~1 core
                         # per watched camera. Future headless "sentry" cams will
                         # instead run motion-adaptive (idle low, ramp on movement).
TORCH_THREADS = 6        # measured sweet spot for yolo11n on this box: ~36 fps at
                         # imgsz=480, vs only ~18 fps at 12 threads — past ~6
                         # threads the sync overhead beats the parallelism. Leaves
                         # cores free for the grabber's decode + the rest of the box.
CV2_THREADS = 2          # keep OpenCV ops from oversubscribing cores away from torch


class CameraWorker:
    """Reads one camera's RTSP, runs YOLO+tracking, holds the latest JPEG.

    Two threads per worker, so detection NEVER falls behind the live camera:

      * grabber  — owns the cv2 capture; reads frames as fast as they arrive and
        keeps ONLY the most recent one (everything in between is dropped). This
        keeps ffmpeg's receive buffer drained, so there is no growing backlog.
      * inference — takes whatever frame is newest, runs YOLO at most
        MAX_INFER_FPS. When the CPU can't keep up it simply skips frames instead
        of queueing them, so end-to-end lag stays ~one inference period forever.

    Lazy + self-stopping: ensure_running() (re)starts both threads; they exit on
    their own once no viewer has pulled a frame for IDLE_STOP_SECONDS. Each
    worker owns its OWN YOLO instance so ByteTrack track-IDs stay per-camera (a
    shared model would mix IDs across cameras).
    """

    def __init__(self, cam_id: str):
        self.cam_id = cam_id
        self.source = rtsp_url(CAMERAS[cam_id], STREAM)
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
            while time.time() - self.last_view_at < IDLE_STOP_SECONDS:
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
        """Run YOLO on the newest grabbed frame, capped at MAX_INFER_FPS."""
        if self.model is None:
            print(f"[{self.cam_id}] loading model {MODEL}")
            self.model = YOLO(MODEL)
        last_raw = -1
        min_interval = 1.0 / MAX_INFER_FPS if MAX_INFER_FPS > 0 else 0.0
        try:
            while time.time() - self.last_view_at < IDLE_STOP_SECONDS:
                # Block for a frame strictly newer than the one we last ran —
                # this skips everything the grabber overwrote in between.
                with self._raw_cond:
                    while self._raw_seq <= last_raw:
                        if time.time() - self.last_view_at >= IDLE_STOP_SECONDS:
                            return
                        self._raw_cond.wait(timeout=1.0)
                    frame = self._raw_frame
                    last_raw = self._raw_seq
                if frame is None:
                    continue

                t0 = time.time()
                results = self.model.track(
                    frame, conf=CONF, imgsz=IMGSZ, persist=True,
                    tracker="bytetrack.yaml", verbose=False,
                )
                result = results[0]
                annotated = result.plot()
                detections = self._extract(result)
                ok, buf = cv2.imencode(
                    ".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY]
                )
                if not ok:
                    continue
                with self.cond:
                    self.latest_jpeg = buf.tobytes()
                    self.latest_detections = detections
                    self.frame_wh = (frame.shape[1], frame.shape[0])
                    self.frame_seq += 1
                    self.cond.notify_all()

                # Hold the inference rate at MAX_INFER_FPS; the grabber keeps
                # refreshing the latest frame while we sleep, so we always resume
                # on a fresh one (never a stale queued one).
                spent = time.time() - t0
                if min_interval > spent:
                    time.sleep(min_interval - spent)
        finally:
            print(f"[{self.cam_id}] inference stopped (idle)")

    def _extract(self, result) -> list[dict]:
        """Pull structured detections out of one YOLO result.

        Each object: class name + id, confidence, ByteTrack track-id (None when
        tracking hasn't locked on yet), and the pixel box [x1,y1,x2,y2]. This is
        what the /detections endpoint serves — the data the app reasons over.
        """
        boxes = getattr(result, "boxes", None)
        if boxes is None or len(boxes) == 0:
            return []
        names = self.model.names if self.model else {}
        xyxy = boxes.xyxy.cpu().numpy()
        confs = boxes.conf.cpu().numpy()
        clss = boxes.cls.cpu().numpy()
        ids = boxes.id.cpu().numpy() if boxes.id is not None else None
        out: list[dict] = []
        for i in range(len(xyxy)):
            cls_id = int(clss[i])
            x1, y1, x2, y2 = xyxy[i]
            out.append({
                "cls": names.get(cls_id, str(cls_id)),
                "cls_id": cls_id,
                "conf": round(float(confs[i]), 3),
                "id": int(ids[i]) if ids is not None else None,
                "box": [round(float(x1)), round(float(y1)), round(float(x2)), round(float(y2))],
            })
        return out

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
                            if w.infer_thread is not None and w.infer_thread.is_alive()],
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

    # CPU thread budgeting: give torch the physical cores for inference and keep
    # OpenCV's own parallelism small so frame decode/encode doesn't fight it.
    import torch
    torch.set_num_threads(TORCH_THREADS)
    cv2.setNumThreads(CV2_THREADS)
    print(f"[vision] torch threads={TORCH_THREADS} cv2 threads={CV2_THREADS} "
          f"imgsz={IMGSZ} max_infer_fps={MAX_INFER_FPS}")

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
