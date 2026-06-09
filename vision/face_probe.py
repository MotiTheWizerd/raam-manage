"""Face recognition sentry — entry point.

A resident looks at a camera; if we recognize them, the matching door unlocks.
The implementation now lives in the `face/` package (single-responsibility
modules); this file stays put so pm2 / the run command are unchanged:

    .venv/Scripts/python face_probe.py                 # serves all cams lazily
    .venv/Scripts/python face_probe.py --no-door       # recognize but never open

See face/__init__.py for the module map and face/cli.py for the endpoints.
"""

from face.cli import main

if __name__ == "__main__":
    main()
