"""The questions people ask the cameras — plain functions over the tracing db.

These are the tools the camera chat agent calls; they return small JSON-able
dicts (ids, names, times — never images; the UI fetches crops by sighting id).

  list_places()                          cameras + groups, to resolve "the lobby"
  find_people(start, end, groups, ...)   who was there: tracks merged into people
  trace_person(track_ids, ...)           where that person went
  coverage(start, end, groups, ...)      which cameras are indexed for a window
"""

import datetime as dt
from zoneinfo import ZoneInfo

import numpy as np
from scipy.cluster.hierarchy import fcluster, linkage
from scipy.spatial.distance import squareform

TZ = ZoneInfo("Asia/Jerusalem")
MODEL = "osnet_ain_x1_0_msmt17"
# Track means (one per visit) of the same person sit ~0.10–0.25 apart even
# across cameras; different people mostly > 0.30. Verified on the gym window.
SAME_PERSON_DIST = 0.28
# Short tracks (a few frames, often backlit/low-res outdoor cams) have noisy
# fingerprints: on the lobby window, wrong merges of two people (0.195–0.275)
# overlapped right merges in distance — every wrong one involved a short
# track. Investigation-safe rule: a pair with a short track merges only when
# it's very close; splitting one person beats merging two.
SHORT_TRACK_N = 12
SHORT_TRACK_PENALTY = 0.13
# …but a track that breaks and resumes on the SAME camera seconds later
# (person bent down, someone walked past) is strong evidence of one person —
# IF they also look alike: at 15s/any look, two people passing the same door
# 12s apart got merged. So: short gap, similar look, then the distance shrinks.
RELINK_GAP_S = 8
RELINK_MAX_DIST = 0.25
RELINK_FACTOR = 0.6
TRACE_MAX_DIST = 0.30
SURE_DIST = 0.25  # trace matches up to this build the route; beyond → "possible"
EXPAND_DIST = 0.20  # matches this close are added to the query (sharper look)
VISIT_MERGE_S = 30  # tracks on one camera closer than this are one visit
STAY_MERGE_S = 90  # visits in one area closer than this are one stay
CANNOT_LINK = 2.0


def _unit(v) -> np.ndarray:
    v = np.asarray(v, np.float32)
    return v / np.linalg.norm(v)


def _iso(t: dt.datetime) -> str:
    return t.astimezone(TZ).strftime("%Y-%m-%d %H:%M:%S")


def _local(s: str | dt.datetime) -> dt.datetime:
    t = dt.datetime.fromisoformat(s) if isinstance(s, str) else s
    return t if t.tzinfo else t.replace(tzinfo=TZ)


def _camera_ids(db, groups: list[str] | None, cameras: list[str] | None) -> list[str]:
    if not groups and not cameras:  # whole building
        return [r[0] for r in db.execute("SELECT id FROM cameras WHERE records <> 'none' AND active")]
    rows = db.execute(
        """SELECT DISTINCT c.id FROM cameras c
             LEFT JOIN camera_group_members m ON m.camera_id = c.id
             LEFT JOIN camera_groups g ON g.id = m.group_id
            WHERE g.name = ANY(%s) OR c.id = ANY(%s)""",
        (groups or [], cameras or []),
    ).fetchall()
    return [r[0] for r in rows]


def list_places(db) -> dict:
    groups = db.execute(
        """SELECT g.name, array_agg(m.camera_id ORDER BY m.camera_id)
             FROM camera_groups g LEFT JOIN camera_group_members m ON m.group_id = g.id
            GROUP BY g.id ORDER BY g.position, g.name"""
    ).fetchall()
    cams = db.execute(
        """SELECT c.id, COALESCE(c.name_he, c.device_name, c.id), c.records
             FROM cameras c JOIN recorders r ON r.id = c.recorder_id
            WHERE c.records <> 'none' AND c.active AND r.accessible ORDER BY c.id"""
    ).fetchall()
    return {
        "groups": [{"name": g, "cameras": [c for c in ids if c]} for g, ids in groups],
        "cameras": [{"id": i, "name": n, "records": r} for i, n, r in cams],
    }


