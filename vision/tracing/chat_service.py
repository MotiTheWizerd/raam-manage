"""Camera chat — "talk to the cameras".

A Claude agent (Agent SDK, runs through the local Claude Code CLI and its
login) whose ONLY tools are the tracing questions in tools.py. Built-in tools
(shell, files, web) are off. Each tool answers the model with compact JSON
and, separately, pushes the full result (with crop ids) to the UI stream —
the model never sees an image.

    POST /chat  {"session_id": "...", "message": "...", "user": "..."}
      → NDJSON stream: {"type": "text"|"tool"|"people"|"trace"|"coverage"|"job"|"done"|"error", ...}

    .venv/Scripts/python tracing/chat_service.py      (127.0.0.1:8095)
"""

import asyncio
import contextlib
import datetime as dt
import json
import os
import sys
import time
import uuid
from pathlib import Path
from typing import Any

import threading
from zoneinfo import ZoneInfo

import cv2
import psycopg
import uvicorn
from claude_agent_sdk import (AssistantMessage, ClaudeAgentOptions, ClaudeSDKClient, ResultMessage,
                              TextBlock, ToolUseBlock, create_sdk_mcp_server, tool)
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import FileResponse, JSONResponse, Response, StreamingResponse
from starlette.routing import Route

import tools as T
from hik import ROOT, Recorder, _file_name, load_env
from index_window import frames_in_window

HERE = Path(__file__).resolve().parent
PY = sys.executable
DATA = ROOT / "data" / "tracing"
# NOT 8090: that's raam-face on 0.0.0.0, and on Windows a 127.0.0.1 bind to the
# same port succeeds silently and steals its localhost traffic (seen s58).
# Taken on this box: 8089 vision, 8090 face, 8091.
PORT = int(os.environ.get("TRACING_CHAT_PORT", "8095"))
MODEL = os.environ.get("TRACING_CHAT_MODEL", "claude-opus-5")
SESSION_IDLE_S = 30 * 60
# Each open session holds a Claude Code CLI process (~100–200 MB) and this
# 16 GB box already ran out of memory once; past the cap the least recently
# used idle session is closed.
MAX_SESSIONS = 4
MAX_INDEX_HOURS = 3
SERVER = "cams"
TOOL_NAMES = ["list_places", "coverage", "find_people", "trace_person", "index_window", "job_status"]

SYSTEM_PROMPT = """You are the camera investigation assistant of a residential building's security desk. \
Staff use you after an incident to find who was where, and when, in recorded CCTV footage.

Everything you know about people comes from your tools, which search footage that has been INDEXED \
(people detected and fingerprinted by appearance). Footage that isn't indexed yet is invisible to you \
until you index it.

How to work:
- Resolve places the user names ("the main lobby", "parking") with list_places; groups are building areas.
- Times are building-local (Asia/Jerusalem). Tool times are "YYYY-MM-DD HH:MM". If the user gives no date, \
it means today; "around 17:00" means a window like 16:45–17:15 — say which window you used.
- Before find_people on a window, check coverage. If cameras are unindexed, tell the user and offer \
index_window (it runs in the background for several minutes per camera-hour; poll job_status when asked).
- The UI shows every result with pictures. Don't re-list what the cards already show: say how many, \
point out anything notable, and refer to people by their number (#1, #2…).
- To follow someone, call trace_person with that person's track_ids. Report the route as stays in time \
order (place, from–to). Mention "possible" sightings separately as unconfirmed.

Honesty rules — this is used for real incidents:
- Matching is by appearance (clothes, build), not identity. Similar clothing can be confused, one \
person can appear as two entries, and short glimpses are unreliable. Results are candidates for a \
human to verify by looking at the pictures; say so when it matters.
- "Seen on the lobby camera" is not "entered": the system doesn't know direction of movement.
- Never guess who a person is (names, apartments, roles), and never describe people by sensitive traits.

Answer in the user's language (usually Hebrew), briefly."""


def _db():
    return psycopg.connect(os.environ["DATABASE_URL"])


