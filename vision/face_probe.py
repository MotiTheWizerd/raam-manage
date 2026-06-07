"""
Face recognition sentry — the testing rig (and seed) for the recognition arc.

A resident looks at a camera; if we recognize them, the matching door unlocks.
Built to scale to MANY cameras: one shared FaceEngine (model + enrolled DB +
matching + door control) is reused by N lightweight CameraWorkers, one per
camera. Each worker is MOTION-GATED — it does almost nothing while its view is
still, and only runs the expensive recognition when something actually moves.
So an idle building costs near-zero CPU and never slows the web app sharing
this box; add more cameras and the cost still tracks real activity, not count.

Serves annotated MJPEG on its own port (8090, LAN-bound) so testing can be
watched on a laptop on the building wifi:

    live (default cam):  http://10.0.0.127:8090/
    a specific cam:      http://10.0.0.127:8090/lobby   (or /street, /lower, …)
    enroll:              http://10.0.0.127:8090/enroll?name=moti
    who's saved:         http://10.0.0.127:8090/list
    live-tune:           http://10.0.0.127:8090/threshold?v=0.30&px=30
    door arm/disarm:     http://10.0.0.127:8090/door?arm=0   (…?arm=1 to re-arm)
    manual door fire:    http://10.0.0.127:8090/door

Run:
    .venv/Scripts/python face_probe.py                 # serves all cams lazily
    .venv/Scripts/python face_probe.py --no-door       # recognize but never open
"""

from __future__ import annotations

import os

os.environ.setdefault("OPENCV_FFMPEG_LOGLEVEL", "-8")

import argparse
import http.cookiejar
import json
import ssl
import threading
import time
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

import cv2
import numpy as np
from insightface.app import FaceAnalysis

from detect import CAMERAS, rtsp_url

# --- config ----------------------------------------------------------------
STREAM = "main"
DEFAULT_CAM = "lobby"
BOUNDARY = "frame"
DB_PATH = os.path.join(os.path.dirname(__file__), "faces_db.json")

# recognition / door thresholds (live-tunable via /threshold)
MATCH_THRESHOLD = 0.30     # cosine similarity for "this is them"
DOOR_MIN_SCORE = 0.30      # must clear this to open (strangers score ~0.0-0.1)
DOOR_MIN_PX = 30           # require a real, close-enough face
DOOR_CONFIRM_FRAMES = 3    # consecutive matching frames before firing
DOOR_COOLDOWN = 12.0       # don't re-open a door within this many seconds

ENROLL_SECONDS = 5.0
MIN_ENROLL_PX = 60

# performance — the keys to scaling across cameras on a CPU box
ORT_THREADS = 4            # cap onnxruntime cores (default grabs ALL 16 -> starves the web app)
ACTIVE_FPS = 8.0           # inference rate while something is moving
IDLE_FPS = 4.0             # cheap pass-through rate while the view is still
MOTION_RATIO = 0.004       # fraction of pixels that must change to count as motion
MOTION_LINGER = 2.0        # keep recognizing this long after the last motion

# which door each camera opens: cam_id -> (geovision ctrl_id, dr_id). Add cams
# here as we deploy them (e.g. a pool cam -> the pool door). Default = lobby.
CAM_DOOR = {"lobby": (4, 0)}
DEFAULT_DOOR = (4, 0)

# --- GeoVision door client (shared) ----------------------------------------
DOOR_BASE = "https://localhost/ASWeb"
DOOR_ENDPOINT = DOOR_BASE + "/bin/ControllerList.srf"
DOOR_USER, DOOR_PASS = "admin", "Sami0207!"

_ssl_ctx = ssl.create_default_context()
_ssl_ctx.check_hostname = False
_ssl_ctx.verify_mode = ssl.CERT_NONE  # GeoWebServer self-signed cert on localhost
# A cookie jar captures GvWebSessionID across the /Login/ 302 redirect (urllib
# auto-follows it and would otherwise drop the Set-Cookie, unlike node https).
_door_jar = http.cookiejar.CookieJar()
_door_opener = urllib.request.build_opener(
    urllib.request.HTTPSHandler(context=_ssl_ctx),
    urllib.request.HTTPCookieProcessor(_door_jar),
)
_door_session = {"guid": None}
_door_lock = threading.Lock()
_door_armed = True


