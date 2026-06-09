"""The face model — detection + recognition. THE MODEL-SWAP SEAM.

One instance is shared by every CameraWorker (the onnxruntime sessions are
thread-safe to call), so adding cameras costs no extra model memory. To swap the
recognition model (e.g. buffalo_l ArcFace ResNet50 -> MobileFaceNet for speed),
this is the ONLY file that changes — the gallery, accumulator, and workers are
untouched (stored embeddings become stale, which is a re-enroll, not code).
"""

from __future__ import annotations

import os

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
        # DETECTION: keep buffalo_l's SCRFD (det_10g) — it finds the small 30-65px
        # faces at this fisheye, which is what makes the early/distance open work.
        print(f"[face] loading detection: {settings.det_pack} SCRFD on CPU…")
        self.app = FaceAnalysis(name=settings.det_pack, providers=["CPUExecutionProvider"],
                                allowed_modules=["detection"])
        self.app.prepare(ctx_id=0, det_size=(det, det))
        # RECOGNITION: load ONLY the recognition model from a (possibly different,
        # lighter) pack. buffalo_s = w600k_mbf (MobileFaceNet), ~10-20x faster than
        # buffalo_l's w600k_r50. Detection quality is unchanged; only embeddings get
        # fast. Embeddings are model-specific — re-enroll after changing rec_pack.
        # NB: FaceAnalysis can't load recognition alone (it asserts a detector), so
        # we load the ArcFace ONNX directly via model_zoo. The recognition file in a
        # buffalo_* pack is w600k_*.onnx (r50 for buffalo_l, mbf for buffalo_s).
        print(f"[face] loading recognition: {settings.rec_pack} on CPU…")
        import glob as _glob
        from insightface.model_zoo import get_model
        pack_dir = os.path.join(os.path.expanduser("~"), ".insightface", "models", settings.rec_pack)
        rec_files = _glob.glob(os.path.join(pack_dir, "w600k_*.onnx"))
        if not rec_files:
            # cold cache — let FaceAnalysis pull the pack (it loads the detector too,
            # which we discard), then re-glob for the recognition onnx.
            FaceAnalysis(name=settings.rec_pack, providers=["CPUExecutionProvider"])
            rec_files = _glob.glob(os.path.join(pack_dir, "w600k_*.onnx"))
        if not rec_files:
            raise RuntimeError(f"no recognition model (w600k_*.onnx) in {pack_dir}")
        self.rec_model = get_model(rec_files[0], providers=["CPUExecutionProvider"])
        self.rec_model.prepare(ctx_id=0)

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
        self.rec_model.get(frame, face)
        return face
