"""Frame-quality scoring — how much a single frame's vote should count.

ArcFace aligns every face to a fixed size before embedding, so face PIXELS aren't
about scale — they're about sharpness/trust. A small/blurry/side face yields a
NOISIER embedding, so its vote should carry less weight (not be penalized). The
weight = ramp(px) x detection-confidence x frontality.
"""

from __future__ import annotations

from .settings import settings


def ramp(x: float, lo: float, hi: float) -> float:
    """0 below lo, 1 at/above hi, linear between — a confidence ramp with floor."""
    if x <= lo:
        return 0.0
    if x >= hi:
        return 1.0
    return (x - lo) / (hi - lo)


def frontality(kps) -> float:
    """0..1 yaw-frontality from the 5 face landmarks: how centered the nose sits
    between the eyes (turning the head shifts the nose toward one eye). Cheap and
    robust enough to down-weight strong profiles. Pitch (looking down at a ceiling
    cam) mostly shows up as a lower detection score, which we also weight on."""
    if kps is None or len(kps) < 3:
        return 0.5
    le, re, nose = kps[0], kps[1], kps[2]
    eye_mid_x = (le[0] + re[0]) / 2.0
    inter_eye = abs(re[0] - le[0]) + 1e-6
    offset = abs(nose[0] - eye_mid_x) / inter_eye   # 0 = dead frontal
    return float(max(0.0, min(1.0, 1.0 - offset / 0.6)))


def frame_weight(px: int, det: float, front: float) -> float:
    """How much this frame's vote counts (0..1): pixel sharpness x detection
    confidence x frontality. The px_floor keeps a mush face from ever deciding."""
    return ramp(px, settings.px_floor, settings.px_full) * float(max(0.0, min(1.0, det))) * front
