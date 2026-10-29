"""Hikvision recorder access over ISAPI: channels, recording search, download.

Recorder clocks run on building-local time and stamp it with a (false) "Z";
every datetime here is a NAIVE local time, localized only when stored.
"""

import datetime as dt
import os
import re
import uuid
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import NamedTuple

import requests
from requests.auth import HTTPDigestAuth

ROOT = Path(__file__).resolve().parents[2]


def load_env() -> None:
    for line in (ROOT / ".env.local").read_text(encoding="utf-8-sig").splitlines():
        m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.strip())
        if m:
            os.environ.setdefault(m.group(1), m.group(2))


def strip_ns(root: ET.Element) -> ET.Element:
    for el in root.iter():
        el.tag = el.tag.split("}", 1)[-1]
    return root


class Segment(NamedTuple):
    start: dt.datetime  # naive, building-local
    end: dt.datetime
    uri: str  # playbackURI, as the recorder wants it back for download
    size: int  # bytes, 0 when the recorder doesn't say


def _hik_time(t: dt.datetime) -> str:
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse_time(s: str) -> dt.datetime:
    return dt.datetime.strptime(s[:19], "%Y-%m-%dT%H:%M:%S")


def _file_name(uri: str) -> str | None:
    """The recorder's file id in a playbackURI (`name=`); downloads need it."""
    m = re.search(r"[?&]name=([^&]+)", uri)
    return m.group(1) if m else None


class Recorder:
    def __init__(self, host: str, http_port: int = 80, cred_env: str = "HIK_DEFAULT"):
        user, pw = os.environ.get(f"{cred_env}_USER"), os.environ.get(f"{cred_env}_PASS")
        self.auth = HTTPDigestAuth(user, pw) if user and pw else None
        self.base = f"http://{host}:{http_port}"

    def get(self, path: str) -> ET.Element:
        r = requests.get(self.base + path, auth=self.auth, timeout=10)
        r.raise_for_status()
        return strip_ns(ET.fromstring(r.content))

    def model(self) -> str | None:
        if not self.auth:
            return None
        try:
            return self.get("/ISAPI/System/deviceInfo").findtext("model")
        except (requests.RequestException, ET.ParseError):
            return None

    def channels(self) -> list[dict]:
        out = []
        try:  # analog inputs (DVR only; an NVR answers 4xx/empty)
            for ch in self.get("/ISAPI/System/Video/inputs/channels").iter("VideoInputChannel"):
                out.append({"channel": int(ch.findtext("id")), "kind": "analog",
                            "device_name": ch.findtext("name"), "camera_ip": None})
        except (requests.RequestException, ET.ParseError):
            pass
        for ch in self.get("/ISAPI/ContentMgmt/InputProxy/channels").iter("InputProxyChannel"):
            out.append({"channel": int(ch.findtext("id")), "kind": "ip",
                        "device_name": (ch.findtext("name") or "").strip() or None,
                        "camera_ip": ch.findtext(".//ipAddress")})
        return out

    def search(self, channel: int, start: dt.datetime, end: dt.datetime) -> list[Segment]:
        """Every recorded segment on a channel overlapping [start, end].

        ⚠ The recorder CLIPS each segment's listed start/end to the search
        span, while a download always sends the WHOLE file. For real segment
        times use segments_covering()."""
        out: list[Segment] = []
        while True:
            body = f"""<?xml version="1.0" encoding="UTF-8"?><CMSearchDescription>
<searchID>{uuid.uuid4()}</searchID><trackList><trackID>{channel * 100 + 1}</trackID></trackList>
<timeSpanList><timeSpan><startTime>{_hik_time(start)}</startTime><endTime>{_hik_time(end)}</endTime></timeSpan></timeSpanList>
<maxResults>50</maxResults><searchResultPostion>{len(out)}</searchResultPostion>
<metadataList><metadataDescriptor>//recordType.meta.std-cgi.com</metadataDescriptor></metadataList></CMSearchDescription>"""
            r = requests.post(self.base + "/ISAPI/ContentMgmt/search", data=body, auth=self.auth, timeout=20)
            if r.status_code != 200:
                break
            items = strip_ns(ET.fromstring(r.content)).iter("searchMatchItem")
            batch = []
            for it in items:
                uri = (it.findtext(".//playbackURI") or "").replace("&amp;", "&")
                size = re.search(r"size=(\d+)", uri)
                batch.append(Segment(_parse_time(it.findtext(".//startTime")),
                                     _parse_time(it.findtext(".//endTime")),
                                     uri, int(size.group(1)) if size else 0))
            out.extend(batch)
            if "MORE" not in r.text or not batch:
                break
        return out

    def segments_covering(self, channel: int, start: dt.datetime,
                          end: dt.datetime) -> tuple[list[Segment], bool]:
        """Segments overlapping [start, end) with their TRUE listed times.

        Some recorders (the .100 NVR) clip listed times to the search span, so
        the span widens on both sides until no overlapping segment touches its
        edges. Returns (segments, certain); certain is False only if even
        ±48h didn't contain them. Note a listed START is when recording was
        triggered: motion files also hold a few seconds of pre-record before
        it, so frame times must anchor on the listed END (see
        index_window.frames_in_window).
        """
        segs: list[Segment] = []
        for margin_h in (0.25, 2, 12, 48):
            span_start = start - dt.timedelta(hours=margin_h)
            span_end = end + dt.timedelta(hours=margin_h)
            by_file: dict[str, Segment] = {}
            for s in self.search(channel, span_start, span_end):
                if s.end <= start or s.start >= end:
                    continue
                key = _file_name(s.uri) or s.uri
                prev = by_file.get(key)  # one file can be listed in pieces
                by_file[key] = s if prev is None else Segment(
                    min(prev.start, s.start), max(prev.end, s.end), prev.uri, prev.size)
            segs = sorted(by_file.values(), key=lambda s: s.start)
            if not segs or (segs[0].start > span_start and segs[-1].end < span_end):
                return segs, True
        return segs, False

    def download(self, seg: Segment, dest: Path) -> int:
        """Stream one segment to disk; returns bytes written."""
        body = ('<?xml version="1.0" encoding="UTF-8"?><downloadRequest>'
                f'<playbackURI>{seg.uri.replace("&", "&amp;")}</playbackURI></downloadRequest>')
        total = 0
        with requests.post(self.base + "/ISAPI/ContentMgmt/download", data=body,
                           auth=self.auth, stream=True, timeout=60) as r:
            r.raise_for_status()
            with open(dest, "wb") as f:
                for chunk in r.iter_content(1 << 16):
                    f.write(chunk)
                    total += len(chunk)
        return total
