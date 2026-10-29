"""Link one camera's sightings into tracks (one person's continuous presence).

Frame by frame (≈1 s apart), each detected person joins the open track that
looks most like it (cosine distance of re-ID fingerprints) and could have
walked there since that track was last seen; otherwise it opens a new track.
Assignment is global per frame (Hungarian), so two people crossing can't
steal each other's track. A track closes after MAX_GAP_S unseen.

    .venv/Scripts/python tracing/tracks.py --start "2026-10-28 08:00" --end "2026-10-28 08:15" [--camera ID ...]
"""

import argparse
import datetime as dt
import os
from collections import defaultdict
from dataclasses import dataclass, field
from zoneinfo import ZoneInfo

import numpy as np
import psycopg
from scipy.optimize import linear_sum_assignment

from hik import load_env

TZ = ZoneInfo("Asia/Jerusalem")
# Unseen this long → the track is closed. Indexing samples keyframes, ~2 s
# apart on most recorders, so this survives one missed detection.
MAX_GAP_S = 5.0
MATCH_MAX_DIST = 0.30  # cosine distance; same person frame-to-frame is ~0.05–0.2
# Spatial gate: a person moves at most this many of their own heights per
# second (+ a fixed slack for detector jitter and partial occlusion).
MAX_HEIGHTS_PER_S = 1.5
SLACK_HEIGHTS = 0.5
INF = 1e6


@dataclass
class Track:
    ids: list[int] = field(default_factory=list)
    embs: list[np.ndarray] = field(default_factory=list)
    quality: list[float] = field(default_factory=list)
    times: list[dt.datetime] = field(default_factory=list)
    last_box: np.ndarray | None = None

    def ref(self) -> np.ndarray:
        """Reference look: mean of the last few sightings (people turn)."""
        m = np.mean(self.embs[-5:], axis=0)
        return m / np.linalg.norm(m)


def _unit(v) -> np.ndarray:
    v = np.asarray(v, np.float32)
    return v / np.linalg.norm(v)


def _center_h(b) -> tuple[np.ndarray, float]:
    x1, y1, x2, y2 = b
    return np.array([(x1 + x2) / 2, (y1 + y2) / 2]), max(1.0, y2 - y1)


def link(rows: list[tuple]) -> list[Track]:
    """rows: (id, seen_at, bbox, score, embedding) sorted by seen_at."""
    frames: dict[dt.datetime, list[tuple]] = defaultdict(list)
    for r in rows:
        frames[r[1]].append(r)
    open_tracks: list[Track] = []
    done: list[Track] = []
    for t in sorted(frames):
        dets = frames[t]
        still_open = []
        for tr in open_tracks:
            (still_open if (t - tr.times[-1]).total_seconds() <= MAX_GAP_S else done).append(tr)
        open_tracks = still_open

        cost = np.full((len(open_tracks), len(dets)), INF)
        for i, tr in enumerate(open_tracks):
            gap = (t - tr.times[-1]).total_seconds()
            c0, h0 = _center_h(tr.last_box)
            ref = tr.ref()
            for j, d in enumerate(dets):
                c1, h1 = _center_h(d[2])
                reach = (MAX_HEIGHTS_PER_S * gap + SLACK_HEIGHTS) * max(h0, h1)
                if np.linalg.norm(c1 - c0) > reach:
                    continue
                dist = 1.0 - float(ref @ d[4])
                if dist <= MATCH_MAX_DIST:
                    cost[i, j] = dist
        matched = set()
        if open_tracks and dets:
            for i, j in zip(*linear_sum_assignment(cost)):
                if cost[i, j] < INF:
                    _extend(open_tracks[i], dets[j])
                    matched.add(j)
        for j, d in enumerate(dets):
            if j not in matched:
                tr = Track()
                _extend(tr, d)
                open_tracks.append(tr)
    return done + open_tracks


def _extend(tr: Track, d: tuple) -> None:
    sid, seen, box, score, emb = d
    _, h = _center_h(box)
    tr.ids.append(sid)
    tr.embs.append(emb)
    tr.quality.append(h * score)
    tr.times.append(seen)
    tr.last_box = np.asarray(box, np.float32)


def build_tracks(db, camera_id: str, start: dt.datetime, end: dt.datetime, model: str) -> int:
    """(Re)build one camera's tracks for a window; returns how many."""
    s, e = start.replace(tzinfo=TZ), end.replace(tzinfo=TZ)
    db.execute(
        "DELETE FROM tracks WHERE camera_id = %s AND start_at >= %s AND start_at < %s AND model = %s",
        (camera_id, s, e, model),
    )
    raw = db.execute(
        """SELECT id, seen_at, bbox, score, embedding::real[] FROM sightings
            WHERE camera_id = %s AND seen_at >= %s AND seen_at < %s AND model = %s
            ORDER BY seen_at, id""",
        (camera_id, s, e, model),
    ).fetchall()
    tracks = link([(r[0], r[1], r[2], r[3], _unit(r[4])) for r in raw])
    with db.cursor() as cur:
        for tr in tracks:
            m = np.mean(tr.embs, axis=0)
            m /= np.linalg.norm(m)
            best = tr.ids[int(np.argmax(tr.quality))]
            cur.execute(
                """INSERT INTO tracks (camera_id, start_at, end_at, n, best_sighting_id, embedding, model)
                   VALUES (%s, %s, %s, %s, %s, %s::vector, %s) RETURNING id""",
                (camera_id, tr.times[0], tr.times[-1], len(tr.ids), best,
                 "[" + ",".join(f"{v:.6f}" for v in m) + "]", model),
            )
            tid = cur.fetchone()[0]
            cur.execute("UPDATE sightings SET track_id = %s WHERE id = ANY(%s)", (tid, tr.ids))
    return len(tracks)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", required=True)
    ap.add_argument("--end", required=True)
    ap.add_argument("--camera", action="append", default=[])
    ap.add_argument("--model", default="osnet_ain_x1_0_msmt17")
    args = ap.parse_args()
    start = dt.datetime.strptime(args.start, "%Y-%m-%d %H:%M")
    end = dt.datetime.strptime(args.end, "%Y-%m-%d %H:%M")
    load_env()
    with psycopg.connect(os.environ["DATABASE_URL"]) as db:
        cams = args.camera or [r[0] for r in db.execute(
            "SELECT DISTINCT camera_id FROM sightings WHERE seen_at >= %s AND seen_at < %s ORDER BY 1",
            (start.replace(tzinfo=TZ), end.replace(tzinfo=TZ))).fetchall()]
        for cam in cams:
            n = build_tracks(db, cam, start, end, args.model)
            stats = db.execute(
                """SELECT count(*) FILTER (WHERE n >= 3), round(avg(n)::numeric, 1), max(n)
                     FROM tracks WHERE camera_id = %s AND start_at >= %s AND start_at < %s""",
                (cam, start.replace(tzinfo=TZ), end.replace(tzinfo=TZ))).fetchone()
            db.commit()
            print(f"  {cam:14} tracks {n:4}  (≥3 sightings: {stats[0]}, avg {stats[1]}, longest {stats[2]})")


if __name__ == "__main__":
    main()
