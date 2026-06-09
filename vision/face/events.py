"""Entry-event log (shared).

A small in-memory ring of recent face appearances + their snapshots. The app
polls /events to drain new ones into its own DB (so this is just a short handoff
buffer, not the system of record).
"""

from __future__ import annotations

import collections
import threading
import time


class EventLog:
    def __init__(self, capacity: int):
        self.capacity = capacity
        self.lock = threading.Lock()
        self.events: collections.deque = collections.deque(maxlen=capacity)
        self.snaps: dict[int, bytes] = {}
        self._next = 1

    def add(self, cam: str, kind: str, label: str | None,
            score: float, px: int, jpeg: bytes, reason: dict | None = None) -> int:
        with self.lock:
            eid = self._next
            self._next += 1
            self.events.append({"id": eid, "ts": time.time(), "cam": cam,
                                "kind": kind, "label": label,
                                "score": round(float(score), 3), "px": int(px),
                                "reason": reason})
            self.snaps[eid] = jpeg
            # drop snapshots whose event has aged out of the ring
            live = {e["id"] for e in self.events}
            for k in [k for k in self.snaps if k not in live]:
                del self.snaps[k]
            return eid

    def since(self, since: int, limit: int) -> tuple[list, int]:
        with self.lock:
            out = [e for e in self.events if e["id"] > since][:limit]
            last = self.events[-1]["id"] if self.events else 0
            return out, last

    def snap(self, eid: int) -> bytes | None:
        with self.lock:
            return self.snaps.get(eid)
