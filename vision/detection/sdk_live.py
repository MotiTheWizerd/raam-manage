"""Live video from recorders reachable only over Hikvision's SDK (the elevators).

The follow wall's /live for a `hiksdk://<host>:<port>/<channel>` camera. RTSP
cameras go through raw_grabber; the elevator recorder has no RTSP, so here the
SDK's real-time preview (NET_DVR_RealPlay_V40, main stream) hands us its
MPEG-PS packets in a callback, PyAV decodes them, and frames are JPEG-encoded
for live viewers the same way raw_grabber does (fps / quality / width capped).

Measured 2026-11-04 on elevator 2: opens in <0.1 s, 1280x720 H.264 at 25 fps,
~233 KB/s over the internet. Lazy + self-stopping: preview runs only while
someone watches, and stops LIVE_IDLE_STOP after the last viewer (it costs the
remote site's upload).
"""

from __future__ import annotations

import ctypes as C
import queue
import threading
import time

import av
import cv2

from . import hiksdk

LIVE_IDLE_STOP = 10.0
# No packet this long = the preview died (network, recorder): reopen it.
STALL_SECONDS = 10.0
NET_DVR_STREAMDATA = 2  # callback data type of the stream itself (1 = its header)


class _PreviewInfo(C.Structure):  # NET_DVR_PREVIEWINFO
    _fields_ = [("lChannel", C.c_int32), ("dwStreamType", C.c_uint32), ("dwLinkMode", C.c_uint32),
                ("hPlayWnd", C.c_void_p), ("bBlocked", C.c_int32), ("bPassbackRecord", C.c_int32),
                ("byPreviewMode", C.c_ubyte), ("byStreamID", C.c_ubyte * 32), ("byProtoType", C.c_ubyte),
                ("byRes1", C.c_ubyte), ("byVideoCodingType", C.c_ubyte), ("dwDisplayBufNum", C.c_uint32),
                ("byNPQMode", C.c_ubyte), ("byRecvMetadata", C.c_ubyte), ("byDataType", C.c_ubyte),
                ("byRes", C.c_ubyte * 213)]


_RealDataCallback = C.WINFUNCTYPE(None, C.c_int32, C.c_uint32, C.POINTER(C.c_ubyte), C.c_uint32, C.c_void_p)


class _Packets:
    """File-like reader over the callback's packets, for PyAV. EOF once the
    preview goes quiet for STALL_SECONDS (or is stopped), which ends decoding."""

    def __init__(self):
        self.q: queue.Queue[bytes | None] = queue.Queue(maxsize=500)
        self._buf = b""

    def push(self, data: bytes | None) -> None:
        try:
            self.q.put_nowait(data)
        except queue.Full:
            pass  # decoder far behind: drop (it resyncs on the next keyframe)

    def read(self, n: int) -> bytes:
        while not self._buf:
            try:
                data = self.q.get(timeout=STALL_SECONDS)
            except queue.Empty:
                return b""
            if data is None:
                return b""
            self._buf = data
        out, self._buf = self._buf[:n], self._buf[n:]
        return out


