"""Command-line entry — argparse + server bootstrap.

    .venv/Scripts/python face_probe.py                 # serves all cams lazily
    .venv/Scripts/python face_probe.py --no-door       # recognize but never open

Endpoints (LAN-bound on :8090 so testing can be watched on a laptop):
    live (default cam):  http://10.0.0.127:8090/
    a specific cam:      http://10.0.0.127:8090/lobby   (or /street, /lower, …)
    enroll:              http://10.0.0.127:8090/enroll?name=moti
    who's saved:         http://10.0.0.127:8090/list
    live-tune:           http://10.0.0.127:8090/threshold?v=0.30&pxfull=60
    decision state:      http://10.0.0.127:8090/debug
    recog speed:         http://10.0.0.127:8090/selftest
    door arm/disarm:     http://10.0.0.127:8090/door?arm=0   (…?arm=1 to re-arm)
    manual door fire:    http://10.0.0.127:8090/door
"""

from __future__ import annotations

import argparse
from http.server import ThreadingHTTPServer

import cv2

from detect import CAMERAS

from .server import Handler
from .service import service
from .settings import DEFAULT_CAM, settings


def main() -> None:
    p = argparse.ArgumentParser(description="Face recognition sentry")
    p.add_argument("--host", default="0.0.0.0")
    p.add_argument("--port", type=int, default=8090)
    p.add_argument("--det", type=int, default=640)
    p.add_argument("--cam", default=DEFAULT_CAM, choices=sorted(CAMERAS),
                   help="camera to pre-warm at startup (others start on first view)")
    p.add_argument("--no-door", action="store_true",
                   help="recognize but never open the door")
    args = p.parse_args()

    cv2.setNumThreads(2)
    service.init(args.det, armed=not args.no_door)
    print(f"[face] ready. log>={settings.match_threshold} | door: score>={settings.door_min_score} "
          f"margin>={settings.door_margin} weight>={settings.accum_weight_min} "
          f"consensus>={settings.accum_consensus} votes>={settings.accum_min_votes} "
          f"window={settings.accum_window}s px {settings.px_floor}-{settings.px_full} "
          f"| armed={service.door.armed} ort_threads={settings.ort_threads}")

    service.get_worker(args.cam)  # pre-warm the main camera

    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"[face] serving on http://{args.host}:{args.port}/  (default cam={args.cam})")
    print(f"[face] laptop: http://10.0.0.127:{args.port}/   enroll: …/enroll?name=moti")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[face] shutting down")
