"""Vision detection service package.

Serves live YOLO object-detection feeds over localhost HTTP so the Next app can
embed them behind a "detection mode" toggle. Design for a CPU-only box: detection
workers are LAZY — a camera only runs YOLO while someone is viewing its stream,
and the worker auto-stops a few seconds after the last viewer disconnects.

Refactor of the original single-file server.py into single-responsibility modules
(mirrors the vision/face/ package):

    settings    — the one Settings object (model/stream/conf + perf knobs)
    detections  — pure YOLO-result -> structured detection dicts
    worker      — per-camera grabber + inference threads (newest-frame, no lag)
    service     — worker registry (composition root)
    server      — HTTP handler + routing
    cli         — argparse + thread budgeting + main()

Entry point stays at vision/server.py so pm2 / the run command are unchanged.
"""

from __future__ import annotations

import os

# Quiet ffmpeg's per-frame H.264 decode chatter ("error while decoding MB ...")
# — harmless recoverable glitches on imperfect RTSP frames that otherwise flood
# the pm2 error log. MUST be set before cv2 loads its ffmpeg backend, so it lives
# here at the package root (importing anything from `detection` runs this first).
os.environ.setdefault("OPENCV_FFMPEG_LOGLEVEL", "-8")  # AV_LOG_QUIET
