"""Fill the camera registry (schema.sql) straight from the recorders.

For every recorder we can log in to: list its channels (analog inputs + IP
proxies), ask what it recorded in the last 24h, and link each channel to the
app's existing camera id (gates.ts / fleet-cameras.ts) by IP or DVR channel.
Re-runnable: device facts are refreshed, the human columns (name_he,
location, notes, active) are never touched.

    .venv/Scripts/python tracing/seed_cameras.py
"""

import datetime as dt
import os
import re
from pathlib import Path

import psycopg

from hik import ROOT, Recorder, load_env

# Every recorder iVMS knows about. Ones we can't reach yet still get a row so
# the gap is visible (accessible = false).
RECORDERS = [
    {"id": "dvr-137", "name": "DVR", "host": "10.0.0.137", "http_port": 80},
    {"id": "nvr-100", "name": "NVR מכשר", "host": "10.0.0.100", "http_port": 81},
    {"id": "nvr-90", "name": "מצלמות חדשות", "host": "10.0.0.90", "http_port": 91,
     "cred_env": "HIK_NVR90", "notes": "admin password unknown; waiting for a 'raam' user from the installer"},
    {"id": "nvr-elev", "name": "מצלמות מעלית", "host": "212.199.11.111", "http_port": 80,
     "cred_env": "HIK_ELEVATOR", "notes": "remote site over the internet; port + login not set up yet"},
]


def recorded_24h(rec: Recorder, channel: int) -> tuple[float, int, float]:
    """(hours, segments, GB) of footage on this channel in the last 24h."""
    end = dt.datetime.now()
    segs = rec.search(channel, end - dt.timedelta(hours=24), end)
    hours = sum(max(0.0, (s.end - s.start).total_seconds()) for s in segs) / 3600
    return hours, len(segs), sum(s.size for s in segs) / 1e9


def app_camera_ids() -> tuple[dict[str, str], dict[tuple[str, int], str]]:
    """The app's camera ids, keyed by IP (whole camera) and by (host, channel)
    for cameras the app reaches through a recorder channel path."""
    by_ip: dict[str, str] = {}
    by_channel: dict[tuple[str, int], str] = {}
    # fleet first, then gates.ts: the curated ids win
    for f in ["src/lib/fleet-cameras.ts", "src/lib/gates.ts"]:
        text = (ROOT / f).read_text(encoding="utf-8")
        for block in re.findall(r"\{[^{}]*\}", text):
            cid = re.search(r'\bid: "([^"]+)"', block)
            host = re.search(r'\bhost: "([^"]+)"', block)
            if not (cid and host):
                continue
            path = re.search(r"channels/(\d+)\d{2}/", block)
            if path:
                by_channel[(host.group(1), int(path.group(1)))] = cid.group(1)
            else:
                by_ip[host.group(1)] = cid.group(1)
    return by_ip, by_channel


def records_mode(hours: float, segs: int) -> str:
    if segs == 0:
        return "none"
    # a few long segments covering the day = continuous; many short = on motion
    return "continuous" if hours >= 20 and segs <= 60 else "motion"


def main() -> None:
    load_env()
    by_ip, by_channel = app_camera_ids()
    with psycopg.connect(os.environ["DATABASE_URL"]) as db:
        db.execute((Path(__file__).with_name("schema.sql")).read_text(encoding="utf-8"))
        for cfg in RECORDERS:
            rec = Recorder(cfg["host"], cfg["http_port"], cfg.get("cred_env", "HIK_DEFAULT"))
            model = rec.model()
            db.execute(
                """INSERT INTO recorders (id, name, host, http_port, model, cred_env, accessible, notes)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, host = EXCLUDED.host,
                     http_port = EXCLUDED.http_port, model = COALESCE(EXCLUDED.model, recorders.model),
                     cred_env = EXCLUDED.cred_env, accessible = EXCLUDED.accessible,
                     notes = COALESCE(recorders.notes, EXCLUDED.notes), updated_at = now()""",
                (cfg["id"], cfg["name"], cfg["host"], cfg["http_port"], model,
                 cfg.get("cred_env", "HIK_DEFAULT"), model is not None, cfg.get("notes")),
            )
            if model is None:
                print(f"{cfg['id']}: not accessible, skipped")
                continue
            chans = rec.channels()
            for ch in chans:
                hours, segs, gb = recorded_24h(rec, ch["channel"])
                live_id = (by_ip.get(ch["camera_ip"]) if ch["camera_ip"]
                           else by_channel.get((cfg["host"], ch["channel"])))
                db.execute(
                    """INSERT INTO cameras (id, recorder_id, channel, kind, device_name, camera_ip,
                                            live_id, records, hours_24h, gb_24h)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                       ON CONFLICT (id) DO UPDATE SET kind = EXCLUDED.kind,
                         device_name = EXCLUDED.device_name, camera_ip = EXCLUDED.camera_ip,
                         live_id = EXCLUDED.live_id, records = EXCLUDED.records,
                         hours_24h = EXCLUDED.hours_24h, gb_24h = EXCLUDED.gb_24h, updated_at = now()""",
                    (f"{cfg['id']}-ch{ch['channel']}", cfg["id"], ch["channel"], ch["kind"],
                     ch["device_name"], ch["camera_ip"], live_id, records_mode(hours, segs),
                     round(hours, 1), round(gb, 2)),
                )
            db.commit()
            print(f"{cfg['id']} ({model}): {len(chans)} channels")


if __name__ == "__main__":
    main()