def _audit(user: str | None, session_id: str, tool_name: str, args: dict) -> None:
    with _db() as db:
        db.execute(
            "INSERT INTO trace_audit (user_name, session_id, tool, input) VALUES (%s, %s, %s, %s)",
            (user, session_id, tool_name, json.dumps(args, ensure_ascii=False)),
        )


def _text(obj: Any, is_error: bool = False) -> dict:
    return {"content": [{"type": "text", "text": json.dumps(obj, ensure_ascii=False, default=str)}],
            "is_error": is_error}


# ───────────────────────── indexing jobs ─────────────────────────

JOBS: dict[str, dict] = {}


async def _run_index_job(job: dict) -> None:
    log = open(job["log"], "w", encoding="utf-8")
    try:
        args = ["--start", job["start"], "--end", job["end"]]
        for g in job["groups"]:
            args += ["--group", g]
        for c in job["cameras"]:
            args += ["--camera", c]
        for script, extra in [("index_window.py", args), ("tracks.py", ["--start", job["start"], "--end", job["end"]])]:
            job["stage"] = script
            proc = await asyncio.create_subprocess_exec(
                PY, "-u", str(HERE / script), *extra, cwd=str(HERE),
                stdout=log, stderr=asyncio.subprocess.STDOUT)
            if await proc.wait() != 0:
                job["status"] = "failed"
                return
        job["status"] = "done"
    finally:
        job["finished"] = time.time()
        log.close()


# ───────────────────────── tools (per session) ─────────────────────────

