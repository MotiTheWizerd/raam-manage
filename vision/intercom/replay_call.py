"""Play a visitor's intercom call into the event log, as if a panel had sent it.

Nobody presses the call buttons at night, so this writes the same events a real
call produces (decoded from 80 real ones): alarm 17 when it rings, an unlock by
the lobby tablet with the door camera's photo, alarm 18 when it ends. The app
can't tell the difference. Every line is marked "replay": true. The door is
never touched — the photo is a plain snapshot from the panel's camera.

Run from vision/:
  .venv/Scripts/python.exe intercom/replay_call.py 71              # rings 8s, tablet 🔑, hangs up 1s later
  .venv/Scripts/python.exe intercom/replay_call.py 72 --no-open    # rings 60s, nobody answers
The lobby's usual call: it rings, nobody answers, 🔑, hang up — no talking.
"""

import argparse
import time
from datetime import datetime

import requests
from requests.auth import HTTPDigestAuth

from events import append_event, env, save_opening

LOBBY_TABLET = "10010110001"


def event(ip: str, cmd: str, name: str, type_: int) -> dict:
    return {
        "at": datetime.now().isoformat(timespec="milliseconds"),
        "panel": ip,
        "cmd": cmd,
        "name": name,
        "type": type_,
        "replay": True,
    }


def snapshot(ip: str) -> bytes | None:
    try:
        res = requests.get(
            f"http://{ip}/ISAPI/Streaming/channels/101/picture",
            auth=HTTPDigestAuth(env("HIK_DEFAULT_USER"), env("HIK_DEFAULT_PASS")),
            timeout=5,
        )
        return res.content if res.ok else None
    except requests.RequestException:
        return None


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("panel", help="last part of the panel's address: 70 71 72 73 173 174")
    ap.add_argument("--no-open", action="store_true", help="nobody answers: rings, then ends")
    ap.add_argument("--ring", type=float, help="seconds until the tablet opens (default 8, 60 with --no-open)")
    ap.add_argument("--talk", type=float, default=1, help="seconds from opening to the hang-up (default 1)")
    args = ap.parse_args()
    ip = f"10.0.0.{args.panel}"
    ring = args.ring if args.ring is not None else (60 if args.no_open else 8)

    append_event(event(ip, "0x1133", "COMM_ALARM_VIDEO_INTERCOM", 17), rotate=False)
    print(f"{ip}: ringing", flush=True)
    time.sleep(ring)
    if not args.no_open:
        ev = event(ip, "0x1132", "COMM_UPLOAD_VIDEO_INTERCOM_EVENT", 1)
        ev["unlock"] = {"by": "indoor", "src": LOBBY_TABLET, "lock": "Door1"}
        save_opening(ev, snapshot(ip))
        append_event(ev, rotate=False)
        print(f"{ip}: opened by the tablet, photo {ev.get('photo') or 'none'}", flush=True)
        time.sleep(args.talk)
    append_event(event(ip, "0x1133", "COMM_ALARM_VIDEO_INTERCOM", 18), rotate=False)
    print(f"{ip}: call ended", flush=True)


if __name__ == "__main__":
    main()
