"""Enrolled-template store + matching.

The biometric gallery: a name -> mean embedding map, persisted to faces_db.json.
Kept SEPARATE from the model (engine.py) so swapping the recognition model never
touches this code — only the stored vectors become stale (a re-enroll, not a code
change). Thread-safe: one instance shared by every CameraWorker.

Every template is stamped with the recognition model that produced it. A template
from a different model still scores (same 512-d shape) but lands near zero
against everyone — the door silently recognizes nobody. So at load we name every
stale template LOUDLY; they stay loaded (the warning never changes door behavior).

On disk: {"version": 2, "faces": {name: {"model": "w600k_mbf", "emb": [...]}}}.
The legacy flat {name: [...]} file had no stamp; it is adopted as the running
model at first load (backed up first) and rewritten in the v2 shape.
"""

from __future__ import annotations

import json
import os
import shutil
import threading
import time

import numpy as np

from .settings import DB_PATH


class FaceGallery:
    def __init__(self, model_id: str):
        self.model_id = model_id
        self.db: dict[str, np.ndarray] = {}
        self.models: dict[str, str] = {}   # name -> model that made its template
        self._lock = threading.Lock()
        self._load()

    def _load(self) -> None:
        if not os.path.exists(DB_PATH):
            return
        with open(DB_PATH, "r", encoding="utf-8") as f:
            raw = json.load(f)
        legacy = raw.get("version") != 2
        if legacy:
            faces = {k: {"model": self.model_id, "emb": v} for k, v in raw.items()}
        else:
            faces = raw["faces"]
        with self._lock:
            self.db = {k: np.asarray(v["emb"], dtype=np.float32) for k, v in faces.items()}
            self.models = {k: v["model"] for k, v in faces.items()}
        print(f"[face] loaded {len(self.db)} enrolled: {', '.join(self.db) or '(none)'}")
        if legacy and self.db:
            backup = f"{DB_PATH}.bak-{int(time.time())}"
            shutil.copyfile(DB_PATH, backup)
            self.save()
            print(f"[face] stamped legacy templates as {self.model_id} (backup: {os.path.basename(backup)})")
        stale = self.stale()
        if stale:
            bar = "!" * 72
            print(f"[face] {bar}")
            print(f"[face] WARNING: {len(stale)} of {len(self.db)} templates were enrolled with a")
            print(f"[face] DIFFERENT recognition model than the one running ({self.model_id}).")
            print(f"[face] They will NOT be recognized until re-enrolled:")
            for name in stale:
                print(f"[face]   {name}  (enrolled with {self.models[name]})")
            print(f"[face] {bar}")

    def stale(self) -> list[str]:
        """Names whose template came from a different model than the running one."""
        with self._lock:
            return sorted(n for n, m in self.models.items() if m != self.model_id)

    def save(self) -> None:
        with self._lock:
            raw = {"version": 2,
                   "faces": {k: {"model": self.models[k], "emb": v.tolist()}
                             for k, v in self.db.items()}}
        # write-then-rename: a crash mid-write must never truncate the biometric db
        tmp = DB_PATH + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(raw, f)
        os.replace(tmp, DB_PATH)

    def enroll(self, name: str, samples: list[np.ndarray]) -> int:
        mean = np.mean(np.stack(samples), axis=0)
        mean = mean / (np.linalg.norm(mean) + 1e-9)
        with self._lock:
            self.db[name] = mean.astype(np.float32)
            self.models[name] = self.model_id
        self.save()
        return len(samples)

    def forget(self, name: str) -> bool:
        with self._lock:
            existed = self.db.pop(name, None) is not None
            self.models.pop(name, None)
        if existed:
            self.save()
        return existed

    def names(self) -> list[str]:
        with self._lock:
            return sorted(self.db)

    def best_match(self, emb: np.ndarray) -> tuple[str | None, float, str | None, float]:
        """Return (top1_name, top1_score, top2_name, top2_score), cosine sims.
        top2_* is (None, 0.0) when fewer than 2 templates are enrolled — so the
        margin rule is a no-op until there's an actual lookalike to confuse with."""
        with self._lock:
            if not self.db:
                return None, 0.0, None, 0.0
            names = list(self.db)
            mat = np.stack([self.db[n] for n in names])
        sims = mat @ emb  # cosine (both sides L2-normalized)
        order = np.argsort(sims)[::-1]
        i = int(order[0])
        if len(order) > 1:
            j = int(order[1])
            return names[i], float(sims[i]), names[j], float(sims[j])
        return names[i], float(sims[i]), None, 0.0
