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

import av
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


def _file_length_s(container, stream) -> float | None:
    if stream.duration and stream.time_base:
        return float(stream.duration * stream.time_base)
    if container.duration:
        return container.duration / av.time_base
    return None


def frames_in_window(clip: Path, seg: Segment, start: dt.datetime, end: dt.datetime,
                     interval_s: float, warn,
                     keyframes_only: bool = True) -> Iterator[tuple[dt.datetime, np.ndarray]]:
    """Yield (time, frame) about every `interval_s` of video inside [start, end).

    keyframes_only (indexing): the decoder skips everything between
    keyframes — the recorders put one every ~1–2 s, about the rate we sample
    at anyway, and decoding all 25 fps to keep 1 was wasted work. Pass False
    to land on an exact moment (sightings indexed before this were on any
    frame). PTS is counted from the stream's start_time, as OpenCV's
    POS_MSEC was — checked frame-exact against it."""
    with av.open(str(clip)) as container:
        stream = container.streams.video[0]
        if keyframes_only:
            stream.codec_context.skip_frame = "NONKEY"
        stream.thread_type = "AUTO"
        length = _file_length_s(container, stream)
        if length:
            file_start = seg.end - dt.timedelta(seconds=length)
            pre = (seg.start - file_start).total_seconds()
            if not PRERECORD_RANGE_S[0] <= pre <= PRERECORD_RANGE_S[1]:
                warn(f"file is {length:.0f}s but listed {seg.start:%H:%M:%S}-{seg.end:%H:%M:%S}; "
                     f"times may be off")
        else:
            file_start = seg.start
            warn(f"no length for file listed {seg.start:%H:%M:%S}; anchoring on its listed start")
        tb = stream.time_base
        t0 = stream.start_time or 0
        offset = (start - file_start).total_seconds()
        if offset > SEEK_PAD_S:
            container.seek(t0 + int((offset - SEEK_PAD_S) / tb), stream=stream, backward=True)
        next_at = start
        last_pts = -1.0
        last_key = None
        wide_gop_warned = False
        for frame in container.decode(stream):
            if frame.pts is None:  # a frame with no timestamp: skip it alone
                continue
            pts = float((frame.pts - t0) * tb)
            if pts <= 0 < last_pts:  # timestamp reads as 0 mid-file: skip it alone
                continue
            if pts < last_pts - 1.0:  # time really went backwards: can't trust the rest
                warn(f"PTS went back {last_pts:.1f}s → {pts:.1f}s ({seg.start:%H:%M:%S}); rest of file skipped")
                return
            if pts < last_pts:  # small reorder jitter
                continue
            if (keyframes_only and last_key is not None and pts - last_key > 2 * interval_s
                    and not wide_gop_warned):
                warn(f"keyframes {pts - last_key:.1f}s apart ({seg.start:%H:%M:%S}); sampling is sparser than asked")
                wide_gop_warned = True
            last_key = last_pts = pts
            seen = file_start + dt.timedelta(seconds=pts)
            if seen >= end:
                return
            if seen < next_at:
                continue
            next_at = seen + dt.timedelta(seconds=interval_s)
            yield seen, frame.to_ndarray(format="bgr24")


def drop_window(db, camera_id: str, start: dt.datetime, end: dt.datetime, model: str) -> list[str]:
    """Idempotent re-runs: remove this camera's earlier sightings in the
    window. Returns their crop paths — unlink them only AFTER the commit, or
    a run killed mid-camera rolls the rows back onto deleted crops."""
    params = (camera_id, start.replace(tzinfo=TZ), end.replace(tzinfo=TZ), model)
    old = db.execute(
        """DELETE FROM sightings WHERE camera_id = %s AND seen_at >= %s AND seen_at < %s
           AND model = %s RETURNING crop_path""",
        params,
    ).fetchall()
    return [rel for (rel,) in old]


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
            stale = drop_window(db, cam["id"], start, end, model_name)

            video_s = frames = found = 0
            spent = {"download": 0.0, "decode": 0.0, "detect": 0.0}
            rows = []
            for seg in segs:
                video_s += max(0.0, (min(seg.end, end) - max(seg.start, start)).total_seconds())
                with tempfile.TemporaryDirectory() as tmp:
                    clip = Path(tmp) / "seg.mp4"
                    t = time.time()
                    try:
                        rec.download(seg, clip)
                    except Exception as e:  # one bad segment shouldn't sink the run
                        warn(f"download failed {seg.start:%H:%M:%S}: {e}")
                        continue
                    finally:
                        spent["download"] += time.time() - t
                    t = time.time()
                    for seen, frame in frames_in_window(clip, seg, start, end, 1 / args.fps, warn):
                        spent["decode"] += time.time() - t
                        t = time.time()
                        frames += 1
                        det = detector.predict(frame, classes=[0], conf=args.conf,
                                               imgsz=640, verbose=False, device=0)[0]
                        boxes = det.boxes.xyxy.cpu().numpy().astype(np.float32)
                        scores = det.boxes.conf.cpu().numpy()
                        keep = (boxes[:, 3] - boxes[:, 1]) >= args.min_height
                        boxes, scores = boxes[keep], scores[keep]
                        feats = reid(frame, boxes) if len(boxes) else []
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
                        spent["detect"] += time.time() - t
                        t = time.time()
                    spent["decode"] += time.time() - t  # the tail after the last yielded frame
            with db.cursor() as cur:
                cur.executemany(
                    """INSERT INTO sightings (camera_id, seen_at, bbox, score, crop_path, embedding, model)
                       VALUES (%s, %s, %s, %s, %s, %s::vector, %s)""",
                    rows,
                )
            db.commit()
            reused = {r[4] for r in rows}  # same frame time → same name, now the new crop
            for rel in set(stale) - reused:
                (DATA / rel).unlink(missing_ok=True)
            label = cam["name_he"] or cam["device_name"] or ""
            print(f"  {cam['id']:14} {label[:18]:18} segs {len(segs):3}  video {video_s / 60:6.1f} min"
                  f"  frames {frames:5}  people {found:5}  ({time.time() - t0:.0f}s: "
                  + ", ".join(f"{k} {v:.0f}s" for k, v in spent.items()) + ")", flush=True)
            totals["video_s"] += video_s
            totals["frames"] += frames
            totals["sightings"] += found

        el = time.time() - t_all
        print(f"TOTAL video {totals['video_s'] / 60:.1f} min, frames {totals['frames']}, "
              f"sightings {totals['sightings']}, in {el:.0f}s "
              f"({totals['video_s'] / max(el, 1):.0f}x realtime)")


if __name__ == "__main__":
    main()
