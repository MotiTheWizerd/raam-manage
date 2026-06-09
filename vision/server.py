"""Vision detection service — entry point.

Serves live YOLO object-detection feeds over localhost HTTP so the Next app can
embed them behind a "detection mode" toggle. The implementation now lives in the
`detection/` package (single-responsibility modules); this file stays put so pm2 /
the run command are unchanged:

    .venv/Scripts/python server.py                 # default 127.0.0.1:8089
    .venv/Scripts/python server.py --port 8089 --stream sub --conf 0.35

See detection/__init__.py for the module map and detection/cli.py for endpoints.
"""

from detection.cli import main

if __name__ == "__main__":
    main()
