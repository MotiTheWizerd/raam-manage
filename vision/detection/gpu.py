"""A fixed set of threads for everything that touches the GPU.

Torch keeps per-thread CUDA state (library handles, workspaces) that is never
freed when the thread ends. The HTTP server starts a new thread per request and
the detection workers start new threads after every idle stop, so running YOLO
on those threads leaked ~1 MB per thread: measured 2026-11-10, ~100 MB a minute
on prod and ~50 GB after a few hours. Inference runs here instead, on threads
that live as long as the process, so that state is made once per thread.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Callable, TypeVar

T = TypeVar("T")

# Enough for a wall of detection tiles plus the motion checks; the GPU runs
# them one after another anyway, so more threads would only add memory.
_pool = ThreadPoolExecutor(max_workers=8, thread_name_prefix="gpu")


def run(fn: Callable[..., T], *args, **kwargs) -> T:
    """Run `fn` on a GPU thread and wait for its result (exceptions re-raise here)."""
    return _pool.submit(fn, *args, **kwargs).result()
