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
import uuid
import xml.etree.ElementTree as ET
from pathlib import Path

import psycopg
import requests
from requests.auth import HTTPDigestAuth

ROOT = Path(__file__).resolve().parents[2]

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


def load_env() -> None:
    for line in (ROOT / ".env.local").read_text(encoding="utf-8-sig").splitlines():
        m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.strip())
        if m:
            os.environ.setdefault(m.group(1), m.group(2))


def strip_ns(root: ET.Element) -> ET.Element:
    for el in root.iter():
        el.tag = el.tag.split("}", 1)[-1]
    return root


class Recorder:
    def __init__(self, cfg: dict):
        self.cfg = cfg
        env = cfg.get("cred_env", "HIK_DEFAULT")
        user, pw = os.environ.get(f"{env}_USER"), os.environ.get(f"{env}_PASS")
        self.auth = HTTPDigestAuth(user, pw) if user and pw else None
        self.base = f"http://{cfg['host']}:{cfg['http_port']}"

    def get(self, path: str) -> ET.Element:
        r = requests.get(self.base + path, auth=self.auth, timeout=10)
        r.raise_for_status()
        return strip_ns(ET.fromstring(r.content))

    def model(self) -> str | None:
        if not self.auth:
            return None
        try:
            return self.get("/ISAPI/System/deviceInfo").findtext("model")
        except (requests.RequestException, ET.ParseError):
            return None

    def channels(self) -> list[dict]:
        out = []
        try:  # analog inputs (DVR only; an NVR answers 4xx/empty)
            for ch in self.get("/ISAPI/System/Video/inputs/channels").iter("VideoInputChannel"):
                out.append({"channel": int(ch.findtext("id")), "kind": "analog",
                            "device_name": ch.findtext("name"), "camera_ip": None})
        except (requests.RequestException, ET.ParseError):
            pass
        for ch in self.get("/ISAPI/ContentMgmt/InputProxy/channels").iter("InputProxyChannel"):
            out.append({"channel": int(ch.findtext("id")), "kind": "ip",
                        "device_name": (ch.findtext("name") or "").strip() or None,
                        "camera_ip": ch.findtext(".//ipAddress")})
        return out

    def recorded_24h(self, channel: int) -> tuple[float, int, float]:
        """(hours, segments, GB) of footage on this channel in the last 24h."""
        end = dt.datetime.now()
        start = end - dt.timedelta(hours=24)
        fmt = lambda t: t.strftime("%Y-%m-%dT%H:%M:%SZ")
        secs = size = 0.0
        segs = 0
        while True:
            body = f"""<?xml version="1.0" encoding="UTF-8"?><CMSearchDescription>
<searchID>{uuid.uuid4()}</searchID><trackList><trackID>{channel * 100 + 1}</trackID></trackList>
<timeSpanList><timeSpan><startTime>{fmt(start)}</startTime><endTime>{fmt(end)}</endTime></timeSpan></timeSpanList>
<maxResults>50</maxResults><searchResultPostion>{segs}</searchResultPostion>
<metadataList><metadataDescriptor>//recordType.meta.std-cgi.com</metadataDescriptor></metadataList></CMSearchDescription>"""
            r = requests.post(self.base + "/ISAPI/ContentMgmt/search", data=body, auth=self.auth, timeout=20)
            if r.status_code != 200:
                break
            items = re.findall(r"<startTime>(.*?)</startTime>\s*<endTime>(.*?)</endTime>", r.text)
            p = lambda s: dt.datetime.strptime(s[:19], "%Y-%m-%dT%H:%M:%S")
            secs += sum(max(0.0, (p(b) - p(a)).total_seconds()) for a, b in items)
            size += sum(int(x) for x in re.findall(r"size=(\d+)", r.text))
            segs += len(items)
            if "MORE" not in r.text or not items:
                break
        return secs / 3600, segs, size / 1e9


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
            rec = Recorder(cfg)
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
                hours, segs, gb = rec.recorded_24h(ch["channel"])
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
