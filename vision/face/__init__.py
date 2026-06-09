"""Face recognition sentry package.

A resident looks at a camera; if we recognize them, the matching door unlocks.
Built to scale to MANY cameras: one shared FaceEngine (the model) + one shared
FaceGallery (enrolled templates) are reused by N lightweight CameraWorkers, one
per camera. Each worker is MOTION-GATED — it does almost nothing while its view
is still, and only runs the expensive recognition when something actually moves.

This package is the refactor of the original single-file face_probe.py into
single-responsibility modules:

    settings     — the one mutable Settings object (live-tunable knobs)
    audio        — winsound capture/saved/fail cues on the lobby PC
    door         — GeoVision door client (login + momentary unlock)
    quality      — frame-quality scoring (ramp / frontality / weight)
    gallery      — enrolled-template DB + matching
    engine       — the face model (detect + recognize) — the model-swap seam
    accumulator  — quality-weighted evidence accumulation + door verdict
    enroll       — the enrollment state machine
    overlay      — annotated-frame drawing
    events       — in-memory entry-event ring + snapshots
    worker       — per-camera grabber + motion-gated recognition loop
    service      — composition root (builds engine/gallery/door + worker registry)
    server       — HTTP handler + routing
    cli          — argparse + main()

Entry point stays at vision/face_probe.py so pm2 / the run command are unchanged.
"""

from __future__ import annotations

import os

# These MUST be set before OpenCV (cv2) is imported by any submodule, so they
# live here at the package root — importing anything from `face` runs this first.
os.environ.setdefault("OPENCV_FFMPEG_LOGLEVEL", "-8")
# Cap the RTSP decoder's threads so software-decoding the 30fps 1080p stream
# doesn't fan out across every core and starve the recognizer on this CPU box.
os.environ.setdefault("OPENCV_FFMPEG_CAPTURE_OPTIONS", "rtsp_transport;tcp|threads;2")
