"""Audio feedback on the lobby PC.

Short tones so the person being enrolled (who has walked over to the camera,
away from the screen) hears when the capture STARTS and when it has SAVED.
winsound is Windows-only + stdlib; tones play on the box's default audio device.
Always run in a thread — winsound.Beep blocks for its duration.
"""

from __future__ import annotations

import threading

try:
    import winsound
except ImportError:  # non-Windows dev box
    winsound = None

_SOUNDS = {
    "start": [(880, 120), (1175, 160)],               # rising "get ready / look now"
    "done": [(1047, 130), (1319, 130), (1568, 200)],  # happy 3-note "saved!"
    "fail": [(440, 200), (330, 320)],                 # low "didn't work"
}


def play(kind: str) -> None:
    if winsound is None:
        return

    def run():
        for freq, dur in _SOUNDS.get(kind, []):
            try:
                winsound.Beep(freq, dur)
            except Exception:
                return

    threading.Thread(target=run, daemon=True).start()