def _door_post(url: str, fields: dict):
    data = urllib.parse.urlencode(fields).encode()
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    with _door_opener.open(req, timeout=8) as r:
        return r.status, r.read().decode("utf-8", "replace")


def _door_login() -> str:
    _door_jar.clear()
    _door_post(DOOR_BASE + "/Login/",
               {"username": DOOR_USER, "password": DOOR_PASS, "end": "end"})
    if not any(c.name == "GvWebSessionID" for c in _door_jar):
        raise RuntimeError("door login failed (no GvWebSessionID)")
    _, body = _door_post(DOOR_ENDPOINT,
                         {"action": "WEBCLIENT_LOGIN", "module": "monitor",
                          "client_guid": "", "login": "1"})
    guid = (json.loads(body) if body else {}).get("client_guid")
    if not guid:
        raise RuntimeError("door register failed")
    return guid


def open_door(ctrl_id: int, dr_id: int) -> tuple[bool, str]:
    """One momentary unlock, re-auth + retry once (doors.ts pattern)."""
    for attempt in range(2):
        try:
            if not _door_session["guid"]:
                _door_session["guid"] = _door_login()
        except Exception as e:
            _door_session["guid"] = None
            if attempt == 1:
                return False, str(e)
            continue
        try:
            st, body = _door_post(DOOR_ENDPOINT, {
                "action": "DOOR_OPERATION", "module": "monitor", "dvg_id": "0",
                "ctrl_id": str(ctrl_id), "dr_id": str(dr_id),
                "operation": "UNLOCK_DOOR", "client_guid": _door_session["guid"],
                "reason": "raam-face",
            })
            j = json.loads(body) if body else {}
            if j.get("success") == 1:
                return True, "ok"
            _door_session["guid"] = None
            if attempt == 1:
                return False, str(j.get("errmsg", f"status {st}"))
        except Exception as e:
            _door_session["guid"] = None
            if attempt == 1:
                return False, str(e)
    return False, "failed"


# --- shared recognition engine ---------------------------------------------
class FaceEngine:
    """The reusable brain: the face model + enrolled templates + matching.

    One instance is shared by every CameraWorker (the onnxruntime sessions are
    thread-safe to call), so adding cameras costs no extra model memory.
    """

    def __init__(self, det: int):
        # Cap onnxruntime's thread pool BEFORE building any session — by default
        # it uses every core on every inference and starved the web app.
        import onnxruntime as ort
        _orig = ort.InferenceSession

        def _capped(*a, **k):
            if not k.get("sess_options"):
                so = ort.SessionOptions()
                so.intra_op_num_threads = ORT_THREADS
                so.inter_op_num_threads = 1
                k["sess_options"] = so
            return _orig(*a, **k)

        ort.InferenceSession = _capped
        print("[face] loading buffalo_l (SCRFD detect + ArcFace recognition) on CPU…")
        self.app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"],
                                allowed_modules=["detection", "recognition"])
        self.app.prepare(ctx_id=0, det_size=(det, det))
        self.db: dict[str, np.ndarray] = {}
        self.db_lock = threading.Lock()
        self._load_db()

    def _load_db(self) -> None:
        if not os.path.exists(DB_PATH):
            return
        with open(DB_PATH, "r", encoding="utf-8") as f:
            raw = json.load(f)
        with self.db_lock:
            self.db = {k: np.asarray(v, dtype=np.float32) for k, v in raw.items()}
        print(f"[face] loaded {len(self.db)} enrolled: {', '.join(self.db) or '(none)'}")

    def save_db(self) -> None:
        with self.db_lock:
            raw = {k: v.tolist() for k, v in self.db.items()}
        with open(DB_PATH, "w", encoding="utf-8") as f:
            json.dump(raw, f)

    def enroll(self, name: str, samples: list[np.ndarray]) -> int:
        mean = np.mean(np.stack(samples), axis=0)
        mean = mean / (np.linalg.norm(mean) + 1e-9)
        with self.db_lock:
            self.db[name] = mean.astype(np.float32)
        self.save_db()
        return len(samples)

    def forget(self, name: str) -> bool:
        with self.db_lock:
            existed = self.db.pop(name, None) is not None
        if existed:
            self.save_db()
        return existed

    def names(self) -> list[str]:
        with self.db_lock:
            return sorted(self.db)

    def best_match(self, emb: np.ndarray) -> tuple[str | None, float]:
        with self.db_lock:
            if not self.db:
                return None, 0.0
            names = list(self.db)
            mat = np.stack([self.db[n] for n in names])
        sims = mat @ emb  # cosine (both sides L2-normalized)
        i = int(np.argmax(sims))
        return names[i], float(sims[i])


