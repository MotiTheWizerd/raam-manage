"""Pictures from recorders reachable only over Hikvision's SDK (no web, no RTSP).

The elevator recorder (212.199.11.111, a remote site) opens just the SDK ports
to the internet, like it does for iVMS. The app addresses such a camera as
`hiksdk://<host>:<port>/<channel>` (SDK channel numbers: IP channels start at
33); this module logs in once per recorder, keeps the session, and returns one
JPEG per call via NET_DVR_CaptureJPEGPicture_NEW (~115 ms for a 720p frame,
measured 2026-10-30). Credentials: HIK_DEFAULT_* from .env.local.

The SDK DLLs (64-bit, from the iVMS install) live in data/hik-sdk/ (gitignored),
shared with vision/intercom/sdk_listen.py.
"""

from __future__ import annotations

import ctypes as C
import os
import re
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SDK_DIR = ROOT / "data" / "hik-sdk"
MAX_JPEG = 4 << 20

_lock = threading.Lock()
_sdk = None
_sessions: dict[tuple[str, int], int] = {}  # (host, port) -> SDK user id


class _LocalSdkPath(C.Structure):
    _fields_ = [("sPath", C.c_char * 256), ("byRes", C.c_ubyte * 128)]


class _JpegPara(C.Structure):
    _fields_ = [("wPicSize", C.c_uint16), ("wPicQuality", C.c_uint16)]


def _env(name: str) -> str:
    for line in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines():
        if line.startswith(name + "="):
            return line.split("=", 1)[1].strip().strip('"')
    raise RuntimeError(f"{name} missing in .env.local")


def _load():
    global _sdk
    if _sdk is None:
        os.add_dll_directory(str(SDK_DIR))
        os.add_dll_directory(str(SDK_DIR / "HCNetSDKCom"))
        sdk = C.WinDLL(str(SDK_DIR / "HCNetSDK.dll"))
        path = _LocalSdkPath()
        path.sPath = str(SDK_DIR).encode() + b"\\"
        sdk.NET_DVR_SetSDKInitCfg(2, C.byref(path))
        sdk.NET_DVR_SetSDKInitCfg(3, C.c_char_p(str(SDK_DIR / "libcrypto-3-x64.dll").encode()))
        sdk.NET_DVR_SetSDKInitCfg(4, C.c_char_p(str(SDK_DIR / "libssl-3-x64.dll").encode()))
        if not sdk.NET_DVR_Init():
            raise RuntimeError(f"NET_DVR_Init failed: {sdk.NET_DVR_GetLastError()}")
        sdk.NET_DVR_SetConnectTime(5000, 1)
        sdk.NET_DVR_SetReconnect(10000, True)
        _sdk = sdk
    return _sdk


def _login(sdk, host: str, port: int) -> int:
    key = (host, port)
    if key not in _sessions:
        info = C.create_string_buffer(1024)
        uid = sdk.NET_DVR_Login_V30(host.encode(), port, _env("HIK_DEFAULT_USER").encode(),
                                    _env("HIK_DEFAULT_PASS").encode(), info)
        if uid < 0:
            raise RuntimeError(f"login to {host}:{port} failed: {sdk.NET_DVR_GetLastError()}")
        _sessions[key] = uid
    return _sessions[key]


class _XmlIn(C.Structure):  # NET_DVR_XML_CONFIG_INPUT
    _fields_ = [("dwSize", C.c_uint32), ("lpRequestUrl", C.c_void_p), ("dwRequestUrlLen", C.c_uint32),
                ("lpInBuffer", C.c_void_p), ("dwInBufferSize", C.c_uint32), ("dwRecvTimeOut", C.c_uint32),
                ("byForceEncrpt", C.c_ubyte), ("byNumOfMultiPart", C.c_ubyte), ("byMIMEType", C.c_ubyte),
                ("byRes1", C.c_ubyte), ("dwSendTimeOut", C.c_uint32), ("byRes", C.c_ubyte * 24)]


class _XmlOut(C.Structure):  # NET_DVR_XML_CONFIG_OUTPUT
    _fields_ = [("dwSize", C.c_uint32), ("lpOutBuffer", C.c_void_p), ("dwOutBufferSize", C.c_uint32),
                ("dwReturnedXMLSize", C.c_uint32), ("lpStatusBuffer", C.c_void_p), ("dwStatusSize", C.c_uint32),
                ("lpDataBuffer", C.c_void_p), ("byNumOfMultiPart", C.c_ubyte), ("byRes", C.c_ubyte * 23)]


def isapi(host: str, port: int, method: str, path: str, body: bytes = b"") -> bytes:
    """An ISAPI request carried over the SDK session (for recorders with no web
    port). Returns the reply body; raises RuntimeError with the SDK error."""
    with _lock:
        sdk = _load()
        uid = _login(sdk, host, port)
    req = f"{method} {path}\r\n".encode()
    req_buf = C.create_string_buffer(req)
    in_buf = C.create_string_buffer(body) if body else None
    out_buf = C.create_string_buffer(1 << 20)
    status = C.create_string_buffer(4096)
    xi = _XmlIn(dwSize=C.sizeof(_XmlIn), lpRequestUrl=C.cast(req_buf, C.c_void_p),
                dwRequestUrlLen=len(req), lpInBuffer=C.cast(in_buf, C.c_void_p) if in_buf else None,
                dwInBufferSize=len(body), dwRecvTimeOut=15000)
    xo = _XmlOut(dwSize=C.sizeof(_XmlOut), lpOutBuffer=C.cast(out_buf, C.c_void_p),
                 dwOutBufferSize=1 << 20, lpStatusBuffer=C.cast(status, C.c_void_p), dwStatusSize=4096)
    if not sdk.NET_DVR_STDXMLConfig(uid, C.byref(xi), C.byref(xo)):
        raise RuntimeError(f"{method} {path}: SDK error {sdk.NET_DVR_GetLastError()} {status.value[:200]!r}")
    return out_buf.raw[: xo.dwReturnedXMLSize] or status.value


def parse(url: str) -> tuple[str, int, int] | None:
    m = re.fullmatch(r"hiksdk://([\w.-]+):(\d+)/(\d+)", url)
    return (m.group(1), int(m.group(2)), int(m.group(3))) if m else None


def capture(url: str) -> bytes | None:
    """One JPEG of a channel, or None (bad URL, recorder unreachable, no picture)."""
    target = parse(url)
    if not target:
        return None
    host, port, channel = target
    buf = C.create_string_buffer(MAX_JPEG)
    got = C.c_uint32()
    try:
        for _ in (1, 2):
            # The lock only guards the shared session; captures run in parallel.
            with _lock:
                sdk = _load()
                uid = _login(sdk, host, port)
            if sdk.NET_DVR_CaptureJPEGPicture_NEW(uid, channel, C.byref(_JpegPara(0xFF, 0)),
                                                  buf, MAX_JPEG, C.byref(got)):
                return buf.raw[: got.value]
            # The session may have dropped (network blip): log in again once.
            with _lock:
                if _sessions.get((host, port)) == uid:
                    sdk.NET_DVR_Logout(_sessions.pop((host, port)))
    except RuntimeError as e:
        print(f"[hiksdk] {e}")
    return None
