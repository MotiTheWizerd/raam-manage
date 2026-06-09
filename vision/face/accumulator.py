"""Quality-weighted evidence accumulation + the door verdict.

The door opens on consistent, quality-backed evidence over a short rolling window
rather than one lucky frame: close+sharp -> 2-3 heavy votes -> opens fast; far ->
many light votes add up as they approach -> opens early; lookalike -> margin never
holds; crowd -> the leading identity never dominates. One accumulator per camera
worker. All bars are read live from `settings`.
"""

from __future__ import annotations

import collections

from .settings import settings


class VoteAccumulator:
    def __init__(self):
        self.votes: collections.deque = collections.deque()

    def add(self, name: str, score: float, margin: float, weight: float, ts: float) -> None:
        self.votes.append((ts, name, score, margin, weight))
        self._evict(ts)

    def clear(self) -> None:
        self.votes.clear()

    def _evict(self, now: float) -> None:
        while self.votes and now - self.votes[0][0] > settings.accum_window:
            self.votes.popleft()

    def evaluate(self, now: float) -> dict | None:
        """Tally the window and judge the leading identity against every bar.
        Returns the decision (or None if the window is empty)."""
        self._evict(now)
        if not self.votes:
            return None
        agg: dict[str, dict] = {}
        w_total = 0.0
        for _ts, name, score, margin, w in self.votes:
            d = agg.setdefault(name, {"w": 0.0, "ws": 0.0, "wm": 0.0, "n": 0})
            d["w"] += w
            d["ws"] += w * score
            d["wm"] += w * margin
            d["n"] += 1
            w_total += w
        winner = max(agg, key=lambda k: agg[k]["w"])
        d = agg[winner]
        w = d["w"]
        consensus = (w / w_total) if w_total > 0 else 0.0
        wscore = (d["ws"] / w) if w > 0 else 0.0
        wmargin = (d["wm"] / w) if w > 0 else 0.0
        blockers = []
        if d["n"] < settings.accum_min_votes:
            blockers.append("votes")
        if w < settings.accum_weight_min:
            blockers.append("evidence")
        if consensus < settings.accum_consensus:
            blockers.append("consensus")
        if wscore < settings.door_min_score:
            blockers.append("score")
        if wmargin < settings.door_margin:
            blockers.append("margin")
        return {"name": winner, "n": d["n"], "weight": round(w, 2),
                "consensus": round(consensus, 2), "score": round(wscore, 3),
                "margin": round(wmargin, 3), "passed": not blockers,
                "blockers": blockers}
