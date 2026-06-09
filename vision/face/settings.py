"""The single source of tunable configuration.

Everything that used to be a module-level global (mutated via `global X` from the
HTTP handler) now lives on ONE mutable `settings` object. Every module reads
`settings.<field>` at call time, so the `/threshold` endpoint can retune the live
sentry by mutating this one object — no globals, no restart.

Truly-static config (paths, the camera→door map, stream name) stays as module
constants below.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

# --- static config (not retuned at runtime) --------------------------------
STREAM = "main"
DEFAULT_CAM = "lobby"
BOUNDARY = "frame"
# faces_db.json lives in vision/ (one level up from this package).
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "faces_db.json")

# which door each camera opens: cam_id -> (geovision ctrl_id, dr_id). Add cams
# here as we deploy them (e.g. a pool cam -> the pool door). Default = lobby.
CAM_DOOR = {"lobby": (4, 0)}
DEFAULT_DOOR = (4, 0)


@dataclass
class Settings:
    """Live-tunable knobs (via /threshold). Defaults are the session-27 baked-in
    sweet spot for the .119 ceiling fisheye lobby cam."""

    # --- recognition / logging ---
    # Recognition is DECOUPLED into logging vs the door decision. LOG/greet on any
    # loose match; OPEN on quality-weighted EVIDENCE ACCUMULATED over a short window,
    # not a single lucky frame — so a resident opens the door while walking up (many
    # light votes add up) instead of stopping to pose, while a lookalike (low margin)
    # or a flickering crowd (split consensus) never accrues enough.
    match_threshold: float = 0.30   # cosine sim to LOG/greet + to count as a vote

    # --- accumulator (the door decision) ---
    accum_window: float = 3.5       # seconds of recent votes the decision considers
    accum_min_votes: int = 3        # need at least this many frames (no single-blip)
    accum_weight_min: float = 1.2   # total quality-weighted evidence the winner needs
    accum_consensus: float = 0.60   # winner must own >= this fraction of window weight
    door_min_score: float = 0.34    # winner's weighted-mean score to open (lower than
                                    #   a single-frame bar — accumulated consistency pays)
    door_margin: float = 0.08       # winner's weighted-mean top1-top2 margin (lookalike kill)
    door_cooldown: float = 12.0     # don't re-open a door within this many seconds

    # --- face-quality weighting ramp ---
    # Each frame's vote counts by face QUALITY = ramp(px) x detConf x frontality:
    # a small/blurry/side face counts LITTLE (not penalized — just carries less
    # weight; a 30px face is mush = noisy, so it shouldn't decide alone). PX_FULL is
    # tuned to THIS ceiling fisheye, where a natural-approach face is only ~55-65px.
    px_floor: int = 30              # below this a vote carries ~no weight (mush)
    px_full: int = 60               # at/above this, full pixel-confidence

    # --- entry-event log ---
    # one event per arrival (known OR unknown), debounced per identity.
    event_cooldown: float = 45.0    # seconds before the same identity logs again
    events_capacity: int = 400      # how many recent events (+ snapshots) to keep

    # --- enrollment ---
    enroll_seconds: float = 6.0     # capture window length, once a face appears
    enroll_wait_seconds: float = 50.0  # grace to walk to the camera after clicking
    min_enroll_px: int = 60

    # --- performance (the keys to scaling across cameras on a CPU box) ---
    ort_threads: int = 4            # cap onnxruntime cores (default grabs ALL 16)
    active_fps: float = 8.0         # inference rate while something is moving
    idle_fps: float = 4.0           # cheap pass-through rate while the view is still
    motion_ratio: float = 0.004     # fraction of pixels that must change = motion
    motion_linger: float = 2.0      # keep recognizing this long after the last motion


settings = Settings()
