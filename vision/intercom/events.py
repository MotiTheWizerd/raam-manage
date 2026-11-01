"""Where the intercom listener's events go — shared by sdk_listen.py and replay_call.py.

- logs/intercom-events.jsonl: every event, one JSON line (the app tails it for
  motion and calls).
- data/intercom-photos/: the door-camera photo a panel sends with each unlock,
  one folder per day, plus openings.jsonl — the list of openings the app shows.
"""

import json
import shutil
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOG = ROOT / "logs" / "intercom-events.jsonl"
# The elevator recorder alone sends ~1 motion alarm a second, so the log is
# capped: past this size it moves to intercom-events.1.jsonl and starts over.
LOG_MAX_BYTES = 20 * 1024 * 1024

PHOTOS = ROOT / "data" / "intercom-photos"
OPENINGS = PHOTOS / "openings.jsonl"
# Photos of people at the doors: kept a month, like a recorder would.
PHOTO_KEEP_DAYS = 30

_pruned_on: date | None = None


def env(name: str) -> str:
    for line in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines():
        if line.startswith(name + "="):
            return line.split("=", 1)[1].strip().strip('"')
    raise SystemExit(f"{name} missing in .env.local")


def append_event(ev: dict, rotate: bool = True) -> None:
    if rotate and LOG.exists() and LOG.stat().st_size > LOG_MAX_BYTES:
        LOG.replace(LOG.with_suffix(".1.jsonl"))
    with LOG.open("a", encoding="utf-8") as f:
        f.write(json.dumps(ev, ensure_ascii=False) + "\n")


def save_opening(ev: dict, jpeg: bytes | None) -> None:
    """Store an unlock's photo and list the opening. Sets ev["photo"] (relative
    to PHOTOS) when there is one. ev needs "at", "panel" and "unlock"."""
    at = ev["at"]  # 2026-10-31T21:51:12.030
    if jpeg:
        rel = f"{at[:10]}/{at[11:19].replace(':', '')}-{at[20:23]}_{ev['panel'].split('.')[-1]}.jpg"
        (PHOTOS / rel).parent.mkdir(parents=True, exist_ok=True)
        (PHOTOS / rel).write_bytes(jpeg)
        ev["photo"] = rel
    row = {"at": at, "panel": ev["panel"], **ev["unlock"], "photo": ev.get("photo")}
    if ev.get("replay"):
        row["replay"] = True
    PHOTOS.mkdir(parents=True, exist_ok=True)
    with OPENINGS.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")
    _prune()


def _prune() -> None:
    """Once a day: drop photo folders older than PHOTO_KEEP_DAYS."""
    global _pruned_on
    today = date.today()
    if _pruned_on == today:
        return
    _pruned_on = today
    cutoff = (today - timedelta(days=PHOTO_KEEP_DAYS)).isoformat()
    for d in PHOTOS.iterdir():
        if d.is_dir() and len(d.name) == 10 and d.name < cutoff:
            shutil.rmtree(d, ignore_errors=True)
