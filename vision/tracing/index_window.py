"""Index the people in a window of recorded footage into `sightings`.

For each camera (by group name and/or camera id): find the recorder's
segments covering [start, end], download them, sample ~1 frame/s, detect
people (YOLO), crop each one, embed it (OSNet-AIN re-ID) and store crop +
vector. Re-running the same camera + window replaces its earlier sightings.

    .venv/Scripts/python tracing/index_window.py --group "לובי ראשי" --group "חדר כושר" \
        --start "2026-10-28 08:00" --end "2026-10-28 10:00"

Frame time = the file's real start + the frame's own timestamp (PTS) in the
file, where real start = the segment's listed END − the file's length. Every
piece was verified against the clock the recorders burn into the picture:
the listed START is not the file start on motion recordings (pre-record),
and counting frames ÷ fps was not reliable.
"""

import argparse
import datetime as dt
import os
import sys
import tempfile
import time
from collections.abc import Iterator
from pathlib import Path
from zoneinfo import ZoneInfo

import cv2
import numpy as np
import psycopg

from hik import ROOT, Recorder, Segment, load_env

TZ = ZoneInfo("Asia/Jerusalem")
VISION = Path(__file__).resolve().parents[1]
REID_WEIGHTS = VISION / "models" / "osnet_ain_x1_0_msmt17.pt"
DETECTOR = VISION / "yolo11n.pt"
DATA = ROOT / "data" / "tracing"
CROP_HEIGHT = 256
SEEK_PAD_S = 2.0  # seek a little before the window; PTS says where we really landed
# Expected gap between a file's real start and its listed start: the motion
# pre-record (≈6s seen on the .100 NVR, 0 on the DVR). Outside this → warn.
PRERECORD_RANGE_S = (-2.0, 30.0)


def parse_local(s: str) -> dt.datetime:
    return dt.datetime.strptime(s, "%Y-%m-%d %H:%M")


def cameras_for(db, groups: list[str], ids: list[str]) -> list[dict]:
    rows = db.execute(
        """SELECT DISTINCT c.id, c.channel, c.device_name, c.name_he,
                  r.host, r.http_port, r.cred_env
             FROM cameras c JOIN recorders r ON r.id = c.recorder_id
             LEFT JOIN camera_group_members m ON m.camera_id = c.id
             LEFT JOIN camera_groups g ON g.id = m.group_id
            WHERE r.accessible AND c.records <> 'none'
              AND (g.name = ANY(%s) OR c.id = ANY(%s))
            ORDER BY c.id""",
        (groups, ids),
    ).fetchall()
    cols = ["id", "channel", "device_name", "name_he", "host", "http_port", "cred_env"]
    return [dict(zip(cols, r)) for r in rows]


def frames_in_window(clip: Path, seg: Segment, start: dt.datetime, end: dt.datetime,
                     interval_s: float, warn) -> Iterator[tuple[dt.datetime, np.ndarray]]:
    """Yield (time, frame) about every `interval_s` of video inside [start, end)."""
    cap = cv2.VideoCapture(str(clip))
    try:
        fps = cap.get(cv2.CAP_PROP_FPS)
        n = cap.get(cv2.CAP_PROP_FRAME_COUNT)
        if fps > 0 and n > 0:
            file_start = seg.end - dt.timedelta(seconds=n / fps)
            pre = (seg.start - file_start).total_seconds()
            if not PRERECORD_RANGE_S[0] <= pre <= PRERECORD_RANGE_S[1]:
                warn(f"file is {n / fps:.0f}s but listed {seg.start:%H:%M:%S}-{seg.end:%H:%M:%S}; "
                     f"times may be off")
        else:
            file_start = seg.start
            warn(f"no length for file listed {seg.start:%H:%M:%S}; anchoring on its listed start")
        offset = (start - file_start).total_seconds()
        if offset > SEEK_PAD_S:
            cap.set(cv2.CAP_PROP_POS_MSEC, (offset - SEEK_PAD_S) * 1000)
        next_at = start
        last_pts = -1.0
        while cap.grab():
            pts = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000
            if pts <= 0 < last_pts:  # a frame with no timestamp (reads as 0): skip it alone
                continue
            if pts < last_pts - 1.0:  # time really went backwards: can't trust the rest
                warn(f"PTS went back {last_pts:.1f}s → {pts:.1f}s ({seg.start:%H:%M:%S}); rest of file skipped")
                return
            if pts < last_pts:  # small reorder jitter
                continue
            last_pts = pts
            seen = file_start + dt.timedelta(seconds=pts)
            if seen >= end:
                return
            if seen < next_at:
                continue
            ok, frame = cap.retrieve()
            if ok:
                next_at = seen + dt.timedelta(seconds=interval_s)
                yield seen, frame
    finally:
        cap.release()


