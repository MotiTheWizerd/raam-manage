# Vision lab — live object detection on the building cameras

Part of the face-recognition arc. This is the **detection** stage: it draws
boxes + tracking IDs on people and objects in real time. Recognition ("who is
this person") is a later, separate model — detection is the foundation we build
on first.

The detector is **Ultralytics YOLO11** (person + 80 COCO object classes, with
built-in ByteTrack multi-object tracking). Runs on CPU; ~20 FPS on the lobby
cam's sub-stream on the no-GPU lobby PC.

## Setup (one time)

```bash
py -3.11 -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
```

The model weights (`yolo11n.pt`, ~5 MB) and the `.venv/` are gitignored — only
the source is tracked.

## Run the live viewer

```bash
# Any camera from our registry (mirrors src/lib/gates.ts):
.venv/Scripts/python detect.py --cam lobby
.venv/Scripts/python detect.py --cam upper --stream main

# Only show people:
.venv/Scripts/python detect.py --cam lobby --classes person

# An arbitrary RTSP/file source:
.venv/Scripts/python detect.py --rtsp rtsp://...
```

Press `q` or `Esc` in the window to quit.

## Vision service (feeds the app)

`server.py` serves the annotated frames over localhost HTTP so the Next app can
embed them. Workers are **lazy**: a camera only runs YOLO while someone is
viewing its stream, and auto-stops ~8s after the last viewer leaves — so we
never burn CPU on cameras nobody is watching.

```bash
.venv/Scripts/python server.py            # 127.0.0.1:8089
```

Endpoints (`<cam>` = any registry name):

```
GET /stream/<cam>     annotated MJPEG (multipart/x-mixed-replace) — for <img>
GET /snapshot/<cam>   single annotated JPEG (latest frame)
GET /healthz          liveness + which workers are running
```

In the app, the camera popup ([GateLiveView](../src/components/GateLiveView.tsx))
has a scan-eye toggle next to the fullscreen button that flips between the raw
camera (snapshot polling) and the detection stream from this service. If the
service isn't running, the toggle shows a graceful "service not running" notice.
Override the base URL per-machine with `NEXT_PUBLIC_VISION_URL`.

This service must be running for detection mode to work — eventually it should
run under pm2 next to the app (not yet wired).