def build_tools(session: "Session"):
    """Tools close over their session: to audit who asked, and to push full
    results to that session's UI stream."""

    def guard(name: str, args: dict) -> None:
        _audit(session.user, session.id, name, args)

    @tool("list_places", "List the building's camera groups (areas: parking, main lobby, gym…) and "
          "recording cameras. Use it to map a place the user names to group names / camera ids.",
          {"type": "object", "properties": {}})
    async def list_places(args: dict[str, Any]) -> dict[str, Any]:
        guard("list_places", args)
        with _db() as db:
            return _text(await asyncio.to_thread(T.list_places, db))

    window_props = {
        "start": {"type": "string", "description": 'Local time "YYYY-MM-DD HH:MM"'},
        "end": {"type": "string", "description": 'Local time "YYYY-MM-DD HH:MM"'},
        "groups": {"type": "array", "items": {"type": "string"}, "description": "Group names from list_places"},
        "cameras": {"type": "array", "items": {"type": "string"}, "description": "Camera ids from list_places"},
    }

    @tool("coverage", "Which cameras have indexed footage in a time window. Cameras listed in "
          "'unindexed' are invisible to find_people/trace_person until index_window runs.",
          {"type": "object", "properties": window_props, "required": ["start", "end"]})
    async def coverage(args: dict[str, Any]) -> dict[str, Any]:
        guard("coverage", args)
        with _db() as db:
            r = await asyncio.to_thread(T.coverage, db, args["start"], args["end"],
                                        args.get("groups"), args.get("cameras"))
        session.emit({"type": "coverage", "window": [args["start"], args["end"]], **r})
        return _text(r)

    @tool("find_people", "Who was seen on cameras (by group and/or camera id) in a time window. "
          "Returns people numbered #1.. in order of first appearance, each with the cameras, times and "
          "track_ids (pass those to trace_person). The UI shows each person's picture.",
          {"type": "object", "properties": window_props, "required": ["start", "end"]})
    async def find_people(args: dict[str, Any]) -> dict[str, Any]:
        guard("find_people", args)
        with _db() as db:
            r = await asyncio.to_thread(T.find_people, db, args["start"], args["end"],
                                        args.get("groups"), args.get("cameras"))
        session.emit({"type": "people", "window": [args["start"], args["end"]], **r})
        brief = [{k: p[k] for k in ("person", "first_seen", "last_seen", "cameras", "sightings", "track_ids")}
                 for p in r.get("people", [])]
        return _text({"people": brief, **({"note": r["note"]} if "note" in r else {})})

    @tool("trace_person", "Follow one person around the whole building: give the track_ids of the "
          "person (from find_people). Returns their stays (place, from–to, cameras) in time order, plus "
          "lower-confidence 'possible' sightings. Default window: ±60 min around their own sightings.",
          {"type": "object", "properties": {
              "track_ids": {"type": "array", "items": {"type": "integer"}},
              "start": window_props["start"], "end": window_props["end"],
              "label": {"type": "string", "description": 'How the user refers to them, e.g. "#2"'},
          }, "required": ["track_ids"]})
    async def trace_person(args: dict[str, Any]) -> dict[str, Any]:
        guard("trace_person", args)
        with _db() as db:
            r = await asyncio.to_thread(T.trace_person, db, args["track_ids"], args.get("start"), args.get("end"))
        session.emit({"type": "trace", "label": args.get("label"), **r})
        brief = {"window": r.get("window"),
                 "stays": [{k: s[k] for k in ("place", "from", "to", "cameras", "confidence")} for s in r.get("stays", [])],
                 "possible": [{k: v[k] for k in ("camera_name", "from", "to")} for v in r.get("possible", [])][:10]}
        return _text(brief)

    @tool("index_window", f"Start indexing recorded footage for a window (max {MAX_INDEX_HOURS} hours) so "
          "people in it become searchable. Runs in the background — several minutes per camera-hour. "
          "Returns a job_id for job_status.",
          {"type": "object", "properties": window_props, "required": ["start", "end"]})
    async def index_window(args: dict[str, Any]) -> dict[str, Any]:
        guard("index_window", args)
        try:
            s = dt.datetime.strptime(args["start"], "%Y-%m-%d %H:%M")
            e = dt.datetime.strptime(args["end"], "%Y-%m-%d %H:%M")
        except ValueError:
            return _text({"error": 'times must be "YYYY-MM-DD HH:MM"'}, is_error=True)
        if not 0 < (e - s).total_seconds() <= MAX_INDEX_HOURS * 3600:
            return _text({"error": f"window must be positive and at most {MAX_INDEX_HOURS} hours"}, is_error=True)
        if not (args.get("groups") or args.get("cameras")):
            return _text({"error": "name groups or cameras to index (the whole building is too much at once)"},
                         is_error=True)
        job_id = uuid.uuid4().hex[:8]
        (DATA / "jobs").mkdir(parents=True, exist_ok=True)
        job = {"id": job_id, "start": args["start"], "end": args["end"], "groups": args.get("groups") or [],
               "cameras": args.get("cameras") or [], "status": "running", "stage": None,
               "started": time.time(), "log": str(DATA / "jobs" / f"{job_id}.log")}
        JOBS[job_id] = job
        asyncio.create_task(_run_index_job(job))
        session.emit({"type": "job", "job_id": job_id, "status": "running", "window": [args["start"], args["end"]]})
        return _text({"job_id": job_id, "status": "running"})

    @tool("job_status", "Status of an index_window job.",
          {"type": "object", "properties": {"job_id": {"type": "string"}}, "required": ["job_id"]})
    async def job_status(args: dict[str, Any]) -> dict[str, Any]:
        job = JOBS.get(args["job_id"])
        if not job:
            return _text({"error": "unknown job"}, is_error=True)
        tail = Path(job["log"]).read_text(encoding="utf-8", errors="replace").splitlines()[-6:] \
            if Path(job["log"]).exists() else []
        r = {"job_id": job["id"], "status": job["status"], "stage": job["stage"],
             "minutes": round((time.time() - job["started"]) / 60, 1), "log_tail": tail}
        session.emit({"type": "job", **{k: r[k] for k in ("job_id", "status", "minutes")}})
        return _text(r)

    return create_sdk_mcp_server(name=SERVER, tools=[list_places, coverage, find_people,
                                                     trace_person, index_window, job_status])


# ───────────────────────── sessions ─────────────────────────

