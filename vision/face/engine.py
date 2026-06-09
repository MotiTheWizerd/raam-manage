"""The face model — detection + recognition. THE MODEL-SWAP SEAM.

One instance is shared by every CameraWorker (the onnxruntime sessions are
thread-safe to call), so adding cameras costs no extra model memory. To swap the
recognition model (e.g. buffalo_l ArcFace ResNet50 -> MobileFaceNet for speed),
this is the ONLY file that changes — the gallery, accumulator, and workers are
untouched (stored embeddings become stale, which is a re-enroll, not code).
"""

from __future__ import annotations

from insightface.app import FaceAnalysis
from insightface.app.common import Face

from .settings import settings


class FaceEngine:
    def __init__(self, det: int):
        # Cap onnxruntime's thread pool BEFORE building any session — by default
        # it uses every core on every inference and starved the web app.
        import onnxruntime as ort
        _orig = ort.InferenceSession

        def _capped(*a, **k):
            if not k.get("sess_options"):
                so = ort.SessionOptions()
                so.intra_op_num_threads = settings.ort_threads
                so.inter_op_num_threads = 1
                k["sess_options"] = so
            return _orig(*a, **k)

        ort.InferenceSession = _capped
        print("[face] loading buffalo_l (SCRFD detect + ArcFace recognition) on CPU…")
        self.app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"],
                                allowed_modules=["detection", "recognition"])
        self.app.prepare(ctx_id=0, det_size=(det, det))

    def detect_recognize_biggest(self, frame) -> Face | None:
        """Detect every face (cheap, ~0.1s) but run the COSTLY ArcFace recognition
        on ONLY the biggest one — the person at the door. Recognition is ~0.4s PER
        FACE on this CPU, so embedding every reflection in the glass lobby (up to 6
        faces -> 1.5s) was the real lag; we only ever use the biggest, so recognize
        just that. Returns a Face with .bbox/.kps/.det_score/.normed_embedding."""
        bboxes, kpss = self.app.det_model.detect(frame, max_num=0, metric="default")
        if bboxes is None or len(bboxes) == 0:
            return None
        i = int((bboxes[:, 3] - bboxes[:, 1]).argmax())   # tallest bbox = closest
        face = Face(bbox=bboxes[i, 0:4], kps=kpss[i], det_score=float(bboxes[i, 4]))
        self.app.models["recognition"].get(frame, face)
        return face
