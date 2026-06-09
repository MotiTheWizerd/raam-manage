"""Per-camera worker: a grabber thread (newest frame only) + a motion-gated
recognition thread. Reusable — every camera is just another instance.

The worker is the orchestrator: it owns no model, no door, no event store of its
own — those are INJECTED (engine, gallery, door, events) so adding cameras costs
no extra model memory and the collaborators stay swappable/testable. It reads all
tuning live from `settings`.
"""

from __future__ import annotations

import threading
import time

import cv2

from detect import CAMERAS, rtsp_url

from . import audio, overlay
from .accumulator import VoteAccumulator
from .enroll import EnrollSession
from .quality import frame_weight, frontality
from .settings import CAM_DOOR, DEFAULT_DOOR, STREAM, settings


class CameraWorker:
    def __init__(self, cam_id: str, engine, gallery, door, events):
        self.cam_id = cam_id
        self.engine = engine        # FaceEngine (shared)
        self.gallery = gallery      # FaceGallery (shared)
        self.door = door            # GeoVisionDoor (shared)
        self.events = events        # EventLog (shared)
        self.source = rtsp_url(CAMERAS[cam_id], STREAM)
        self.door_target = CAM_DOOR.get(cam_id, DEFAULT_DOOR)

        self.cond = threading.Condition()           # annotated jpeg -> viewers
        self.latest_jpeg: bytes | None = None
        self.seq = 0

        self._raw_cond = threading.Condition()       # newest raw frame -> loop
        self._raw_frame = None
        self._raw_seq = 0

        self._prev_gray = None
        self._accum = VoteAccumulator()
        self._last_reason: dict | None = None   # latest per-frame decision (for /debug)
        self._infer_ms = 0.0                     # last detect+recognize cost
        self._last_open = 0.0
        self._last_event_key: str | None = None
        self._last_event_ts = 0.0
        self._enroll = EnrollSession()
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
        self._enroll.arm(name, settings.enroll_wait_seconds)

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
        return (cv2.countNonZero(th) / th.size) > settings.motion_ratio

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
            enrolling = self._enroll.active
            active = enrolling or (t0 - last_motion) < settings.motion_linger

            if active:
                self._recognize(frame, enrolling)
                interval = 1.0 / settings.active_fps
            else:
                # idle: cheap pass-through, no inference
                self._banner(frame, "idle - watching for motion", (150, 150, 150))
                interval = 1.0 / settings.idle_fps

            # Enroll lifecycle: finish the timed capture once the window elapses,
            # or give up if nobody stepped in front of the camera in time. Kept
            # here (not in _recognize) so it still fires if the face leaves.
            e = self._enroll
            if e.active:
                now = time.time()
                if e.capture_done(now):
                    e.active = False
                    self._finish_enroll()
                elif e.wait_expired(now):
                    e.active = False
                    self._enroll_timeout()

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
        _t = time.time()
        biggest = self.engine.detect_recognize_biggest(frame)
        self._infer_ms = (time.time() - _t) * 1000.0

        if biggest is None:
            if enrolling and not self._enroll.started:
                self._banner(frame, self._enroll.waiting_text(), (255, 180, 0))
            else:
                self._banner(frame, "no face", (0, 215, 255))
            return

        x1, y1, x2, y2 = biggest.bbox.astype(int)
        px = int(y2 - y1)
        emb = biggest.normed_embedding
        det = float(getattr(biggest, "det_score", 1.0) or 1.0)
        front = frontality(biggest.kps)
        color = (0, 215, 255)

        if enrolling:
            if self._enroll.feed(emb, px, settings.min_enroll_px, settings.enroll_seconds):
                audio.play("start")   # first good face -> capture clock started
            color = (255, 180, 0)
            text = self._enroll.progress_text(px)

        ev: tuple[str, str | None, float, dict] | None = None
        if enrolling:
            pass  # ev stays None — enrollment isn't an entry event
        else:
            name, score, second, second_score = self.gallery.best_match(emb)
            # margin = how far the best match beats the runner-up. With <2 enrolled
            # there's no rival to confuse with, so margin = the score itself (passes).
            margin = (score - second_score) if second is not None else score
            if name is not None and score >= settings.match_threshold:
                color = (0, 220, 0)
                now = time.time()
                weight = frame_weight(px, det, front)
                self._accum.add(name, score, margin, weight, now)
                reason = self._maybe_open(now, name, score, px, margin,
                                          second, second_score, weight)
                tag = {"open": "OPEN", "cooldown": "OPEN", "blocked": "HOLD",
                       "disarmed": "DISARM"}.get(reason["verdict"], reason["verdict"])
                a = reason.get("accum")
                acc = f" | acc {a['score']:.2f} m{a['margin']:.2f} W{a['weight']:.1f} c{a['consensus']:.2f}" if a else ""
                text = f"MATCH {name} {score:.2f} {px}px w{weight:.2f}{acc} [{tag}]"
                ev = ("known", name, score, reason)
            else:
                who = f"closest {name} {score:.2f}" if name else "no one enrolled"
                text = f"UNKNOWN ({who}) face {px}px"
                reason = {"verdict": "unknown", "score": round(float(score), 3),
                          "match_threshold": settings.match_threshold, "closest": name}
                ev = ("unknown", None, score if name is not None else 0.0, reason)
            self._last_reason = {**reason, "px": int(px),
                                 "infer_ms": round(self._infer_ms, 1),
                                 "ts": round(time.time(), 2)}

        overlay.draw_face(frame, biggest.bbox, biggest.kps, color)
        self._banner(frame, text, color)

        # Log the appearance AFTER annotating, so the snapshot shows the box +
        # banner. Debounced per identity so one arrival = one event.
        if ev is not None:
            self._emit_event(frame, ev[0], ev[1], ev[2], px, ev[3])

    def _emit_event(self, frame, kind: str, label: str | None,
                    score: float, px: int, reason: dict | None = None) -> None:
        key = label if kind == "known" else "__unknown__"
        now = time.time()
        if key == self._last_event_key and (now - self._last_event_ts) < settings.event_cooldown:
            return
        self._last_event_key = key
        self._last_event_ts = now

        img = frame
        h, w = img.shape[:2]
        if w > 800:  # keep snapshots small — this is a feed thumbnail
            img = cv2.resize(img, (800, int(h * 800.0 / w)))
        ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 80])
        if ok:
            self.events.add(self.cam_id, kind, label, score, px, buf.tobytes(), reason)

    def _maybe_open(self, now: float, name: str, score: float, px: int,
                    margin: float, second: str | None, second_score: float,
                    weight: float) -> dict:
        """Judge the accumulated evidence and fire the door if it holds. Returns
        the reason payload (this frame's numbers + the accumulator state + the
        verdict) so the log can later explain both opens and non-opens."""
        dec = self._accum.evaluate(now)
        armed = self.door.armed
        fired = False
        if dec and dec["passed"] and armed and (now - self._last_open) >= settings.door_cooldown:
            self._last_open = now
            self._accum.clear()  # consume the evidence so we don't re-fire on it
            fired = True
            threading.Thread(target=self._fire, args=(dec["name"],), daemon=True).start()

        if not armed:
            verdict = "disarmed"
        elif fired:
            verdict = "open"
        elif dec and dec["passed"]:
            verdict = "cooldown"   # evidence holds, but within cooldown of a recent open
        else:
            verdict = "blocked"

        r = {
            "verdict": verdict,
            "name": name,                            # this frame's top-1
            "score": round(float(score), 3),         # this frame's score
            "px": int(px),
            "frame_margin": round(float(margin), 3),
            "second": second, "second_score": round(float(second_score), 3),
            "weight": round(float(weight), 2),       # this frame's vote weight
            "match_threshold": settings.match_threshold,
            "armed": armed,
        }
        if dec:
            r["accum"] = {
                "leader": dec["name"], "n": dec["n"], "weight": dec["weight"],
                "consensus": dec["consensus"], "score": dec["score"],
                "margin": dec["margin"],
                "need": {"votes": settings.accum_min_votes, "weight": settings.accum_weight_min,
                         "consensus": settings.accum_consensus, "score": settings.door_min_score,
                         "margin": settings.door_margin, "window": settings.accum_window},
            }
            if dec["blockers"]:
                r["blocked_by"] = dec["blockers"]
        return r

    def _fire(self, name: str) -> None:
        ok, msg = self.door.open(*self.door_target)
        self._msg = f"OPENED DOOR -> {name}" if ok else f"DOOR ERROR: {msg}"
        self._msg_until = time.time() + 4.0
        print(f"[{self.cam_id}] {'opened for ' + name if ok else 'door ERROR ' + msg}")

    def debug_state(self) -> dict:
        """Real-time decision state for tuning — NOT debounced like the event log,
        so we can watch the accumulator build during a walk-up."""
        cap = (1000.0 / self._infer_ms) if self._infer_ms > 0 else settings.active_fps
        return {
            "cam": self.cam_id, "armed": self.door.armed,
            "infer_ms": round(self._infer_ms, 1),
            "active_fps_cap": round(min(settings.active_fps, cap), 1),
            "accum_now": self._accum.evaluate(time.time()),
            "last_frame": self._last_reason,
            "since_open_s": (round(time.time() - self._last_open, 1)
                             if self._last_open else None),
        }

    def _finish_enroll(self) -> None:
        e = self._enroll
        if e.count < 3:
            self._msg = f"enroll FAILED: only {e.count} samples — try again"
            audio.play("fail")
        else:
            n = self.gallery.enroll(e.name, e.samples)
            self._msg = f"SAVED {e.name} from {n} samples"
            audio.play("done")
            print(f"[{self.cam_id}] {self._msg}")
        self._msg_until = time.time() + 4.0

    def _enroll_timeout(self) -> None:
        self._msg = f"enroll timed out — no face seen for {self._enroll.name}"
        self._msg_until = time.time() + 4.0
        audio.play("fail")
        print(f"[{self.cam_id}] {self._msg}")

    def _banner(self, frame, text: str, color) -> None:
        if self._msg and time.time() < self._msg_until:
            text, color = self._msg, (0, 220, 0)
        overlay.draw_banner(frame, self.cam_id, text, color)

    def wait_jpeg(self, last: int, timeout: float = 5.0):
        deadline = time.time() + timeout
        with self.cond:
            while self.seq <= last or self.latest_jpeg is None:
                rem = deadline - time.time()
                if rem <= 0:
                    break
                self.cond.wait(timeout=rem)
            return self.latest_jpeg, self.seq