class Session:
    def __init__(self, sid: str, user: str | None):
        self.id = sid
        self.user = user
        self.client: ClaudeSDKClient | None = None
        self.pending: list[dict] = []
        self.lock = asyncio.Lock()
        self.last_used = time.time()

    def emit(self, event: dict) -> None:
        self.pending.append(event)

    async def ensure_client(self) -> ClaudeSDKClient:
        if self.client is None:
            now = dt.datetime.now().strftime("%A %Y-%m-%d %H:%M")
            (DATA / "chat").mkdir(parents=True, exist_ok=True)
            options = ClaudeAgentOptions(
                system_prompt=SYSTEM_PROMPT + f"\n\nNow (building-local): {now}.",
                mcp_servers={SERVER: build_tools(self)},
                tools=[],  # no built-in tools at all
                allowed_tools=[f"mcp__{SERVER}__{n}" for n in TOOL_NAMES],
                permission_mode="dontAsk",  # anything not allowed above is denied
                setting_sources=[],  # don't load the box's Claude Code settings/hooks
                model=MODEL,
                max_turns=12,
                cwd=str(DATA / "chat"),
            )
            self.client = ClaudeSDKClient(options=options)
            await self.client.connect()
        return self.client

    async def close(self) -> None:
        if self.client is not None:
            try:
                await self.client.disconnect()
            finally:
                self.client = None


SESSIONS: dict[str, Session] = {}


async def _reaper() -> None:
    while True:
        await asyncio.sleep(60)
        for sid, s in list(SESSIONS.items()):
            if time.time() - s.last_used > SESSION_IDLE_S and not s.lock.locked():
                SESSIONS.pop(sid, None)
                await s.close()


# ───────────────────────── http ─────────────────────────

def _line(obj: dict) -> bytes:
    return (json.dumps(obj, ensure_ascii=False, default=str) + "\n").encode("utf-8")


async def chat(request: Request):
    body = await request.json()
    message = (body.get("message") or "").strip()
    sid = body.get("session_id") or uuid.uuid4().hex
    if not message:
        return JSONResponse({"error": "empty message"}, status_code=400)
    session = SESSIONS.get(sid)
    if session is None:
        idle = sorted((s for s in SESSIONS.values() if not s.lock.locked()), key=lambda s: s.last_used)
        while len(SESSIONS) >= MAX_SESSIONS and idle:
            old = idle.pop(0)
            SESSIONS.pop(old.id, None)
            await old.close()
        session = SESSIONS.setdefault(sid, Session(sid, body.get("user")))

    async def stream():
        async with session.lock:
            session.last_used = time.time()
            yield _line({"type": "session", "session_id": sid})
            try:
                client = await session.ensure_client()
                await client.query(message)
                async for msg in client.receive_response():
                    for ev in session.pending:
                        yield _line(ev)
                    session.pending.clear()
                    if isinstance(msg, AssistantMessage):
                        for block in msg.content:
                            if isinstance(block, TextBlock) and block.text.strip():
                                yield _line({"type": "text", "text": block.text})
                            elif isinstance(block, ToolUseBlock):
                                yield _line({"type": "tool", "name": block.name.split("__")[-1],
                                             "input": block.input})
                    elif isinstance(msg, ResultMessage):
                        yield _line({"type": "done", "turns": msg.num_turns, "is_error": msg.is_error,
                                     "cost_usd": msg.total_cost_usd})
                for ev in session.pending:
                    yield _line(ev)
                session.pending.clear()
            except Exception as e:  # surface to the UI; drop the client so the next turn reconnects
                yield _line({"type": "error", "message": f"{type(e).__name__}: {e}"})
                await session.close()
            session.last_used = time.time()

    return StreamingResponse(stream(), media_type="application/x-ndjson")


# ───────────────────────── full frames ─────────────────────────
# The gallery's full-resolution view: the whole camera frame at a sighting's
# moment, the person boxed. Pulled from the recording (same timing logic the
# indexer uses), so it's the real picture, not an upscaled crop. Recordings
# are cached on disk (one download serves every sighting in that file), and
# rendered frames are cached by sighting id.

TZ = ZoneInfo("Asia/Jerusalem")
SEGMENT_CACHE = DATA / "cache"
FRAME_CACHE = DATA / "frames"
SEGMENT_CACHE_BYTES = 3 * 1024**3
_segment_locks: dict[str, threading.Lock] = {}
_segment_locks_guard = threading.Lock()


