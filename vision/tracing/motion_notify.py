"""Make a recorder's channels report motion to the app (motion follow).

A Hikvision device pushes a motion (VMD) event on its alertStream — the stream
src/lib/motion.ts listens to for the cameras page's motion follow — ONLY when
the channel's motion trigger includes the `center` linkage ("Notify
Surveillance Center"). Motion detection being on isn't enough: on the DVR and
the NVR every channel had just `record` (found 2026-10-30). `enable` adds
`center` next to what's there (recording untouched); `restore` puts back the
trigger saved before the first change.

    .venv/Scripts/python tracing/motion_notify.py enable dvr-137 1-32
    .venv/Scripts/python tracing/motion_notify.py restore dvr-137 25,29
"""

import re
import sys

import requests

from hik import ROOT, Recorder, load_env
from seed_cameras import RECORDERS

# The original triggers, taken before anything was changed.
BACKUP = ROOT / "data/backups/hik-motion-2026-10-30"
CENTER = (b"<EventTriggerNotification><id>center</id><notificationMethod>center"
          b"</notificationMethod><notificationRecurrence>beginning</notificationRecurrence>"
          b"</EventTriggerNotification>")
LIST_END = b"</EventTriggerNotificationList>"


def channels(spec: str) -> list[int]:
    """'1-32' / '25,29' / '1-9,12' -> channel numbers."""
    out: list[int] = []
    for part in spec.split(","):
        a, _, b = part.partition("-")
        out.extend(range(int(a), int(b or a) + 1))
    return out


def methods(xml: bytes) -> str:
    return ",".join(m.decode() for m in re.findall(rb"<notificationMethod>([^<]*)", xml))


def put(rec: Recorder, path: str, body: bytes) -> str:
    r = requests.put(rec.base + path, data=body, auth=rec.auth, timeout=10,
                     headers={"Content-Type": "application/xml"})
    m = re.search(rb"<statusString>([^<]*)", r.content)
    return m.group(1).decode() if m else f"HTTP {r.status_code}"


def main() -> None:
    if len(sys.argv) != 4 or sys.argv[1] not in ("enable", "restore"):
        sys.exit(__doc__)
    action, rec_id, spec = sys.argv[1:]
    cfg = next((r for r in RECORDERS if r["id"] == rec_id), None)
    if not cfg:
        sys.exit(f"unknown recorder {rec_id}; one of {[r['id'] for r in RECORDERS]}")
    load_env()
    rec = Recorder(cfg["host"], cfg["http_port"], cfg.get("cred_env", "HIK_DEFAULT"))
    saved_dir = BACKUP / rec_id
    saved_dir.mkdir(parents=True, exist_ok=True)

    for ch in channels(spec):
        path = f"/ISAPI/Event/triggers/VMD-{ch}"
        saved = saved_dir / f"VMD-{ch}.xml"
        if action == "restore":
            if not saved.exists() or b"<EventTrigger" not in saved.read_bytes():
                print(f"VMD-{ch}: no backup, skipped")
                continue
            status = put(rec, path, saved.read_bytes())
        else:
            r = requests.get(rec.base + path, auth=rec.auth, timeout=10)
            if r.status_code != 200 or LIST_END not in r.content:
                print(f"VMD-{ch}: no trigger (HTTP {r.status_code}), skipped")
                continue
            if b"<notificationMethod>center<" in r.content:
                print(f"VMD-{ch}: already on ({methods(r.content)})")
                continue
            if not saved.exists():  # a channel the first backup didn't cover
                saved.write_bytes(r.content)
            status = put(rec, path, r.content.replace(LIST_END, CENTER + LIST_END, 1))
        now = requests.get(rec.base + path, auth=rec.auth, timeout=10).content
        print(f"VMD-{ch}: {status} -> {methods(now)}")


if __name__ == "__main__":
    main()
