"""The single source of configuration for the detection service.

model/stream/conf are set once from the CLI; the rest are perf knobs tuned for
this CPU-only box. Everything that used to be a module global lives on one
`settings` object so nothing reaches for `global`.
"""

from __future__ import annotations

from dataclasses import dataclass

BOUNDARY = "frame"   # multipart MJPEG boundary token (static)


@dataclass
class Settings:
    # --- set from CLI in cli.main() ---
    model: str = "yolo11n.pt"
    stream: str = "main"   # HD 1080p; localhost = free bandwidth, decode in grabber
    conf: float = 0.35

    # --- lazy-worker lifecycle ---
    idle_stop_seconds: float = 3.0   # stop a worker this long after its last viewer
                                     #   leaves. Short so looked-away cams free CPU
                                     #   fast — overlapping workers cause slowdowns.

    # --- frame encoding ---
    jpeg_quality: int = 90

    # --- inference tuning (CPU-only box) ---
    # The grabber thread always keeps the NEWEST frame, so these trade detail/CPU
    # without ever building lag.
    imgsz: int = 480          # YOLO inference size; 480 is a multiple of 32 and
                              #   ~1.5-1.8x faster on CPU than 640.
    max_infer_fps: float = 20.0   # cap inference rate; 20 = near-full-motion for the
                                  #   interactive views at ~1 core per watched camera.
    torch_threads: int = 6    # measured sweet spot for yolo11n here: ~36fps @imgsz=480
                              #   vs ~18fps @12 threads — past ~6, sync overhead beats
                              #   parallelism. Leaves cores for the grabber decode.
    cv2_threads: int = 2      # keep OpenCV from oversubscribing cores away from torch


settings = Settings()
