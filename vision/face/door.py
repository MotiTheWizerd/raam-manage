"""GeoVision door client (shared).

One momentary unlock against the local GeoVision ASWeb server. Mirrors the app's
src/lib/doors.ts pattern: login -> session guid -> DOOR_OPERATION UNLOCK_DOOR,
re-auth + retry once on failure. The `armed` flag gates whether opens actually
fire (disarm = recognize but never open).
"""

from __future__ import annotations

import http.cookiejar
import json
import ssl
import urllib.parse
import urllib.request


class GeoVisionDoor:
    BASE = "https://localhost/ASWeb"
    ENDPOINT = BASE + "/bin/ControllerList.srf"
    USER, PASS = "admin", "Sami0207!"

    def __init__(self, armed: bool = True):
        self.armed = armed
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE  # GeoWebServer self-signed cert on localhost
        # A cookie jar captures GvWebSessionID across the /Login/ 302 redirect
        # (urllib auto-follows it and would otherwise drop the Set-Cookie, unlike
        # node https).
        self._jar = http.cookiejar.CookieJar()
        self._opener = urllib.request.build_opener(
            urllib.request.HTTPSHandler(context=ctx),
            urllib.request.HTTPCookieProcessor(self._jar),
        )
        self._guid: str | None = None

    def _post(self, url: str, fields: dict):
        data = urllib.parse.urlencode(fields).encode()
        req = urllib.request.Request(url, data=data, method="POST")
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
        with self._opener.open(req, timeout=8) as r:
            return r.status, r.read().decode("utf-8", "replace")

    def _login(self) -> str:
        self._jar.clear()
        self._post(self.BASE + "/Login/",
                   {"username": self.USER, "password": self.PASS, "end": "end"})
        if not any(c.name == "GvWebSessionID" for c in self._jar):
            raise RuntimeError("door login failed (no GvWebSessionID)")
        _, body = self._post(self.ENDPOINT,
                             {"action": "WEBCLIENT_LOGIN", "module": "monitor",
                              "client_guid": "", "login": "1"})
        guid = (json.loads(body) if body else {}).get("client_guid")
        if not guid:
            raise RuntimeError("door register failed")
        return guid

    def open(self, ctrl_id: int, dr_id: int) -> tuple[bool, str]:
        """One momentary unlock, re-auth + retry once (doors.ts pattern)."""
        for attempt in range(2):
            try:
                if not self._guid:
                    self._guid = self._login()
            except Exception as e:
                self._guid = None
                if attempt == 1:
                    return False, str(e)
                continue
            try:
                st, body = self._post(self.ENDPOINT, {
                    "action": "DOOR_OPERATION", "module": "monitor", "dvg_id": "0",
                    "ctrl_id": str(ctrl_id), "dr_id": str(dr_id),
                    "operation": "UNLOCK_DOOR", "client_guid": self._guid,
                    "reason": "raam-face",
                })
                j = json.loads(body) if body else {}
                if j.get("success") == 1:
                    return True, "ok"
                self._guid = None
                if attempt == 1:
                    return False, str(j.get("errmsg", f"status {st}"))
            except Exception as e:
                self._guid = None
                if attempt == 1:
                    return False, str(e)
        return False, "failed"