class SdkLive:
    def __init__(self, url: str):
        self.url = url
        self.cond = threading.Condition()
        self.live_jpeg: bytes | None = None
        self.live_seq = 0
        self.live_interval = 0.05
        self.live_quality = 80
        self.live_width = 0
        self._next_live_at = 0.0
        self.last_view_at = 0.0
        self.thread: threading.Thread | None = None
        self._start_lock = threading.Lock()

    def _idle(self) -> bool:
        return time.time() - self.last_view_at >= LIVE_IDLE_STOP

    def ensure_running(self) -> None:
        with self._start_lock:
            self.last_view_at = time.time()
            if self.thread is None or not self.thread.is_alive():
                self.thread = threading.Thread(target=self._loop, name="sdk-live", daemon=True)
                self.thread.start()

    def _loop(self) -> None:
        target = hiksdk.parse(self.url)
        if not target:
            return
        host, port, channel = target
        while not self._idle():
            try:
                self._preview(host, port, channel)
            except Exception as e:  # recorder unreachable, bad data: retry while watched
                print(f"[sdk-live] {host} ch{channel}: {e}")
            if not self._idle():
                time.sleep(2.0)
        with self.cond:
            self.live_jpeg = None  # the next viewer waits for a fresh picture

    def _preview(self, host: str, port: int, channel: int) -> None:
        with hiksdk._lock:
            sdk = hiksdk._load()
            uid = hiksdk._login(sdk, host, port)
        packets = _Packets()

        def on_data(_handle, data_type, buf, size, _user):
            # SDK thread: copy the bytes out and return quickly.
            if data_type == NET_DVR_STREAMDATA and size:
                packets.push(C.string_at(buf, size))

        callback = _RealDataCallback(on_data)  # kept alive for the whole preview
        info = _PreviewInfo(lChannel=channel, dwStreamType=0, dwLinkMode=0, bBlocked=1)
        handle = sdk.NET_DVR_RealPlay_V40(uid, C.byref(info), callback, None)
        if handle < 0:
            err = sdk.NET_DVR_GetLastError()
            # A dropped session: forget it so the next try logs in again.
            with hiksdk._lock:
                if hiksdk._sessions.get((host, port)) == uid:
                    sdk.NET_DVR_Logout(hiksdk._sessions.pop((host, port)))
            raise RuntimeError(f"RealPlay failed: SDK error {err}")
        print(f"[sdk-live] {host} ch{channel}: preview open")
        stopper = threading.Thread(target=self._stop_when_idle, args=(packets,), daemon=True)
        stopper.start()
        try:
            # PyAV's default probe reads ~5 s of stream before the first frame;
            # it's known H.264 in MPEG-PS, so half a second is plenty.
            with av.open(packets, format="mpeg", mode="r",
                         options={"analyzeduration": "500000", "probesize": "262144"}) as container:
                stream = container.streams.video[0]
                stream.thread_type = "AUTO"
                for frame in container.decode(stream):
                    if self._idle():
                        break
                    self._offer(frame)
        finally:
            sdk.NET_DVR_StopRealPlay(handle)
            packets.push(None)
            print(f"[sdk-live] {host} ch{channel}: preview closed")

    def _stop_when_idle(self, packets: _Packets) -> None:
        """Ends decoding once nobody watches, even if no frame arrives to notice."""
        while not self._idle():
            time.sleep(1.0)
        packets.push(None)

    def _offer(self, frame) -> None:
        """Encode this frame for live viewers if one is due (paced like raw_grabber)."""
        now = time.time()
        if now < self._next_live_at:
            return
        self._next_live_at = max(self._next_live_at + self.live_interval, now - self.live_interval)
        img = frame.to_ndarray(format="bgr24")
        w = self.live_width
        if w and img.shape[1] > w:
            h = round(img.shape[0] * w / img.shape[1])
            img = cv2.resize(img, (w, h), interpolation=cv2.INTER_AREA)
        ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, self.live_quality])
        if not ok:
            return
        with self.cond:
            self.live_jpeg = buf.tobytes()
            self.live_seq += 1
            self.cond.notify_all()

    def wait_live(
        self, after: int, fps: float, quality: int, width: int = 0, timeout: float = 5.0
    ):
        """Same contract as RawGrabber.wait_live: the next frame newer than
        `after` -> (jpeg, seq), or (None, after) on timeout."""
        self.ensure_running()
        with self.cond:
            self.live_interval = 1.0 / fps
            self.live_quality = quality
            self.live_width = width
            deadline = time.time() + timeout
            while self.live_seq <= after or self.live_jpeg is None:
                now = time.time()
                if now >= deadline:
                    return None, after
                self.last_view_at = now
                self.cond.wait(timeout=min(deadline - now, 1.0))
            self.last_view_at = time.time()
            return self.live_jpeg, self.live_seq


_lives: dict[str, SdkLive] = {}
_lives_lock = threading.Lock()


def get_sdk_live(url: str) -> SdkLive:
    with _lives_lock:
        live = _lives.get(url)
        if live is None:
            live = _lives[url] = SdkLive(url)
        return live
