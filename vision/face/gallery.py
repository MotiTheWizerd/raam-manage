"""Enrolled-template store + matching.

The biometric gallery: a name -> mean embedding map, persisted to faces_db.json.
Kept SEPARATE from the model (engine.py) so swapping the recognition model never
touches this code — only the stored vectors become stale (a re-enroll, not a code
change). Thread-safe: one instance shared by every CameraWorker.
"""

from __future__ import annotations

import json
import os
import threading

import numpy as np

from .settings import DB_PATH


class FaceGallery:
    def __init__(self):
        self.db: dict[str, np.ndarray] = {}
        self._lock = threading.Lock()
        self._load()

    def _load(self) -> None:
        if not os.path.exists(DB_PATH):
            return
        with open(DB_PATH, "r", encoding="utf-8") as f:
            raw = json.load(f)
        with self._lock:
            self.db = {k: np.asarray(v, dtype=np.float32) for k, v in raw.items()}
        print(f"[face] loaded {len(self.db)} enrolled: {', '.join(self.db) or '(none)'}")

    def save(self) -> None:
        with self._lock:
            raw = {k: v.tolist() for k, v in self.db.items()}
        with open(DB_PATH, "w", encoding="utf-8") as f:
            json.dump(raw, f)

    def enroll(self, name: str, samples: list[np.ndarray]) -> int:
        mean = np.mean(np.stack(samples), axis=0)
        mean = mean / (np.linalg.norm(mean) + 1e-9)
        with self._lock:
            self.db[name] = mean.astype(np.float32)
        self.save()
        return len(samples)

    def forget(self, name: str) -> bool:
        with self._lock:
            existed = self.db.pop(name, None) is not None
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
