"""Trace one person: from a sighting, find where else they appear.

Nearest appearance fingerprints (pgvector cosine) within a time window around
the query, folded into VISITS (consecutive hits on one camera), printed as a
timeline and drawn as a contact sheet (data/tracing/results/).

    .venv/Scripts/python tracing/trace.py --id 1234
    .venv/Scripts/python tracing/trace.py --crop nvr-100-ch11/20261028/080129
"""

import argparse
import os
import sys
from pathlib import Path

import cv2
import numpy as np
import psycopg

from hik import ROOT, load_env

DATA = ROOT / "data" / "tracing"
VISIT_GAP_S = 20  # hits on one camera closer than this are one visit


def main() -> None:
    ap = argparse.ArgumentParser()
    q = ap.add_mutually_exclusive_group(required=True)
    q.add_argument("--id", type=int, help="sighting id")
    q.add_argument("--crop", help="substring of a crop path (first match)")
    ap.add_argument("--minutes", type=int, default=30, help="search ± this around the query")
    ap.add_argument("--max-dist", type=float, default=0.35, help="cosine distance cut-off")
    ap.add_argument("--limit", type=int, default=3000, help="nearest sightings considered")
    args = ap.parse_args()

    load_env()
    with psycopg.connect(os.environ["DATABASE_URL"]) as db:
        db.execute("SET TIME ZONE 'Asia/Jerusalem'")
        where, val = ("id = %s", args.id) if args.id else ("crop_path LIKE %s", f"%{args.crop}%")
        query = db.execute(
            f"SELECT id, camera_id, seen_at, crop_path, model FROM sightings WHERE {where} ORDER BY id LIMIT 1",
            (val,),
        ).fetchone()
        if not query:
            sys.exit("no such sighting")
        qid, qcam, qtime, qcrop, qmodel = query

        # Time filter FIRST, then an exact distance sort over that window: the
        # approximate HNSW index with a post-filter can silently drop matches.
        hits = db.execute(
            """WITH q AS (SELECT seen_at, embedding, model FROM sightings WHERE id = %s),
                    win AS MATERIALIZED (
                      SELECT s.* FROM sightings s, q
                       WHERE s.model = q.model
                         AND s.seen_at BETWEEN q.seen_at - make_interval(mins => %s)
                                           AND q.seen_at + make_interval(mins => %s))
               SELECT win.id, win.camera_id, win.seen_at, win.crop_path,
                      win.embedding <=> q.embedding AS dist,
                      COALESCE(c.name_he, c.device_name, win.camera_id) AS cam_name
                 FROM win, q, cameras c
                WHERE c.id = win.camera_id
                ORDER BY dist
                LIMIT %s""",
            (qid, args.minutes, args.minutes, args.limit),
        ).fetchall()

    hits = [h for h in hits if h[4] <= args.max_dist]
    # fold into visits: per camera, time-sorted, split on gaps
    visits = []
    for cam in sorted({h[1] for h in hits}):
        cam_hits = sorted((h for h in hits if h[1] == cam), key=lambda h: h[2])
        cur = [cam_hits[0]]
        for h in cam_hits[1:]:
            if (h[2] - cur[-1][2]).total_seconds() > VISIT_GAP_S:
                visits.append(cur)
                cur = []
            cur.append(h)
        visits.append(cur)
    visits.sort(key=lambda v: v[0][2])

    print(f"query #{qid}  {qcam}  {qtime:%H:%M:%S}  ({qcrop})")
    print(f"{len(hits)} matching sightings ≤ {args.max_dist} → {len(visits)} visits\n")
    for v in visits:
        best = min(v, key=lambda h: h[4])
        print(f"  {v[0][2]:%H:%M:%S}–{v[-1][2]:%H:%M:%S}  {best[1]:14} {best[5][:20]:20} "
              f"hits {len(v):4}  best {best[4]:.3f}  #{best[0]}")

    # contact sheet: query, then each visit's best crop
    tiles = [_tile(qcrop, f"QUERY {qtime:%H:%M:%S}", f"{qcam}", (0, 0, 255))]
    for v in visits[:39]:
        best = min(v, key=lambda h: h[4])
        tiles.append(_tile(best[3], f"{v[0][2]:%H:%M:%S} d{best[4]:.2f}", best[1], (0, 255, 255)))
    while len(tiles) % 8:
        tiles.append(np.zeros_like(tiles[0]))
    sheet = np.vstack([np.hstack(tiles[i:i + 8]) for i in range(0, len(tiles), 8)])
    out = DATA / "results" / f"trace_{qid}.jpg"
    out.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(out), sheet)
    print(f"\nsheet: {out}")


def _tile(crop_path: str, line1: str, line2: str, color) -> np.ndarray:
    W, H = 130, 200
    tile = np.zeros((H, W, 3), np.uint8)
    im = cv2.imread(str(DATA / crop_path))
    if im is not None:
        s = min(W / im.shape[1], (H - 30) / im.shape[0])
        im = cv2.resize(im, (max(1, int(im.shape[1] * s)), max(1, int(im.shape[0] * s))))
        x = (W - im.shape[1]) // 2
        tile[:im.shape[0], x:x + im.shape[1]] = im
    cv2.putText(tile, line1, (2, H - 17), cv2.FONT_HERSHEY_SIMPLEX, 0.37, color, 1)
    cv2.putText(tile, line2, (2, H - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.37, color, 1)
    return tile


if __name__ == "__main__":
    main()
