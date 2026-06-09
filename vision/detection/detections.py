"""Turn one YOLO result into structured detection dicts.

Pure function (no worker state): this is what the /detections endpoint serves —
the data the Next app reasons over. Decoupled from the worker so the data shape
can evolve (or be unit-tested) without touching the inference loop.
"""

from __future__ import annotations


def extract(result, names: dict) -> list[dict]:
    """Each object: class name + id, confidence, ByteTrack track-id (None when
    tracking hasn't locked on yet), and the pixel box [x1,y1,x2,y2]."""
    boxes = getattr(result, "boxes", None)
    if boxes is None or len(boxes) == 0:
        return []
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