# --- per-camera worker ------------------------------------------------------
class CameraWorker:
    """One camera: a grabber thread (newest frame only) + a motion-gated
    recognition thread. Reusable — every camera is just another instance."""

    def __init__(self, cam_id: str, engine: FaceEngine):
        self.cam_id = cam_id
        self.engine = engine
        self.source = rtsp_url(CAMERAS[cam_id], STREAM)
        self.door = CAM_DOOR.get(cam_id, DEFAULT_DOOR)

        self.cond = threading.Condition()           # annotated jpeg -> viewers
        self.latest_jpeg: bytes | None = None
        self.seq = 0

        self._raw_cond = threading.Condition()       # newest raw frame -> loop
        self._raw_frame = None
        self._raw_seq = 0

        self._prev_gray = None
        self._streak = 0
        self._last_open = 0.0
        self._enroll = {"active": False, "name": "", "until": 0.0, "samples": []}
        self._msg = ""
        self._msg_until = 0.0
        self._started = False
        self._lock = threading.Lock()

    def ensure_running(self) -> None:
        with self._lock:
            if self._started:
                return
            self._started = True
            threading.Thread(target=self._grab, name=f"grab-{self.cam_id}", daemon=True).start()
            threading.Thread(target=self._loop, name=f"rec-{self.cam_id}", daemon=True).start()

    def start_enroll(self, name: str) -> None:
        self._enroll = {"active": True, "name": name,
                        "until": time.time() + ENROLL_SECONDS, "samples": []}

    # ---- threads ----
    def _grab(self) -> None:
        cap = cv2.VideoCapture(self.source, cv2.CAP_FFMPEG)
        misses = 0
        while True:
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
            with self._raw_cond:
                self._raw_frame = frame
                self._raw_seq += 1
                self._raw_cond.notify_all()

    def _has_motion(self, frame) -> bool:
        small = cv2.resize(frame, (320, 180))
        gray = cv2.GaussianBlur(cv2.cvtColor(small, cv2.COLOR_BGR2GRAY), (5, 5), 0)
        prev, self._prev_gray = self._prev_gray, gray
        if prev is None:
            return False
        diff = cv2.absdiff(gray, prev)
        _, th = cv2.threshold(diff, 25, 255, cv2.THRESH_BINARY)
        return (cv2.countNonZero(th) / th.size) > MOTION_RATIO

    def _loop(self) -> None:
        last_raw = -1
        last_motion = 0.0
        while True:
            with self._raw_cond:
                while self._raw_seq <= last_raw:
                    self._raw_cond.wait(timeout=1.0)
                frame = self._raw_frame
                last_raw = self._raw_seq
            if frame is None:
                continue
            t0 = time.time()

            if self._has_motion(frame):
                last_motion = t0
            enrolling = self._enroll["active"]
            active = enrolling or (t0 - last_motion) < MOTION_LINGER

            if active:
                self._recognize(frame, enrolling)
                interval = 1.0 / ACTIVE_FPS
            else:
                # idle: cheap pass-through, no inference
                self._banner(frame, "idle - watching for motion", (150, 150, 150))
                interval = 1.0 / IDLE_FPS

            ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
            if ok:
                with self.cond:
                    self.latest_jpeg = buf.tobytes()
                    self.seq += 1
                    self.cond.notify_all()

            spent = time.time() - t0
            if interval > spent:
                time.sleep(interval - spent)

    def _recognize(self, frame, enrolling: bool) -> None:
        faces = self.engine.app.get(frame)
        biggest = None
        for f in faces:
            if biggest is None or (f.bbox[3] - f.bbox[1]) > (biggest.bbox[3] - biggest.bbox[1]):
                biggest = f

        if biggest is None:
            self._streak = 0
            self._banner(frame, "no face", (0, 215, 255))
            return

        x1, y1, x2, y2 = biggest.bbox.astype(int)
        px = int(y2 - y1)
        emb = biggest.normed_embedding
        color = (0, 215, 255)

        if enrolling:
            if px >= MIN_ENROLL_PX:
                self._enroll["samples"].append(emb)
            n = len(self._enroll["samples"])
            text = f"ENROLLING {self._enroll['name']}: {n} samples (face {px}px)"
            color = (255, 180, 0)
            if time.time() >= self._enroll["until"]:
                self._enroll["active"] = False
                self._finish_enroll()
        else:
            name, score = self.engine.best_match(emb)
            if name is not None and score >= MATCH_THRESHOLD:
                text = f"MATCH: {name} ({score:.2f}) face {px}px"
                color = (0, 220, 0)
                self._maybe_open(name, score, px)
            else:
                who = f"closest {name} {score:.2f}" if name else "no one enrolled"
                text = f"UNKNOWN ({who}) face {px}px"
                self._streak = 0

        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        if biggest.kps is not None:
            for (kx, ky) in biggest.kps.astype(int):
                cv2.circle(frame, (kx, ky), 2, color, -1)
        self._banner(frame, text, color)

    def _maybe_open(self, name: str, score: float, px: int) -> None:
        now = time.time()
        if not _door_armed:
            return
        if score >= DOOR_MIN_SCORE and px >= DOOR_MIN_PX:
            self._streak += 1
        else:
            self._streak = 0
        if self._streak >= DOOR_CONFIRM_FRAMES and now - self._last_open >= DOOR_COOLDOWN:
            self._last_open = now
            self._streak = 0
            threading.Thread(target=self._fire, args=(name,), daemon=True).start()

    def _fire(self, name: str) -> None:
        ok, msg = open_door(*self.door)
        self._msg = f"OPENED DOOR -> {name}" if ok else f"DOOR ERROR: {msg}"
        self._msg_until = time.time() + 4.0
        print(f"[{self.cam_id}] {'opened for ' + name if ok else 'door ERROR ' + msg}")

    def _finish_enroll(self) -> None:
        samples = self._enroll["samples"]
        if len(samples) < 3:
            self._msg = f"enroll FAILED: only {len(samples)} samples — try again"
        else:
            n = self.engine.enroll(self._enroll["name"], samples)
            self._msg = f"SAVED {self._enroll['name']} from {n} samples"
            print(f"[{self.cam_id}] {self._msg}")
        self._msg_until = time.time() + 4.0

    def _banner(self, frame, text: str, color) -> None:
        if self._msg and time.time() < self._msg_until:
            text, color = self._msg, (0, 220, 0)
        cv2.rectangle(frame, (0, 0), (frame.shape[1], 46), (0, 0, 0), -1)
        cv2.putText(frame, f"[{self.cam_id}] {text}", (12, 33),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.9, color, 2, cv2.LINE_AA)

    def wait_jpeg(self, last: int, timeout: float = 5.0):
        deadline = time.time() + timeout
        with self.cond:
            while self.seq <= last or self.latest_jpeg is None:
                rem = deadline - time.time()
                if rem <= 0:
                    break
                self.cond.wait(timeout=rem)
            return self.latest_jpeg, self.seq


