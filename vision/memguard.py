"""Memory limit for the pm2-run Python services.

pm2's max_memory_restart can't see these: on Windows the venv's pythonw.exe is
only a launcher that starts the real interpreter as a child process, and pm2
measures the launcher (~1 MB). So each service watches itself instead: once its
private memory passes MAX_MEMORY_MB (set per app in ecosystem.config.js), it
logs and exits, and pm2's autorestart brings it back clean.
"""

from __future__ import annotations

import os
import threading
import time

import psutil

CHECK_EVERY = 30.0  # seconds


def start(name: str) -> None:
    """Start the watch thread; no MAX_MEMORY_MB in the environment = no limit."""
    limit_mb = int(os.environ.get("MAX_MEMORY_MB") or 0)
    if limit_mb <= 0:
        return
    threading.Thread(target=_watch, args=(name, limit_mb), name="memguard", daemon=True).start()


def _watch(name: str, limit_mb: int) -> None:
    proc = psutil.Process()
    while True:
        time.sleep(CHECK_EVERY)
        used_mb = proc.memory_info().private // 2**20
        if used_mb > limit_mb:
            print(f"[memguard] {name}: {used_mb} MB > limit {limit_mb} MB, exiting for a restart",
                  flush=True)
            os._exit(1)