def drop_window(db, camera_id: str, start: dt.datetime, end: dt.datetime, model: str) -> None:
    """Idempotent re-runs: remove this camera's earlier sightings (and their
    crop files) in the window."""
    params = (camera_id, start.replace(tzinfo=TZ), end.replace(tzinfo=TZ), model)
    old = db.execute(
        """DELETE FROM sightings WHERE camera_id = %s AND seen_at >= %s AND seen_at < %s
           AND model = %s RETURNING crop_path""",
        params,
    ).fetchall()
    for (rel,) in old:
        (DATA / rel).unlink(missing_ok=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--group", action="append", default=[])
    ap.add_argument("--camera", action="append", default=[])
    ap.add_argument("--start", required=True, help='local time, "YYYY-MM-DD HH:MM"')
    ap.add_argument("--end", required=True)
    ap.add_argument("--fps", type=float, default=1.0, help="frames sampled per second of video")
    ap.add_argument("--conf", type=float, default=0.5)
    ap.add_argument("--min-height", type=int, default=80, help="skip people smaller than this (px)")
    args = ap.parse_args()
    start, end = parse_local(args.start), parse_local(args.end)

    load_env()
    from boxmot.reid.core.runtime import ReID
    from ultralytics import YOLO

    detector = YOLO(str(DETECTOR))
    reid = ReID(weights=REID_WEIGHTS, device="cuda:0", half=True)
    model_name = REID_WEIGHTS.stem

    with psycopg.connect(os.environ["DATABASE_URL"]) as db:
        cams = cameras_for(db, args.group, args.camera)
        if not cams:
            sys.exit("no accessible cameras match those groups / ids")
        print(f"{len(cams)} cameras, {args.start} → {args.end}", flush=True)
        totals = {"video_s": 0.0, "frames": 0, "sightings": 0}
        t_all = time.time()

        for cam in cams:
            t0 = time.time()
            warn = lambda msg, cid=cam["id"]: print(f"  ⚠ {cid}: {msg}", flush=True)
            rec = Recorder(cam["host"], cam["http_port"], cam["cred_env"])
            segs, certain = rec.segments_covering(cam["channel"], start, end)
            if not certain:
                warn("a segment runs >48h past the window edges; its times can't be pinned, camera skipped")
                segs = []
            drop_window(db, cam["id"], start, end, model_name)

            video_s = frames = found = 0
            rows = []
            for seg in segs:
                video_s += max(0.0, (min(seg.end, end) - max(seg.start, start)).total_seconds())
                with tempfile.TemporaryDirectory() as tmp:
                    clip = Path(tmp) / "seg.mp4"
                    try:
                        rec.download(seg, clip)
                    except Exception as e:  # one bad segment shouldn't sink the run
                        warn(f"download failed {seg.start:%H:%M:%S}: {e}")
                        continue
                    for seen, frame in frames_in_window(clip, seg, start, end, 1 / args.fps, warn):
                        frames += 1
                        det = detector.predict(frame, classes=[0], conf=args.conf,
                                               imgsz=640, verbose=False, device=0)[0]
                        boxes = det.boxes.xyxy.cpu().numpy().astype(np.float32)
                        scores = det.boxes.conf.cpu().numpy()
                        keep = (boxes[:, 3] - boxes[:, 1]) >= args.min_height
                        boxes, scores = boxes[keep], scores[keep]
                        if not len(boxes):
                            continue
                        feats = reid(frame, boxes)
                        for n, (b, sc, f) in enumerate(zip(boxes, scores, feats)):
                            x1, y1, x2, y2 = (int(v) for v in b)
                            crop = frame[max(0, y1):y2, max(0, x1):x2]
                            if crop.size == 0:
                                continue
                            crop = cv2.resize(crop, (max(1, round(crop.shape[1] * CROP_HEIGHT / crop.shape[0])), CROP_HEIGHT))
                            rel = Path("crops") / cam["id"] / f"{seen:%Y%m%d}" / f"{seen:%H%M%S}_{seen.microsecond // 1000:03d}_{n}.jpg"
                            (DATA / rel).parent.mkdir(parents=True, exist_ok=True)
                            cv2.imwrite(str(DATA / rel), crop, [cv2.IMWRITE_JPEG_QUALITY, 85])
                            rows.append((cam["id"], seen.replace(tzinfo=TZ), [x1, y1, x2, y2],
                                         float(sc), rel.as_posix(),
                                         "[" + ",".join(f"{v:.6f}" for v in f) + "]", model_name))
                            found += 1
            with db.cursor() as cur:
                cur.executemany(
                    """INSERT INTO sightings (camera_id, seen_at, bbox, score, crop_path, embedding, model)
                       VALUES (%s, %s, %s, %s, %s, %s::vector, %s)""",
                    rows,
                )
            db.commit()
            label = cam["name_he"] or cam["device_name"] or ""
            print(f"  {cam['id']:14} {label[:18]:18} segs {len(segs):3}  video {video_s / 60:6.1f} min"
                  f"  frames {frames:5}  people {found:5}  ({time.time() - t0:.0f}s)", flush=True)
            totals["video_s"] += video_s
            totals["frames"] += frames
            totals["sightings"] += found

        el = time.time() - t_all
        print(f"TOTAL video {totals['video_s'] / 60:.1f} min, frames {totals['frames']}, "
              f"sightings {totals['sightings']}, in {el:.0f}s "
              f"({totals['video_s'] / max(el, 1):.0f}x realtime)")


if __name__ == "__main__":
    main()