def coverage(db, start, end, groups=None, cameras=None) -> dict:
    """Per camera: indexed sightings in the window (0 → index it first)."""
    s, e = _local(start), _local(end)
    ids = _camera_ids(db, groups, cameras)
    rows = dict(db.execute(
        """SELECT camera_id, count(*) FROM sightings
            WHERE camera_id = ANY(%s) AND seen_at >= %s AND seen_at < %s AND model = %s
            GROUP BY 1""",
        (ids, s, e, MODEL),
    ).fetchall())
    return {"cameras": [{"id": i, "sightings": rows.get(i, 0)} for i in sorted(ids)],
            "unindexed": [i for i in sorted(ids) if not rows.get(i)]}


def _tracks(db, camera_ids: list[str], s: dt.datetime, e: dt.datetime, min_n: int) -> list[dict]:
    rows = db.execute(
        """SELECT t.id, t.camera_id, COALESCE(c.name_he, c.device_name, c.id), t.start_at, t.end_at,
                  t.n, t.best_sighting_id, t.embedding::real[]
             FROM tracks t JOIN cameras c ON c.id = t.camera_id
            WHERE t.camera_id = ANY(%s) AND t.end_at >= %s AND t.start_at < %s
              AND t.model = %s AND t.n >= %s
            ORDER BY t.start_at""",
        (camera_ids, s, e, MODEL, min_n),
    ).fetchall()
    return [{"id": r[0], "camera": r[1], "camera_name": r[2], "start": r[3], "end": r[4],
             "n": r[5], "best": r[6], "emb": _unit(r[7])} for r in rows]


def find_people(db, start, end, groups=None, cameras=None, min_sightings: int = 3) -> dict:
    """Who was seen on these cameras in [start, end): each track is one
    person's visit to one camera; visits that look alike merge into a person.
    Two tracks on the same camera at the same time are never merged."""
    s, e = _local(start), _local(end)
    tracks = _tracks(db, _camera_ids(db, groups, cameras), s, e, min_sightings)
    if not tracks:
        return {"people": [], "note": "no indexed people in that window (check coverage)"}
    if len(tracks) == 1:
        labels = np.array([1])
    else:
        emb = np.stack([t["emb"] for t in tracks])
        dist = np.clip(1.0 - emb @ emb.T, 0.0, 2.0)
        for i, a in enumerate(tracks):
            for j in range(i + 1, len(tracks)):
                b = tracks[j]
                gap = (max(a["start"], b["start"]) - min(a["end"], b["end"])).total_seconds()
                if a["camera"] == b["camera"] and gap <= 0:  # same camera, same time
                    dist[i, j] = dist[j, i] = CANNOT_LINK
                elif a["camera"] == b["camera"] and gap <= RELINK_GAP_S and dist[i, j] <= RELINK_MAX_DIST:
                    dist[i, j] = dist[j, i] = dist[i, j] * RELINK_FACTOR
                elif min(a["n"], b["n"]) < SHORT_TRACK_N:
                    dist[i, j] = dist[j, i] = dist[i, j] + SHORT_TRACK_PENALTY
        np.fill_diagonal(dist, 0.0)
        labels = fcluster(linkage(squareform(dist, checks=False), method="average"),
                          t=SAME_PERSON_DIST, criterion="distance")
    people = []
    for lab in np.unique(labels):
        members = [t for t, l in zip(tracks, labels) if l == lab]
        best = max(members, key=lambda t: t["n"])
        people.append({
            "track_ids": [t["id"] for t in members],
            "best_sighting_id": best["best"],
            "first_seen": _iso(min(t["start"] for t in members)),
            "last_seen": _iso(max(t["end"] for t in members)),
            "cameras": sorted({t["camera_name"] for t in members}),
            "sightings": sum(t["n"] for t in members),
        })
    people.sort(key=lambda p: p["first_seen"])
    for i, p in enumerate(people, 1):
        p["person"] = i
    return {"people": people}