_engine: FaceEngine | None = None
_workers: dict[str, CameraWorker] = {}
_workers_lock = threading.Lock()


def get_worker(cam_id: str) -> CameraWorker:
    with _workers_lock:
        w = _workers.get(cam_id)
        if w is None:
            w = CameraWorker(cam_id, _engine)
            _workers[cam_id] = w
        w.ensure_running()
        return w


# --- HTTP -------------------------------------------------------------------
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

    def do_GET(self):
        global MATCH_THRESHOLD, DOOR_MIN_SCORE, DOOR_MIN_PX, _door_armed
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
            self._json(200, {"enrolled": _engine.names(), "threshold": MATCH_THRESHOLD,
                             "door_score": DOOR_MIN_SCORE, "door_px": DOOR_MIN_PX,
                             "armed": _door_armed,
                             "running": sorted(_workers)})
            return

        if head == "enroll":
            cam = (qs.get("cam", [DEFAULT_CAM])[0])
            cam = cam if cam in CAMERAS else DEFAULT_CAM
            name = (qs.get("name", ["resident"])[0]).strip() or "resident"
            get_worker(cam).start_enroll(name)
            self._json(200, {"ok": True, "enrolling": name, "cam": cam,
                             "msg": f"Look at the {cam} camera for {ENROLL_SECONDS:.0f}s…"})
            return

        if head == "threshold":
            try:
                if "v" in qs:
                    MATCH_THRESHOLD = DOOR_MIN_SCORE = float(qs["v"][0])
                if "px" in qs:
                    DOOR_MIN_PX = int(qs["px"][0])
            except ValueError:
                self._json(400, {"error": "use ?v=0.30 and/or ?px=30"})
                return
            self._json(200, {"ok": True, "threshold": MATCH_THRESHOLD,
                             "door_score": DOOR_MIN_SCORE, "door_px": DOOR_MIN_PX})
            return

        if head == "forget":
            name = (qs.get("name", [""])[0]).strip()
            self._json(200, {"ok": _engine.forget(name), "forgot": name})
            return

        if head == "door":
            if "arm" in qs:
                _door_armed = qs["arm"][0] not in ("0", "false", "off", "no")
                self._json(200, {"ok": True, "armed": _door_armed})
                return
            ctrl, dr = CAM_DOOR.get(DEFAULT_CAM, DEFAULT_DOOR)
            threading.Thread(target=open_door, args=(ctrl, dr), daemon=True).start()
            self._json(200, {"ok": True, "msg": "opening door…"})
            return

        self._json(404, {"error": "not found"})

    def _serve_snapshot(self, cam: str):
        jpeg, _ = get_worker(cam).wait_jpeg(-1, timeout=15.0)
        if jpeg is None:
            self._json(503, {"error": "no frame yet"})
            return
        self.close_connection = True
        self.send_response(200)
        self.send_header("Content-Type", "image/jpeg")
        self.send_header("Content-Length", str(len(jpeg)))
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(jpeg)

    def _serve_stream(self, cam: str):
        worker = get_worker(cam)
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


def main() -> None:
    global _engine, _door_armed
    p = argparse.ArgumentParser(description="Face recognition sentry")
    p.add_argument("--host", default="0.0.0.0")
    p.add_argument("--port", type=int, default=8090)
    p.add_argument("--det", type=int, default=640)
    p.add_argument("--cam", default=DEFAULT_CAM, choices=sorted(CAMERAS),
                   help="camera to pre-warm at startup (others start on first view)")
    p.add_argument("--no-door", action="store_true",
                   help="recognize but never open the door")
    args = p.parse_args()

    cv2.setNumThreads(2)
    if args.no_door:
        _door_armed = False
    _engine = FaceEngine(args.det)
    print(f"[face] ready. threshold={MATCH_THRESHOLD} px={DOOR_MIN_PX} "
          f"armed={_door_armed} ort_threads={ORT_THREADS}")

    get_worker(args.cam)  # pre-warm the main camera

    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"[face] serving on http://{args.host}:{args.port}/  (default cam={args.cam})")
    print(f"[face] laptop: http://10.0.0.127:{args.port}/   enroll: …/enroll?name=moti")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[face] shutting down")


if __name__ == "__main__":
    main()
