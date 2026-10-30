"""The single source of configuration for the detection service.

model/stream/conf/device are set once from the CLI; the rest are perf knobs.
Everything that used to be a module global lives on one `settings` object so
nothing reaches for `global`.
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
    device: str = "cpu"    # "cuda:0" when the box's GPU (RTX 5060) is usable

    # --- lazy-worker lifecycle ---
    idle_stop_seconds: float = 3.0   # stop a worker this long after its last viewer
                                     #   leaves. Short so looked-away cams free CPU
                                     #   fast — overlapping workers cause slowdowns.

    # --- frame encoding ---
    jpeg_quality: int = 90

    # --- decoding ---
    # Grabbers only grab() (decode) every frame and convert/encode one only when
    # it's wanted. Converting + JPEG-encoding all 20-25 fps of every open stream
    # starved YOLO in this process (measured 2026-10-30: 14 ms -> 120 ms per
    # frame on the GPU with 4 streams open).
    decode_threads: int = 2   # per stream; the cameras set the pace, not the decoder

    # --- inference tuning ---
    # The grabber thread always keeps the NEWEST frame, so these trade detail/CPU
    # without ever building lag.
    imgsz: int = 480          # YOLO inference size; 480 is a multiple of 32 and
                              #   ~1.5-1.8x faster on CPU than 640.
    max_infer_fps: float = 20.0   # default inference-rate cap (single-camera views);
                                  #   the app asks for less on wall tiles.
    # "Moving only" drawing (the app's views): a track is marked once its box
    # centre has travelled this fraction of its own width/height from where it
    # first appeared. Relative to the box, so a far-off parked car's few pixels
    # of jitter never count, while a walking person crosses it within a second.
    moved_fraction: float = 0.5
    torch_threads: int = 6    # measured sweet spot for yolo11n on CPU: ~36fps @imgsz=480
                              #   vs ~18fps @12 threads — past ~6, sync overhead beats
                              #   parallelism. Leaves cores for the grabber decode.
    cv2_threads: int = 2      # keep OpenCV from oversubscribing cores away from torch


settings = Settings()
