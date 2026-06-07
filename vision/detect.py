"""
Live object-detection viewer for the building cameras.

Throwaway experiment for the face-recognition arc (session 22). This is the
*detection* stage — it draws boxes + labels on people and objects in real time
so we can see what a camera sees. Recognition (who is this person) comes later
with a separate model; this proves the live pipeline first.

Reusable by design: point it at any camera in our registry by name, or at an
arbitrary RTSP URL. The registry mirrors src/lib/gates.ts so the names match
the app.

Usage:
    python detect.py --cam lobby                 # the .119 outdoor lobby cam
    python detect.py --cam upper --stream main   # any registry camera
    python detect.py --rtsp rtsp://...           # any RTSP URL
    python detect.py --cam lobby --no-track      # boxes only, no tracking IDs
    python detect.py --cam lobby --classes person   # only show people

Keys while the window is focused:
    q / Esc  quit
"""

from __future__ import annotations

import argparse
import time

import cv2
from ultralytics import YOLO

# --- Camera registry (mirrors src/lib/gates.ts) ----------------------------
# channel: Hikvision stream channel. Plain IP cams are channel 1; the "road"
# cam is channel 29 on the .137 DVR. RTSP path = /Streaming/Channels/<NNS>
# where NN = channel and S = stream (1 = main/HD, 2 = sub/lighter).
CAMERAS = {
    "street": {"name": "כניסה (חוץ)", "host": "10.0.0.60", "user": "admin", "pass": "topline123", "channel": 1},
    "upper": {"name": "שער עליון", "host": "10.0.0.107", "user": "admin", "pass": "Sami0207", "channel": 1},
    "ramp": {"name": "רמפה", "host": "10.0.0.61", "user": "admin", "pass": "topline123", "channel": 1},
    "road": {"name": "שביל כניסה", "host": "10.0.0.137", "user": "admin", "pass": "Sami0207", "channel": 29},
    "lower": {"name": "שער תחתון", "host": "10.0.0.112", "user": "admin", "pass": "Sami0207", "channel": 1},
    "lobby": {"name": "לובי", "host": "10.0.0.119", "user": "admin", "pass": "Sami0207", "channel": 1},
}


def rtsp_url(cam: dict, stream: str) -> str:
    """Build the Hikvision RTSP URL. stream = 'main' (HD) or 'sub' (lighter)."""
    s = 1 if stream == "main" else 2
    channel_stream = cam["channel"] * 100 + s
    return (
        f"rtsp://{cam['user']}:{cam['pass']}@{cam['host']}:554"
        f"/Streaming/Channels/{channel_stream}"
    )


def main() -> None:
    p = argparse.ArgumentParser(description="Live object detection on a building camera")
    src = p.add_mutually_exclusive_group(required=True)
    src.add_argument("--cam", choices=sorted(CAMERAS), help="camera name from the registry")
    src.add_argument("--rtsp", help="arbitrary RTSP/HTTP/file source")
    p.add_argument("--stream", choices=["main", "sub"], default="sub",
                   help="HD main stream or lighter sub stream (default: sub)")
    p.add_argument("--model", default="yolo11n.pt", help="YOLO weights (default: yolo11n.pt)")
    p.add_argument("--conf", type=float, default=0.35, help="confidence threshold (default: 0.35)")
    p.add_argument("--classes", nargs="*", default=None,
                   help="limit to class names, e.g. --classes person backpack")
    p.add_argument("--no-track", action="store_true", help="disable multi-object tracking IDs")
    args = p.parse_args()

    if args.cam:
        cam = CAMERAS[args.cam]
        source = rtsp_url(cam, args.stream)
        title = f"{args.cam} ({cam['host']}) — {args.stream}"
        printable = source.replace(cam["pass"], "***")
    else:
        source = args.rtsp
        title = "rtsp"
        printable = source

    print(f"[detect] loading model: {args.model}")
    model = YOLO(args.model)

    # Map optional class-name filter to class indices the model understands.
    class_ids = None
    if args.classes:
        name_to_id = {v: k for k, v in model.names.items()}
        class_ids = [name_to_id[c] for c in args.classes if c in name_to_id]
        missing = [c for c in args.classes if c not in name_to_id]
        if missing:
            print(f"[detect] WARNING unknown class names ignored: {missing}")
        print(f"[detect] filtering to classes: {args.classes} -> {class_ids}")

    print(f"[detect] opening: {printable}")
    # Prefer TCP for RTSP — UDP drops frames badly over building wifi/switches.
    cap = cv2.VideoCapture(source, cv2.CAP_FFMPEG)
    if not cap.isOpened():
        # Retry path nudging ffmpeg to TCP transport.
        import os
        os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"
        cap = cv2.VideoCapture(source, cv2.CAP_FFMPEG)
    if not cap.isOpened():
        raise SystemExit(f"[detect] could not open source: {printable}")

    win = f"detect — {title}  (q to quit)"
    cv2.namedWindow(win, cv2.WINDOW_NORMAL)

    fps = 0.0
    last = time.time()
    misses = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            misses += 1
            if misses > 50:
                print("[detect] stream dropped — reconnecting…")
                cap.release()
                cap = cv2.VideoCapture(source, cv2.CAP_FFMPEG)
                misses = 0
            continue
        misses = 0

        if args.no_track:
            results = model.predict(frame, conf=args.conf, classes=class_ids, verbose=False)
        else:
            results = model.track(frame, conf=args.conf, classes=class_ids,
                                  persist=True, tracker="bytetrack.yaml", verbose=False)

        annotated = results[0].plot()

        # Smooth FPS estimate + a small live count of detections.
        now = time.time()
        dt = now - last
        last = now
        if dt > 0:
            fps = 0.9 * fps + 0.1 * (1.0 / dt)
        n = len(results[0].boxes)
        cv2.putText(annotated, f"{fps:4.1f} FPS   {n} objs", (12, 28),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2, cv2.LINE_AA)

        cv2.imshow(win, annotated)
        key = cv2.waitKey(1) & 0xFF
        if key in (ord("q"), 27):  # q or Esc
            break

    cap.release()
    cv2.destroyAllWindows()
    print("[detect] done.")


if __name__ == "__main__":
    main()
