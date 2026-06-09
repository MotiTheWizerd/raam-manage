"""Command-line entry — argparse, CPU thread budgeting, server bootstrap.

    .venv/Scripts/python server.py                 # default 127.0.0.1:8089
    .venv/Scripts/python server.py --port 8089 --stream sub --conf 0.35

Endpoints (all localhost-only):
    GET /stream/<cam>     annotated MJPEG (multipart/x-mixed-replace) — for <img>
    GET /snapshot/<cam>   single annotated JPEG (latest frame)
    GET /detections/<cam> latest frame's detections as JSON
    GET /healthz          liveness + which workers are running
"""

from __future__ import annotations

import argparse
from http.server import ThreadingHTTPServer

import cv2

from detect import CAMERAS

from .server import Handler
from .settings import settings


def main() -> None:
    p = argparse.ArgumentParser(description="Localhost vision service (MJPEG detection feeds)")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8089)
    p.add_argument("--model", default=settings.model)
    p.add_argument("--stream", choices=["main", "sub"], default=settings.stream)
    p.add_argument("--conf", type=float, default=settings.conf)
    args = p.parse_args()
    settings.model, settings.stream, settings.conf = args.model, args.stream, args.conf

    # CPU thread budgeting: give torch the physical cores for inference and keep
    # OpenCV's own parallelism small so frame decode/encode doesn't fight it.
    import torch
    torch.set_num_threads(settings.torch_threads)
    cv2.setNumThreads(settings.cv2_threads)
    print(f"[vision] torch threads={settings.torch_threads} cv2 threads={settings.cv2_threads} "
          f"imgsz={settings.imgsz} max_infer_fps={settings.max_infer_fps}")

    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"[vision] serving on http://{args.host}:{args.port}")
    print(f"[vision] cameras: {', '.join(sorted(CAMERAS))}")
    print(f"[vision] try: http://{args.host}:{args.port}/stream/lobby")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[vision] shutting down")
