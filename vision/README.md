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

## Where this is going

The detector becomes a small localhost vision service that serves the annotated
frames as MJPEG, so the Next app can show the detection feed in-place behind a
toggle (default cam view ⇄ detection view), next to the fullscreen button.
