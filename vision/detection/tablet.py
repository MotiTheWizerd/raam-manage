"""The lobby intercom tablet — the device a door panel's call actually rings.

A Hikvision DS-KH8520 indoor station at 10.0.0.248 (found 2026-11-01 by SADP
discovery; serial ...Q03811631). It has no web port, only the SDK one, so its
ISAPI goes through the SDK session (hiksdk.isapi). The door panels' own ISAPI
reports "idle" even mid-call and refuses hang-up; the tablet is the callee: its
status says "ring" while a door calls, and reject ends a ringing call on both
sides (proven 2026-11-01 05:17; hangUp is only for an answered call). Its door
open in "calling" mode was refused (SDK error 23), so doors open at the panel.

Only these fixed actions, only to this device (the vision server binds
127.0.0.1, and this is not a general ISAPI proxy).
"""

from __future__ import annotations

import json

from . import hiksdk

HOST, PORT = "10.0.0.248", 8000


def _call(method: str, path: str, body: bytes = b"") -> dict:
    try:
        reply = hiksdk.isapi(HOST, PORT, method, path, body).decode("utf-8", "replace")
        return {"ok": True, "reply": " ".join(reply.split())[:400]}
    except RuntimeError as e:
        return {"ok": False, "reply": str(e)[:400]}


def act(action: str) -> dict:
    if action == "status":
        r = _call("GET", "/ISAPI/VideoIntercom/callStatus?format=json")
        if r["ok"]:
            try:
                r["status"] = json.loads(r["reply"])["CallStatus"]["status"]
            except (ValueError, KeyError):
                pass
        return r
    if action in ("hangUp", "reject"):
        body = json.dumps({"CallSignal": {"cmdType": action}}).encode()
        return _call("PUT", "/ISAPI/VideoIntercom/callSignal?format=json", body)
    return {"ok": False, "reply": f"unknown action {action!r}"}
