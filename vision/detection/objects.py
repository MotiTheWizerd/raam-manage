"""One-shot object check on a single JPEG — the motion-follow filter.

The app's motion listener (src/lib/motion.ts) hears a camera's own "motion"
event, grabs one snapshot, and asks here: what's in it — people, vehicles,
animals? That keeps the AI off the 70 idle streams — it only runs on cameras
that are moving, at most ~1 image/s each. One shared YOLO instance (plain
predict, no tracking), so calls are serialized under a lock.
"""

from __future__ import annotations

import threading

import cv2
import numpy as np
from ultralytics import YOLO

from .settings import settings

# COCO class ids grouped into the kinds the cameras page filters on.
KINDS: dict[str, tuple[int, ...]] = {
    "person": (0,),
    "vehicle": (1, 2, 3, 5, 7),            # bicycle, car, motorcycle, bus, truck
    "animal": tuple(range(14, 24)),        # bird, cat, dog, horse … giraffe
}
_CLASS_KIND = {c: kind for kind, ids in KINDS.items() for c in ids}
MIN_CONF = 0.45     # stricter than the live view's 0.35 — a false hit cuts the wall

_lock = threading.Lock()
_model: YOLO | None = None


def _predict(frame: np.ndarray):
    global _model
    with _lock:
        if _model is None:
            _model = YOLO(settings.model)
        return _model.predict(
            frame,
            imgsz=settings.imgsz,
            conf=MIN_CONF,
            classes=list(_CLASS_KIND),
            device=settings.device,
            verbose=False,
        )[0]


def warm_up() -> None:
    """Load the model and run it once at startup: the first GPU inference takes
    seconds, and motion.ts gives a check only 5 s."""
    _predict(np.zeros((480, 640, 3), np.uint8))


def check_objects(jpeg: bytes) -> dict:
    frame = cv2.imdecode(np.frombuffer(jpeg, np.uint8), cv2.IMREAD_COLOR)
    if frame is None:
        return {"ok": False, "error": "bad image"}
    result = _predict(frame)
    counts = {kind: 0 for kind in KINDS}
    # Vehicle boxes as [x1, y1, x2, y2] fractions of the frame, so the caller
    # can tell a parked car (same box as last check) from a moving one.
    vehicles: list[list[float]] = []
    if result.boxes is not None:
        for c, box in zip(result.boxes.cls, result.boxes.xyxyn):
            kind = _CLASS_KIND[int(c)]
            counts[kind] += 1
            if kind == "vehicle":
                vehicles.append([round(float(v), 4) for v in box])
    return {"ok": True, "counts": counts, "vehicles": vehicles}
