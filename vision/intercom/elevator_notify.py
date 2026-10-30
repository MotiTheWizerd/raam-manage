"""Make the elevator recorder's cameras report motion to us (motion follow).

Same fix as tracing/motion_notify.py does for the DVR/NVR — add the `center`
linkage ("Notify Surveillance Center") next to `record` on each channel's motion
trigger — but over Hikvision's SDK: the elevator recorder (212.199.11.111, a
remote site) opens no web port. `enable` backs each trigger up first;
`restore` puts the backup back.

    .venv/Scripts/python intercom/elevator_notify.py enable 2,4-8
    .venv/Scripts/python intercom/elevator_notify.py restore 2,4-8
"""

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from detection import hiksdk  # noqa: E402

HOST, PORT = "212.199.11.111", 8002
BACKUP = hiksdk.ROOT / "data/backups/hik-motion-2026-10-30/nvr-elev"
CENTER = (b"<EventTriggerNotification><id>center</id><notificationMethod>center"
          b"</notificationMethod><notificationRecurrence>beginning</notificationRecurrence>"
          b"</EventTriggerNotification>")
LIST_END = b"</EventTriggerNotificationList>"


def channels(spec: str) -> list[int]:
    out: list[int] = []
    for part in spec.split(","):
        a, _, b = part.partition("-")
        out.extend(range(int(a), int(b or a) + 1))
    return out


def methods(xml: bytes) -> str:
    return ",".join(m.decode() for m in re.findall(rb"<notificationMethod>([^<]*)", xml))


def main() -> None:
    if len(sys.argv) != 3 or sys.argv[1] not in ("enable", "restore"):
        sys.exit(__doc__)
    action, spec = sys.argv[1:]
    BACKUP.mkdir(parents=True, exist_ok=True)
    for ch in channels(spec):
        path = f"/ISAPI/Event/triggers/VMD-{ch}"
        saved = BACKUP / f"VMD-{ch}.xml"
        try:
            if action == "restore":
                if not saved.exists():
                    print(f"VMD-{ch}: no backup, skipped")
                    continue
                reply = hiksdk.isapi(HOST, PORT, "PUT", path, saved.read_bytes())
            else:
                now = hiksdk.isapi(HOST, PORT, "GET", path)
                if LIST_END not in now:
                    print(f"VMD-{ch}: no trigger list, skipped")
                    continue
                if b"<notificationMethod>center<" in now:
                    print(f"VMD-{ch}: already on ({methods(now)})")
                    continue
                if not saved.exists():
                    saved.write_bytes(now)
                reply = hiksdk.isapi(HOST, PORT, "PUT", path, now.replace(LIST_END, CENTER + LIST_END, 1))
            status = re.search(rb"<statusString>([^<]*)", reply)
            after = hiksdk.isapi(HOST, PORT, "GET", path)
            print(f"VMD-{ch}: {status.group(1).decode() if status else 'sent'} -> {methods(after)}")
        except RuntimeError as e:
            print(f"VMD-{ch}: {e}")


if __name__ == "__main__":
    main()
