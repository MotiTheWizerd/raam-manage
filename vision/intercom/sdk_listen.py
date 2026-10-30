"""Listen to the Hikvision door/pool intercom panels through HCNetSDK.

The DS-KD8003 panels don't put calls or door unlocks on the ISAPI alertStream;
iVMS-4200 gets them by "arming" each panel over Hik's private protocol (:8000).
This does the same, next to iVMS (a device accepts several arming clients), and
just logs every event so we can learn what a call / answer / unlock looks like.
Read-only: nothing on the panels is changed.

Run from vision/:  .venv/Scripts/python.exe intercom/sdk_listen.py
SDK DLLs (64-bit, copied from the iVMS install) live in data/hik-sdk/ (gitignored).
Events go to stdout and logs/intercom-events.jsonl.
"""

import ctypes as C
import json
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SDK = ROOT / "data" / "hik-sdk"
LOG = ROOT / "logs" / "intercom-events.jsonl"

PANELS = ["10.0.0.70", "10.0.0.71", "10.0.0.72", "10.0.0.73", "10.0.0.173", "10.0.0.174"]
PORT = 8000
# The elevator recorder (remote site, SDK port only) — its motion goes to the
# same log, with the SDK channel numbers that moved (IP channels start at 33).
ELEVATOR = ("212.199.11.111", 8002)

# lCommand values we expect from intercom devices (HCNetSDK.h).
COMMANDS = {
    0x1132: "COMM_UPLOAD_VIDEO_INTERCOM_EVENT",
    0x1133: "COMM_ALARM_VIDEO_INTERCOM",
    0x1134: "COMM_UPLOAD_NOTICE_DATA",
    0x4000: "COMM_ALARM_V30",
    0x4007: "COMM_ALARM_V40",
    0x5002: "COMM_ALARM_ACS",
    0x6009: "COMM_ISAPI_ALARM",
}


def env(name: str) -> str:
    for line in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines():
        if line.startswith(name + "="):
            return line.split("=", 1)[1].strip().strip('"')
    raise SystemExit(f"{name} missing in .env.local")


os.add_dll_directory(str(SDK))
os.add_dll_directory(str(SDK / "HCNetSDKCom"))
sdk = C.WinDLL(str(SDK / "HCNetSDK.dll"))


class LocalSdkPath(C.Structure):
    _fields_ = [("sPath", C.c_char * 256), ("byRes", C.c_ubyte * 128)]


def init() -> None:
    # Tell the SDK where its component DLLs and OpenSSL are (it can't guess).
    path = LocalSdkPath()
    path.sPath = str(SDK).encode() + b"\\"
    sdk.NET_DVR_SetSDKInitCfg(2, C.byref(path))  # NET_SDK_INIT_CFG_SDK_PATH
    sdk.NET_DVR_SetSDKInitCfg(3, C.c_char_p(str(SDK / "libcrypto-3-x64.dll").encode()))
    sdk.NET_DVR_SetSDKInitCfg(4, C.c_char_p(str(SDK / "libssl-3-x64.dll").encode()))
    if not sdk.NET_DVR_Init():
        raise SystemExit(f"NET_DVR_Init failed: {sdk.NET_DVR_GetLastError()}")
    sdk.NET_DVR_SetConnectTime(3000, 1)
    sdk.NET_DVR_SetReconnect(10000, True)
    (ROOT / "logs" / "hik-sdk").mkdir(parents=True, exist_ok=True)
    sdk.NET_DVR_SetLogToFile(3, str(ROOT / "logs" / "hik-sdk").encode() + b"\\", False)


users: dict[int, str] = {}  # lUserID -> panel ip


def strings(raw: bytes) -> list[str]:
    return [s.decode("ascii") for s in re.findall(rb"[\x20-\x7e]{4,}", raw)][:12]


def describe(cmd: int, buf: int, size: int) -> dict:
    raw = C.string_at(buf, min(size, 4096)) if buf and size else b""
    out: dict = {"len": size, "hex": raw[:192].hex(" "), "strings": strings(raw)}
    if cmd in (0x1132, 0x1133) and len(raw) >= 48:
        # NET_DVR_VIDEO_INTERCOM_EVENT / _ALARM: dwSize, NET_DVR_TIME_EX(8),
        # byDevNumber[32], then byEventType / byAlarmType at offset 44.
        y, mo, d, h, mi, s = int.from_bytes(raw[4:6], "little"), *raw[6:11]
        out["devTime"] = f"{y:04d}-{mo:02d}-{d:02d} {h:02d}:{mi:02d}:{s:02d}"
        out["devNumber"] = raw[12:44].split(b"\0")[0].decode("ascii", "replace")
        out["type"] = raw[44]
        out["detail_hex"] = raw[48:112].hex(" ")
    if cmd == 0x4000 and len(raw) >= 232:
        # NET_DVR_ALARMINFO_V30: dwAlarmType (3 = motion), ... byChannel[64] at
        # offset 168: flag i set = channel i+1 moved (33+ = IP channels).
        out["type"] = int.from_bytes(raw[0:4], "little")
        out["channels"] = [i + 1 for i in range(64) if raw[168 + i]]
    if cmd == 0x6009 and len(raw) >= 12:
        # NET_DVR_ALARM_ISAPI_INFO: char* pAlarmData; DWORD dwAlarmDataLen; ...
        ptr = int.from_bytes(raw[0:8], "little")
        n = int.from_bytes(raw[8:12], "little")
        if ptr and n:
            out["isapi"] = C.string_at(ptr, min(n, 8192)).decode("utf-8", "replace")
    return out


@C.WINFUNCTYPE(C.c_int, C.c_long, C.c_void_p, C.c_void_p, C.c_ulong, C.c_void_p)
def on_message(cmd, alarmer, info, size, _user):
    try:
        # NET_DVR_ALARMER: 8 flag bytes, then LONG lUserID at offset 8.
        uid = C.c_long.from_address(alarmer + 8).value if alarmer else -1
        ev = {
            "at": datetime.now().isoformat(timespec="milliseconds"),
            "panel": users.get(uid, f"user{uid}"),
            "cmd": f"0x{cmd:04x}",
            "name": COMMANDS.get(cmd, "?"),
            **describe(cmd, info, size),
        }
        line = json.dumps(ev, ensure_ascii=False)
        print(line, flush=True)
        with LOG.open("a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception as e:  # never let an exception cross into the SDK thread
        print(f"callback error: {e}", file=sys.stderr, flush=True)
    return 1


def main() -> None:
    init()
    sdk.NET_DVR_SetDVRMessageCallBack_V31(on_message, None)
    user, password = env("HIK_DEFAULT_USER").encode(), env("HIK_DEFAULT_PASS").encode()
    for ip, port in [(p, PORT) for p in PANELS] + [ELEVATOR]:
        info = C.create_string_buffer(1024)  # NET_DVR_DEVICEINFO_V30, oversized
        uid = sdk.NET_DVR_Login_V30(ip.encode(), port, user, password, info)
        if uid < 0:
            print(f"{ip} login failed: error {sdk.NET_DVR_GetLastError()}", flush=True)
            continue
        users[uid] = ip
        handle = sdk.NET_DVR_SetupAlarmChan_V30(uid)
        state = "armed" if handle >= 0 else f"arm failed: error {sdk.NET_DVR_GetLastError()}"
        print(f"{ip} logged in (user {uid}), {state}", flush=True)
    print(f"listening on {len(users)} devices — events also go to {LOG}", flush=True)
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        for uid in users:
            sdk.NET_DVR_Logout(uid)
        sdk.NET_DVR_Cleanup()


if __name__ == "__main__":
    main()
