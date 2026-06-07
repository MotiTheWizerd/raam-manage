"""
Face recognition probe — the testing rig for the recognition arc.

Stand at the door, look at the camera, and the live banner (watch it on a laptop
on the building wifi) tells you the biggest face's pixel size AND — once you've
enrolled — whether it recognizes you.

Hands-free enrollment: tap the enroll URL on the laptop while standing in place.
It captures your face for a few seconds, averages the embeddings into your
template, and saves it. After that the banner shows MATCH: <name> (<score>).

Serves on its OWN port (8090) so it never disturbs the live detection service
(server.py on 8089). Open on a laptop on the building wifi:

    live view:   http://10.0.0.127:8090/
    enroll:      http://10.0.0.127:8090/enroll?name=moti
    who's saved: http://10.0.0.127:8090/list

Run:
    .venv/Scripts/python face_probe.py                 # lobby cam, port 8090
    .venv/Scripts/python face_probe.py --cam lower --det 800
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

BOUNDARY = "frame"
DB_PATH = os.path.join(os.path.dirname(__file__), "faces_db.json")
MATCH_THRESHOLD = 0.30   # cosine similarity; tune live via /threshold?v=0.30
ENROLL_SECONDS = 5.0     # how long an enroll capture collects samples
MIN_ENROLL_PX = 60       # ignore tiny faces while enrolling
MAX_FPS = 12.0

# --- open the lobby door on a confident recognition (GeoVision ctrl4/dr0) ---
DOOR_BASE = "https://localhost/ASWeb"
DOOR_ENDPOINT = DOOR_BASE + "/bin/ControllerList.srf"
DOOR_USER, DOOR_PASS = "admin", "Sami0207!"
DOOR_CTRL, DOOR_DR = 4, 0
DOOR_MIN_SCORE = 0.30      # must clear this to open (strangers score ~0.0-0.1)
DOOR_MIN_PX = 30           # require a real, close-enough face (not a tiny blob)
DOOR_CONFIRM_FRAMES = 3    # consecutive matching frames before firing
DOOR_COOLDOWN = 12.0       # don't re-open within this many seconds

_ssl_ctx = ssl.create_default_context()
_ssl_ctx.check_hostname = False
_ssl_ctx.verify_mode = ssl.CERT_NONE  # GeoWebServer self-signed cert on localhost

# A cookie jar captures GvWebSessionID even though /Login/ answers with a 302
# (urllib auto-follows the redirect; the jar grabs the Set-Cookie regardless).
_door_jar = http.cookiejar.CookieJar()
_door_opener = urllib.request.build_opener(
    urllib.request.HTTPSHandler(context=_ssl_ctx),
    urllib.request.HTTPCookieProcessor(_door_jar),
)

_door = {"armed": True, "streak": 0, "last_open": 0.0, "msg": "", "msg_until": 0.0}
_door_lock = threading.Lock()
_door_session = {"guid": None}

# shared latest annotated JPEG (detection -> HTTP viewers)
_cond = threading.Condition()
_latest_jpeg: bytes | None = None
_seq = 0

# shared latest RAW frame (grabber -> detection); only the newest is kept
_raw_cond = threading.Condition()
_raw_frame = None
_raw_seq = 0

# enrolled templates: name -> np.array(512) L2-normalized
_db: dict[str, np.ndarray] = {}
_db_lock = threading.Lock()

# enroll request set by the /enroll endpoint, consumed by the detection loop
_enroll = {"active": False, "name": "", "until": 0.0, "samples": []}
_enroll_lock = threading.Lock()
_status = ""  # last enroll status, shown briefly on the banner


def load_db() -> None:
    global _db
    if not os.path.exists(DB_PATH):
        return
    with open(DB_PATH, "r", encoding="utf-8") as f:
        raw = json.load(f)
    with _db_lock:
        _db = {k: np.asarray(v, dtype=np.float32) for k, v in raw.items()}
    print(f"[face] loaded {len(_db)} enrolled: {', '.join(_db) or '(none)'}")


def save_db() -> None:
    with _db_lock:
        raw = {k: v.tolist() for k, v in _db.items()}
    with open(DB_PATH, "w", encoding="utf-8") as f:
        json.dump(raw, f)


def _door_post(url: str, fields: dict):
    data = urllib.parse.urlencode(fields).encode()
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    with _door_opener.open(req, timeout=8) as r:  # jar adds/collects cookies
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


def open_lobby_door() -> tuple[bool, str]:
    """One momentary unlock of the lobby door, re-auth + retry once (doors.ts pattern)."""
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
                "ctrl_id": str(DOOR_CTRL), "dr_id": str(DOOR_DR),
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


def _fire_door(name: str) -> None:
    ok, msg = open_lobby_door()
    with _door_lock:
        _door["msg"] = f"OPENED DOOR -> {name}" if ok else f"DOOR ERROR: {msg}"
        _door["msg_until"] = time.time() + 4.0
    print(f"[door] {'opened for ' + name if ok else 'ERROR ' + msg}")


def maybe_open_door(name: str, score: float, px: int) -> None:
    """Fire the door on a sustained, confident, close-enough match (with cooldown)."""
    now = time.time()
    with _door_lock:
        if not _door["armed"]:
            return
        if score >= DOOR_MIN_SCORE and px >= DOOR_MIN_PX:
            _door["streak"] += 1
        else:
            _door["streak"] = 0
        fire = (_door["streak"] >= DOOR_CONFIRM_FRAMES
                and now - _door["last_open"] >= DOOR_COOLDOWN)
        if fire:
            _door["last_open"] = now
            _door["streak"] = 0
    if fire:
        threading.Thread(target=_fire_door, args=(name,), daemon=True).start()


def grabber(src: str) -> None:
    """Drain the camera, keeping only the newest frame (server.py pattern)."""
    global _raw_frame, _raw_seq
    cap = cv2.VideoCapture(src, cv2.CAP_FFMPEG)
    misses = 0
    while True:
        if not cap.isOpened():
            cap = cv2.VideoCapture(src, cv2.CAP_FFMPEG)
            time.sleep(0.5)
            continue
        ok, frame = cap.read()
        if not ok:
            misses += 1
            if misses > 50:
                cap.release()
                cap = cv2.VideoCapture(src, cv2.CAP_FFMPEG)
                misses = 0
            continue
        misses = 0
        with _raw_cond:
            _raw_frame = frame
            _raw_seq += 1
            _raw_cond.notify_all()


def best_match(emb: np.ndarray) -> tuple[str | None, float]:
    """Return (name, score) of the closest enrolled template, or (None, score)."""
    with _db_lock:
        if not _db:
            return None, 0.0
        names = list(_db)
        mat = np.stack([_db[n] for n in names])  # (N, 512), already normalized
    sims = mat @ emb  # cosine since both sides are L2-normalized
    i = int(np.argmax(sims))
    return names[i], float(sims[i])


def detection_loop(app: FaceAnalysis) -> None:
    global _latest_jpeg, _seq, _status
    last_raw = -1
    min_interval = 1.0 / MAX_FPS
    while True:
        with _raw_cond:
            while _raw_seq <= last_raw:
                _raw_cond.wait(timeout=1.0)
            frame = _raw_frame
            last_raw = _raw_seq
        if frame is None:
            continue
        t0 = time.time()

        faces = app.get(frame)
        # The "presented" face = the biggest one in frame.
        biggest = None
        for f in faces:
            x1, y1, x2, y2 = f.bbox.astype(int)
            if biggest is None or (y2 - y1) > (biggest.bbox[3] - biggest.bbox[1]):
                biggest = f

        banner = "no face detected"
        color = (200, 200, 200)

        if biggest is not None:
            x1, y1, x2, y2 = biggest.bbox.astype(int)
            px = int(y2 - y1)
            emb = biggest.normed_embedding

            with _enroll_lock:
                enrolling = _enroll["active"]

            if enrolling:
                with _enroll_lock:
                    if px >= MIN_ENROLL_PX:
                        _enroll["samples"].append(emb)
                    n = len(_enroll["samples"])
                    done = time.time() >= _enroll["until"]
                    name = _enroll["name"]
                    if done:
                        _enroll["active"] = False
                if done:
                    _finish_enroll(name)
                banner = f"ENROLLING {name}: {n} samples  (face {px}px)"
                color = (255, 180, 0)
            else:
                name, score = best_match(emb)
                if name is not None and score >= MATCH_THRESHOLD:
                    banner = f"MATCH: {name} ({score:.2f})  face {px}px"
                    color = (0, 220, 0)
                    maybe_open_door(name, score, px)
                else:
                    who = f"closest {name} {score:.2f}" if name else "no one enrolled"
                    banner = f"UNKNOWN  ({who})  face {px}px"
                    color = (0, 215, 255)
                    with _door_lock:
                        _door["streak"] = 0

            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            if biggest.kps is not None:
                for (kx, ky) in biggest.kps.astype(int):
                    cv2.circle(frame, (kx, ky), 2, color, -1)
        else:
            with _door_lock:
                _door["streak"] = 0

        # one-shot status (e.g. "saved moti from 47 samples") shown after enroll
        if _status:
            banner = _status
        # door open/error message takes over the banner briefly
        with _door_lock:
            if _door["msg"] and time.time() < _door["msg_until"]:
                banner = _door["msg"]
                color = (0, 220, 0)

        cv2.rectangle(frame, (0, 0), (frame.shape[1], 46), (0, 0, 0), -1)
        cv2.putText(frame, banner, (12, 33), cv2.FONT_HERSHEY_SIMPLEX,
                    0.95, color, 2, cv2.LINE_AA)

        ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        if not ok:
            continue
        with _cond:
            _latest_jpeg = buf.tobytes()
            _seq += 1
            _cond.notify_all()

        spent = time.time() - t0
        if min_interval > spent:
            time.sleep(min_interval - spent)


def _finish_enroll(name: str) -> None:
    global _status
    with _enroll_lock:
        samples = list(_enroll["samples"])
        _enroll["samples"] = []
    if len(samples) < 3:
        _status = f"enroll {name} FAILED: only {len(samples)} samples — try again, hold still"
        return
    mean = np.mean(np.stack(samples), axis=0)
    mean = mean / (np.linalg.norm(mean) + 1e-9)  # re-normalize the average
    with _db_lock:
        _db[name] = mean.astype(np.float32)
    save_db()
    _status = f"SAVED {name} from {len(samples)} samples"
    print(f"[face] {_status}")
    # let the status linger a moment, then clear so live recognition resumes
    threading.Timer(4.0, _clear_status).start()


def _clear_status() -> None:
    global _status
    _status = ""


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):
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
        global MATCH_THRESHOLD, DOOR_MIN_SCORE, DOOR_MIN_PX
        path = urlparse(self.path).path

        if path == "/enroll":
            qs = parse_qs(urlparse(self.path).query)
            name = (qs.get("name", ["resident"])[0]).strip() or "resident"
            with _enroll_lock:
                _enroll.update(active=True, name=name,
                               until=time.time() + ENROLL_SECONDS, samples=[])
            self._json(200, {"ok": True, "enrolling": name,
                             "seconds": ENROLL_SECONDS,
                             "msg": f"Look at the camera for {ENROLL_SECONDS:.0f}s…"})
            return

        if path == "/list":
            with _db_lock:
                names = sorted(_db)
            self._json(200, {"enrolled": names, "count": len(names),
                             "threshold": MATCH_THRESHOLD, "door_score": DOOR_MIN_SCORE,
                             "door_px": DOOR_MIN_PX})
            return

        if path == "/threshold":
            qs = parse_qs(urlparse(self.path).query)
            try:
                if "v" in qs:
                    MATCH_THRESHOLD = DOOR_MIN_SCORE = float(qs["v"][0])
                if "px" in qs:
                    DOOR_MIN_PX = int(qs["px"][0])
            except ValueError:
                self._json(400, {"error": "use ?v=0.35 and/or ?px=70"})
                return
            self._json(200, {"ok": True, "threshold": MATCH_THRESHOLD,
                             "door_score": DOOR_MIN_SCORE, "door_px": DOOR_MIN_PX})
            return

        if path == "/door":
            qs = parse_qs(urlparse(self.path).query)
            if "arm" in qs:
                on = qs["arm"][0] not in ("0", "false", "off", "no")
                with _door_lock:
                    _door["armed"] = on
                self._json(200, {"ok": True, "armed": on})
                return
            # manual test fire
            threading.Thread(target=_fire_door, args=("manual",), daemon=True).start()
            self._json(200, {"ok": True, "msg": "opening lobby door…"})
            return

        if path == "/forget":
            qs = parse_qs(urlparse(self.path).query)
            name = (qs.get("name", [""])[0]).strip()
            with _db_lock:
                existed = _db.pop(name, None) is not None
            if existed:
                save_db()
            self._json(200, {"ok": existed, "forgot": name})
            return

        if path.startswith("/snapshot"):
            with _cond:
                while _latest_jpeg is None:
                    if not _cond.wait(timeout=15.0):
                        break
                jpeg = _latest_jpeg
            if jpeg is None:
                self.send_response(503); self.end_headers(); return
            self.close_connection = True
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Content-Length", str(len(jpeg)))
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(jpeg)
            return

        # default: live MJPEG
        self.send_response(200)
        self.send_header("Content-Type",
                         f"multipart/x-mixed-replace; boundary={BOUNDARY}")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.end_headers()
        last = -1
        try:
            while True:
                with _cond:
                    while _seq <= last or _latest_jpeg is None:
                        if not _cond.wait(timeout=5.0):
                            break
                    jpeg = _latest_jpeg
                    last = _seq
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
    p = argparse.ArgumentParser(description="Face recognition probe")
    p.add_argument("--cam", choices=sorted(CAMERAS), default="lobby")
    p.add_argument("--host", default="0.0.0.0")
    p.add_argument("--port", type=int, default=8090)
    p.add_argument("--det", type=int, default=640,
                   help="SCRFD detector size (bigger = catches smaller faces, slower)")
    p.add_argument("--no-door", action="store_true",
                   help="disarm the auto door-open (recognition still shows on screen)")
    args = p.parse_args()

    if args.no_door:
        _door["armed"] = False

    cv2.setNumThreads(2)
    print("[face] loading buffalo_l (SCRFD detect + ArcFace recognition) on CPU…")
    app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"],
                       allowed_modules=["detection", "recognition"])
    app.prepare(ctx_id=0, det_size=(args.det, args.det))
    load_db()
    print(f"[face] model ready. detector size = {args.det}, match threshold = {MATCH_THRESHOLD}")

    src = rtsp_url(CAMERAS[args.cam], "main")
    threading.Thread(target=grabber, args=(src,), daemon=True).start()
    threading.Thread(target=detection_loop, args=(app,), daemon=True).start()

    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"[face] serving on http://{args.host}:{args.port}/  (cam={args.cam})")
    print(f"[face] laptop:  http://10.0.0.127:{args.port}/   enroll: …/enroll?name=moti")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[face] shutting down")


if __name__ == "__main__":
    main()
