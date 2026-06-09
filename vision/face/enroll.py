"""The enrollment state machine.

Clicking "enroll" only ARMS the session — the timed capture clock does NOT start
until a real, close-enough face actually appears in front of the camera (the
operator clicks, then walks over). This keeps the enroll logic — which was tangled
across the recognition + loop code — in one place. The worker drives it (feeds
faces, ticks the clock) and owns the side effects (chimes, saving, messages).
"""

from __future__ import annotations

import time


class EnrollSession:
    def __init__(self):
        self.reset()

    def reset(self) -> None:
        self.active = False
        self.name = ""
        self.samples: list = []
        self.started = False
        self.deadline = 0.0
        self.wait_until = 0.0

    def arm(self, name: str, wait_seconds: float) -> None:
        """Arm enrollment but DON'T start the capture clock yet — that begins only
        once a real, close-enough face appears (see feed())."""
        self.reset()
        self.active = True
        self.name = name
        self.wait_until = time.time() + wait_seconds

    def feed(self, emb, px: int, min_px: int, capture_seconds: float) -> bool:
        """Record a sample if the face is big enough. Returns True on the frame
        that STARTS the capture clock (so the caller plays the 'look now' chime)."""
        if px < min_px:
            return False
        just_started = False
        if not self.started:
            self.started = True
            self.deadline = time.time() + capture_seconds
            just_started = True
        self.samples.append(emb)
        return just_started

    @property
    def count(self) -> int:
        return len(self.samples)

    def remaining(self) -> float:
        return max(0.0, self.deadline - time.time())

    def progress_text(self, px: int) -> str:
        if not self.started:
            return f"ENROLLING {self.name}: come closer / look at the camera ({px}px)"
        return f"ENROLLING {self.name}: {self.count} samples ({px}px) {self.remaining():.0f}s"

    def waiting_text(self) -> str:
        return f"ENROLLING {self.name}: step in front of the camera"

    def capture_done(self, now: float) -> bool:
        return self.started and now >= self.deadline

    def wait_expired(self, now: float) -> bool:
        return not self.started and now >= self.wait_until