def trace_person(db, track_ids: list[int], start=None, end=None, around_minutes: int = 60,
                 max_dist: float = TRACE_MAX_DIST) -> dict:
    """Where a person (given as one or more of their tracks) went, building-wide.
    Default window: their own first/last sighting ± around_minutes."""
    q = db.execute(
        "SELECT embedding::real[], n, start_at, end_at FROM tracks WHERE id = ANY(%s)", (track_ids,)
    ).fetchall()
    if not q:
        return {"visits": [], "note": "unknown track ids"}
    query = _unit(np.sum([_unit(r[0]) * np.sqrt(r[1]) for r in q], axis=0))
    s = _local(start) if start else min(r[2] for r in q) - dt.timedelta(minutes=around_minutes)
    e = _local(end) if end else max(r[3] for r in q) + dt.timedelta(minutes=around_minutes)
    cands = _tracks(db, _camera_ids(db, None, None), s, e, 1)
    if not cands:
        return {"visits": []}
    emb = np.stack([t["emb"] for t in cands])
    d = 1.0 - emb @ query
    # one round of query expansion: the confident matches sharpen the look
    strong = [i for i in np.argsort(d) if d[i] <= EXPAND_DIST][:20]
    if strong:  # every track weighs √(its sightings); the original query keeps its own weight
        query = _unit(query * np.sqrt(sum(r[1] for r in q))
                      + np.sum([emb[i] * np.sqrt(cands[i]["n"]) for i in strong], axis=0))
        d = 1.0 - emb @ query
    hits = [dict(cands[i], dist=float(d[i])) for i in range(len(cands)) if d[i] <= max_dist]
    # Split by confidence BEFORE folding: folded together, a doubtful track
    # beside a sure one stretched the sure visit's time span.
    sure = _fold_visits([t for t in hits if t["dist"] <= SURE_DIST])
    possible = _fold_visits([t for t in hits if t["dist"] > SURE_DIST])
    stays = _stays(db, sure)
    for v in sure + possible:
        v["from"], v["to"] = _iso(v.pop("_start")), _iso(v.pop("_end"))
    return {"window": [_iso(s), _iso(e)], "stays": stays, "possible": possible}


def _fold_visits(tracks: list[dict]) -> list[dict]:
    """Same-camera tracks a few seconds apart → one visit."""
    visits: list[dict] = []
    for t in sorted(tracks, key=lambda t: t["start"]):
        v = next((v for v in reversed(visits) if v["camera"] == t["camera"]), None)
        if v and (t["start"] - v["_end"]).total_seconds() <= VISIT_MERGE_S:
            v["_end"] = max(v["_end"], t["end"])
            v["track_ids"].append(t["id"])
            if t["dist"] < v["dist"]:
                v["dist"], v["best_sighting_id"] = t["dist"], t["best"]
            continue
        visits.append({"camera": t["camera"], "camera_name": t["camera_name"], "_start": t["start"],
                       "_end": t["end"], "track_ids": [t["id"]], "dist": t["dist"],
                       "best_sighting_id": t["best"]})
    for v in visits:
        v["dist"] = round(v["dist"], 3)
        v["confidence"] = "high" if v["dist"] <= 0.20 else "medium" if v["dist"] <= SURE_DIST else "low"
    return visits


def _stays(db, visits: list[dict]) -> list[dict]:
    """Fold consecutive visits within one area (camera group) into a stay —
    a room seen by 3 cameras is one place to a person asking 'where was he'."""
    area = dict(db.execute(
        """SELECT DISTINCT ON (m.camera_id) m.camera_id, g.name
             FROM camera_group_members m JOIN camera_groups g ON g.id = m.group_id
            ORDER BY m.camera_id, g.position, g.name"""
    ).fetchall())
    stays: list[dict] = []
    for v in sorted(visits, key=lambda v: v["_start"]):  # (still has _start/_end here)
        place = area.get(v["camera"], v["camera_name"])  # ungrouped camera = its own place
        st = stays[-1] if stays else None
        if st and st["place"] == place and (v["_start"] - st["_end"]).total_seconds() <= STAY_MERGE_S:
            st["_end"] = max(st["_end"], v["_end"])
            st["cameras"] = sorted(set(st["cameras"]) | {v["camera_name"]})
            st["visits"] += 1
            if v["dist"] < st["best_dist"]:
                st["best_dist"], st["best_sighting_id"] = v["dist"], v["best_sighting_id"]
            continue
        stays.append({"place": place, "_start": v["_start"], "_end": v["_end"],
                      "cameras": [v["camera_name"]], "visits": 1,
                      "best_dist": v["dist"], "best_sighting_id": v["best_sighting_id"]})
    for st in stays:
        st["from"], st["to"] = _iso(st.pop("_start")), _iso(st.pop("_end"))
        st["confidence"] = "high" if st["best_dist"] <= 0.20 else "medium"
    return stays