def _cached_segment(rec: Recorder, key: str, seg) -> Path:
    path = SEGMENT_CACHE / f"{key}.mp4"
    with _segment_locks_guard:
        lock = _segment_locks.setdefault(key, threading.Lock())
    with lock:  # one download per recording, however many frames want it
        if not path.exists():
            SEGMENT_CACHE.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(".part")
            rec.download(seg, tmp)
            tmp.replace(path)
            files = sorted(SEGMENT_CACHE.glob("*.mp4"), key=lambda p: p.stat().st_mtime)
            total = sum(p.stat().st_size for p in files)
            for old in files:  # oldest first, never the one just fetched
                if total <= SEGMENT_CACHE_BYTES or old == path:
                    break
                total -= old.stat().st_size
                old.unlink(missing_ok=True)
        path.touch()
    return path


def _render_frame(sighting_id: int) -> bytes | None:
    with _db() as db:
        row = db.execute(
            """SELECT s.seen_at, s.bbox, c.id, c.channel, COALESCE(c.name_he, c.device_name, c.id),
                      r.host, r.http_port, r.cred_env
                 FROM sightings s JOIN cameras c ON c.id = s.camera_id
                 JOIN recorders r ON r.id = c.recorder_id
                WHERE s.id = %s""",
            (sighting_id,),
        ).fetchone()
    if not row:
        return None
    seen_at, bbox, cam_id, channel, cam_name, host, port, cred_env = row
    seen = seen_at.astimezone(TZ).replace(tzinfo=None)
    rec = Recorder(host, port, cred_env)
    segs, _ = rec.segments_covering(channel, seen - dt.timedelta(seconds=1), seen + dt.timedelta(seconds=1))
    # the file can start up to ~30s before its listed start (pre-record)
    seg = next((s for s in segs if s.start - dt.timedelta(seconds=30) <= seen <= s.end), None)
    if seg is None:
        return None
    key = f"{cam_id}_{_file_name(seg.uri) or seg.start.strftime('%Y%m%d%H%M%S')}"
    clip = _cached_segment(rec, key, seg)
    best = None
    for t, frame in frames_in_window(clip, seg, seen - dt.timedelta(seconds=0.5),
                                     seen + dt.timedelta(seconds=0.5), 0.0, lambda m: None):
        gap = abs((t - seen).total_seconds())
        if best is None or gap < best[0]:
            best = (gap, frame)
        elif gap > best[0]:
            break  # moving away from the sighting's moment
    if best is None:
        return None
    frame = best[1]
    x1, y1, x2, y2 = bbox
    thick = max(2, frame.shape[0] // 270)
    cv2.rectangle(frame, (x1, y1), (x2, y2), (40, 40, 230), thick)
    ok, jpeg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
    return jpeg.tobytes() if ok else None


async def frame(request: Request):
    try:
        sid = int(request.query_params.get("s", ""))
    except ValueError:
        return JSONResponse({"error": "bad id"}, status_code=400)
    cached = FRAME_CACHE / f"{sid}.jpg"
    if cached.exists():
        return FileResponse(cached, media_type="image/jpeg")
    try:
        jpeg = await asyncio.to_thread(_render_frame, sid)
    except Exception as e:  # recorder unreachable, file gone from the recorder, …
        return JSONResponse({"error": f"{type(e).__name__}: {e}"}, status_code=502)
    if jpeg is None:
        return JSONResponse({"error": "frame not found"}, status_code=404)
    FRAME_CACHE.mkdir(parents=True, exist_ok=True)
    cached.write_bytes(jpeg)
    return Response(jpeg, media_type="image/jpeg")


async def health(request: Request):
    return JSONResponse({"ok": True, "sessions": len(SESSIONS), "model": MODEL})


@contextlib.asynccontextmanager
async def lifespan(app):
    reaper = asyncio.create_task(_reaper())
    yield
    reaper.cancel()
    for s in list(SESSIONS.values()):
        await s.close()


load_env()
app = Starlette(routes=[Route("/chat", chat, methods=["POST"]), Route("/frame", frame),
                        Route("/health", health)],
                lifespan=lifespan)

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="info")
