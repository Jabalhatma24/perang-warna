"""Server game: aiohttp satu port, hub WebSocket, CLI, cetak IP + QR."""
from __future__ import annotations

import argparse
import asyncio
import hmac
import json
import logging
import os
import secrets
import signal
import socket
import sys
import time
from collections import deque
from pathlib import Path
from urllib.parse import quote

from aiohttp import WSMsgType, web

sys.path.insert(0, str(Path(__file__).resolve().parent))

from gifts import GiftTracker  # noqa: E402
from parser import ChatProcessor, Moderator, Wilayah  # noqa: E402
from simulator import Simulator  # noqa: E402
from storage import Storage  # noqa: E402

log = logging.getLogger("server")

ROOT = Path(__file__).resolve().parent.parent
PUBLIC_DIR = ROOT / "public"
DATA_DIR = ROOT / "data"
CLIENT_QUEUE_LIMIT = 2000
ROLES = ("host", "view")
HUB_KEY: web.AppKey["Hub"] = web.AppKey("hub")
HOST_KEY_FILE = DATA_DIR / "host.key"
HOST_KEY_ENV = "PERANG_HOST_KEY"
MIN_HOST_KEY_LENGTH = 16
CLOSE_VIEWERS_FULL = 4001


class Client:
    def __init__(self, ws: web.WebSocketResponse, remote: str | None = None):
        self.ws = ws
        self.remote = remote
        self.role: str | None = None
        self.closing = False
        self.outbox: deque[str] = deque(maxlen=CLIENT_QUEUE_LIMIT)
        self.wake = asyncio.Event()

    def enqueue(self, text: str) -> None:
        self.outbox.append(text)
        self.wake.set()

    async def pump(self) -> None:
        while not self.ws.closed:
            await self.wake.wait()
            self.wake.clear()
            while self.outbox and not self.ws.closed:
                await self.ws.send_str(self.outbox.popleft())
            if self.closing:
                await self.ws.close(code=CLOSE_VIEWERS_FULL)
                return


class Hub:
    """Menerima event netral dari TikTok/simulator dan melayani klien WebSocket."""

    def __init__(self, config: dict, wilayah: Wilayah, moderator: Moderator, storage: Storage,
                 *, simulate_mode: bool = False, rate: str = "normal", has_tiktok: bool = False,
                 host_key: str | None = None):
        self.config = config
        self.host_key = host_key  # None hanya untuk tes; CLI selalu mengisinya lewat resolve_host_key()
        self.wilayah = wilayah
        self.moderator = moderator
        self.storage = storage
        self.simulate_mode = simulate_mode
        self.rate = rate
        self.has_tiktok = has_tiktok
        self.chat = ChatProcessor(wilayah, config["cooldown"]["dash"], config["cooldown"]["rally"])
        self.gifts = GiftTracker(config["gift"]["tiers"], config["gift"]["streakIdleSeconds"])
        self.clients: set[Client] = set()
        self.active_host: Client | None = None
        self.last_snapshot: str | None = None
        self.likes: dict[str, int] = {}
        self.tiktok_connected = False
        self.tiktok_detail = "Menunggu koneksi TikTok" if has_tiktok else "Tidak ada sumber chat"
        self.sim_task: asyncio.Task | None = None
        self.sim_tainted = False
        self._seq = 0
        self._boot = f"{int(time.time()):x}"

    # ----- amplop & pengiriman -----
    def envelope(self, msg_type: str, data: dict, user: dict | None = None) -> str:
        self._seq += 1
        message = {"v": 1, "type": msg_type, "id": f"{self._boot}-{self._seq}",
                   "ts": int(time.time() * 1000), "data": data}
        if user is not None:
            message["user"] = user
        return json.dumps(message, ensure_ascii=False, separators=(",", ":"))

    def broadcast(self, msg_type: str, data: dict, user: dict | None = None) -> None:
        # Koneksi yang belum HELLO atau sudah ditolak tidak menerima data apa pun.
        targets = [client for client in self.clients if client.role in ROLES]
        if not targets:
            return
        text = self.envelope(msg_type, data, user)
        for client in targets:
            client.enqueue(text)

    def to_host(self, msg_type: str, data: dict, user: dict | None = None) -> None:
        """Event mentah penonton hanya untuk host; penonton pasif cukup melihat snapshot."""
        if self.active_host is not None:
            self.active_host.enqueue(self.envelope(msg_type, data, user))

    def send_to(self, client: Client, msg_type: str, data: dict) -> None:
        client.enqueue(self.envelope(msg_type, data))

    def clean_user(self, raw: dict) -> dict:
        user_id = str(raw.get("id", ""))
        return {
            "id": user_id,
            "handle": raw.get("handle", ""),
            "nick": self.moderator.safe_nick(user_id, raw.get("nick", "")),
            "isFollower": bool(raw.get("isFollower")),
        }

    # ----- sink event netral -----
    def on_comment(self, raw_user: dict, text: str) -> None:
        user = self.clean_user(raw_user)
        action = self.chat.handle(user["id"], text, time.monotonic())
        if action is not None:
            self.to_host("CHAT_ACTION", action, user)

    def on_gift(self, raw_user: dict, gift_id, gift_name: str, unit_coins: int, group_id,
                repeat_count: int, repeat_end: bool, streakable: bool) -> None:
        user = self.clean_user(raw_user)
        payload = self.gifts.process(
            user_id=user["id"], gift_id=gift_id, gift_name=gift_name, unit_coins=unit_coins,
            group_id=group_id, repeat_count=repeat_count, repeat_end=repeat_end, streakable=streakable,
            team=self.chat.team_of(user["id"]), now=time.monotonic(),
        )
        if payload is None:
            return
        self.to_host("GIFT_TRIGGER", payload, user)
        if payload["tier"] == "MEGA" and payload["delta"] > 0:
            is_bot = user["id"].startswith("sim_")
            if (not is_bot or self.simulate_mode) and self.storage.add_prasasti(user["nick"]):
                self.broadcast("SCOREBOARD", self.storage.scoreboard())

    def on_like(self, raw_user: dict, count: int) -> None:
        team = self.chat.team_of(str(raw_user.get("id", "")))
        if team is not None:
            self.likes[team] = self.likes.get(team, 0) + int(count)

    def on_social(self, raw_user: dict, reason: str) -> None:
        user = self.clean_user(raw_user)
        team = self.chat.team_of(user["id"])
        if team is not None:
            self.to_host("CAPTAIN", {"reason": reason, "team": team}, user)

    def on_viewers(self, count: int) -> None:
        self.broadcast("JOIN", {"viewerCount": int(count)})

    def on_source_status(self, connected: bool, detail: str) -> None:
        self.tiktok_connected = connected
        self.tiktok_detail = detail
        log.info("TikTok: %s", detail)
        self.broadcast("STATUS", self.status())

    # ----- status & simulasi -----
    @property
    def sim_active(self) -> bool:
        return self.sim_task is not None and not self.sim_task.done()

    def status(self) -> dict:
        if self.sim_active:
            return {"source": "simulate", "connected": True, "simActive": True,
                    "detail": f"Simulasi aktif ({self.rate})"}
        return {"source": "tiktok", "connected": self.tiktok_connected, "simActive": False,
                "detail": self.tiktok_detail}

    def set_sim(self, on: bool) -> None:
        if on and not self.sim_active:
            self.sim_tainted = True
            self.sim_task = asyncio.create_task(Simulator(self.wilayah, self, self.rate).run(), name="simulator")
            self.sim_task.add_done_callback(report_task_exit)
        elif not on and self.sim_active:
            self.sim_task.cancel()
            self.sim_task = None
        self.broadcast("STATUS", self.status())

    # ----- pesan dari frontend -----
    def host_key_matches(self, supplied) -> bool:
        if self.host_key is None:
            return True
        if not isinstance(supplied, str):
            return False
        return hmac.compare_digest(supplied.encode(), self.host_key.encode())

    def view_count(self) -> int:
        return sum(1 for c in self.clients if c.role == "view")

    def handle_hello(self, client: Client, data: dict) -> None:
        # Satu HELLO per koneksi: menebak kunci harus membuka koneksi baru,
        # dan peran yang sudah ditetapkan tidak bisa diubah di tengah jalan.
        if client.role is not None:
            return
        role = "host" if data.get("role") == "host" else "view"
        if role == "host" and not self.host_key_matches(data.get("key")):
            log.warning("Permintaan host ditolak dari %s", client.remote)
            self.send_to(client, "HOST_DENIED", {})
            role = "view"
        if role == "view" and self.view_count() >= self.config["server"].get("maxViewers", 10):
            client.role = "rejected"
            client.closing = True
            self.send_to(client, "VIEW_FULL", {})
            return

        client.role = role
        self.send_to(client, "STATUS", self.status())
        self.send_to(client, "SCOREBOARD", self.storage.scoreboard())
        if role == "host":
            previous = self.active_host
            if previous is not None and previous is not client:
                # Host lama diberi tahu lalu menjadi view, supaya layarnya tetap menerima snapshot.
                self.send_to(previous, "HOST_INFO", {"active": False, "viewClients": 0})
                previous.role = "view"
            self.active_host = client  # host terbaru yang punya kunci menggantikan host lama
        elif self.last_snapshot is not None:
            client.enqueue(self.last_snapshot)
        self.notify_hosts()

    def notify_hosts(self) -> None:
        if self.active_host is not None:
            self.send_to(self.active_host, "HOST_INFO", {"active": True, "viewClients": self.view_count()})

    def handle_round_result(self, client: Client, data: dict) -> None:
        if client is not self.active_host:
            return
        winner = data.get("winner")
        if winner is not None and winner not in self.wilayah.codes:
            log.warning("ROUND_RESULT ditolak, pemenang tidak dikenal: %r", winner)
            return
        tainted = self.sim_tainted or bool(data.get("simulated"))
        count_permanent = self.simulate_mode or not tainted
        accepted = self.storage.record_round(
            str(data.get("roundId", "")), winner, data.get("mvp"), data.get("round"), count_permanent
        )
        if not accepted:
            # Tetap balas agar host yang mengirim ulang tahu hasilnya sudah tersimpan.
            self.send_to(client, "SCOREBOARD", self.storage.scoreboard())
            return
        self.sim_tainted = self.sim_active
        self.broadcast("SCOREBOARD", self.storage.scoreboard())

    def handle_snapshot(self, client: Client, data: dict) -> None:
        if client is not self.active_host:
            return
        text = self.envelope("STATE_SNAPSHOT", data)
        self.last_snapshot = text
        for other in self.clients:
            if other.role == "view":
                other.enqueue(text)

    def handle_message(self, client: Client, raw: str) -> None:
        # Penonton tidak punya pesan yang sah setelah HELLO, jadi tidak perlu diurai sama sekali.
        if client.role is not None and client is not self.active_host:
            return
        try:
            message = json.loads(raw)
            msg_type = message["type"]
            data = message.get("data") or {}
            if not isinstance(data, dict):
                raise ValueError("data bukan objek")
        except (ValueError, KeyError, TypeError) as error:
            log.debug("Pesan WebSocket tidak valid: %s", error)
            return

        if msg_type == "HELLO":
            self.handle_hello(client, data)
        elif msg_type == "ROUND_RESULT":
            self.handle_round_result(client, data)
        elif msg_type == "STATE_SNAPSHOT":
            self.handle_snapshot(client, data)
        elif msg_type == "SIM_TOGGLE":
            if client is self.active_host:
                self.set_sim(bool(data.get("on")))
        else:
            log.debug("Tipe pesan tidak dikenal: %s", msg_type)

    # ----- tugas latar -----
    async def like_loop(self) -> None:
        while True:
            await asyncio.sleep(1)
            if self.likes:
                likes, self.likes = self.likes, {}
                self.to_host("LIKE_BATCH", {"likes": likes})

    async def stats_loop(self) -> None:
        while True:
            await asyncio.sleep(60)
            log.info("Statistik chat: %s, streak aktif: %d", self.chat.stats, self.gifts.active_count)


async def ws_handler(request: web.Request) -> web.WebSocketResponse:
    hub = request.app[HUB_KEY]
    ws = web.WebSocketResponse(heartbeat=20, max_msg_size=1024 * 1024)
    await ws.prepare(request)
    client = Client(ws, request.remote)
    hub.clients.add(client)
    pump = asyncio.create_task(client.pump())
    try:
        async for message in ws:
            if message.type == WSMsgType.TEXT:
                hub.handle_message(client, message.data)
    finally:
        pump.cancel()
        hub.clients.discard(client)
        if hub.active_host is client:
            hub.active_host = None
        hub.notify_hosts()
    return ws


async def index_handler(request: web.Request) -> web.FileResponse:
    return web.FileResponse(PUBLIC_DIR / "index.html")


async def config_handler(request: web.Request) -> web.Response:
    return web.json_response(request.app[HUB_KEY].config)


async def wilayah_handler(request: web.Request) -> web.Response:
    return web.FileResponse(DATA_DIR / "wilayah.json")


async def no_cache(request: web.Request, response: web.StreamResponse) -> None:
    response.headers["Cache-Control"] = "no-cache"


def build_app(hub: Hub) -> web.Application:
    app = web.Application()
    app[HUB_KEY] = hub
    app.router.add_get("/", index_handler)
    app.router.add_get("/ws", ws_handler)
    app.router.add_get("/config.json", config_handler)
    app.router.add_get("/wilayah.json", wilayah_handler)
    app.router.add_static("/", PUBLIC_DIR, show_index=False)
    app.on_response_prepare.append(no_cache)
    return app


def lan_ip() -> str:
    """IP antarmuka yang dipakai untuk keluar ke jaringan; tidak ada paket yang dikirim."""
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(("8.8.8.8", 80))
        return probe.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        probe.close()


def resolve_host_key(cli_key: str | None, path: Path = HOST_KEY_FILE) -> str:
    """Urutan: --key, env PERANG_HOST_KEY, berkas data/host.key, lalu buat baru.

    Server tidak pernah berjalan tanpa kunci. Kunci buatan disimpan supaya tetap sama setelah
    restart, sehingga HP operator tidak kehilangan peran host di tengah live.
    """
    key = (cli_key or os.environ.get(HOST_KEY_ENV) or "").strip()
    if not key and path.exists():
        key = path.read_text(encoding="utf-8").strip()
    if not key:
        key = secrets.token_urlsafe(24)
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(key + "\n")
        print(f"Kunci host baru dibuat: {path}")
    if len(key) < MIN_HOST_KEY_LENGTH:
        raise SystemExit(f"Kunci host terlalu pendek: minimal {MIN_HOST_KEY_LENGTH} karakter.")
    return key


def operator_url(base: str, key: str) -> str:
    # Kunci diletakkan di fragmen (#) karena bagian ini tidak ikut terkirim dalam permintaan HTTP.
    return f"{base}/#key={quote(key, safe='')}"


def print_access_info(base: str, key: str) -> None:
    url = operator_url(base, key)
    print("\nTautan OPERATOR, RAHASIA (QR di bawah berisi tautan ini):")
    print(f"  {url}")
    print("Tautan penonton, hanya menonton:")
    print(f"  {base}/")
    print(f"Uji suara: {base}/?sfxtest=1")
    print("Buka tautan operator dan tekan MULAI SEBELUM siaran layar dimulai. Jangan siarkan terminal ini.\n")
    try:
        import qrcode

        code = qrcode.QRCode(border=1)
        code.add_data(url)
        code.make(fit=True)
        code.print_ascii(tty=False, invert=True)
    except Exception as error:  # QR hanya kemudahan; alamat di atas sudah cukup
        print(f"(QR tidak bisa ditampilkan: {error})")
    sys.stdout.flush()


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Perang Warna 7 Wilayah Nusantara")
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--simulate", action="store_true", help="jalankan bot penonton")
    source.add_argument("--username", help="akun TikTok yang sedang live, misal @akunku")
    parser.add_argument("--rate", choices=["low", "normal", "high"], default="normal", help="kepadatan bot simulasi")
    parser.add_argument("--keep-session", action="store_true", help="lanjutkan Win sesi setelah crash")
    parser.add_argument("--reset-all", action="store_true", help="hapus Klasemen Abadi dan Hall of Fame")
    parser.add_argument("--port", type=int, default=None, help="port server (bawaan dari config.json)")
    parser.add_argument("--key", default=None,
                        help=f"kunci host, minimal {MIN_HOST_KEY_LENGTH} karakter. Di VPS lebih aman lewat env {HOST_KEY_ENV}")
    parser.add_argument("--bind", default="0.0.0.0",
                        help="alamat dengar. Pakai 127.0.0.1 di VPS yang memakai reverse proxy HTTPS")
    parser.add_argument("--public-url", default=None, help="alamat publik untuk tautan, misal https://game.domainku.id")
    return parser.parse_args(argv)


def report_task_exit(task: asyncio.Task) -> None:
    """Tugas latar seharusnya hidup selamanya; jika mati, operator harus tahu."""
    if task.cancelled():
        return
    error = task.exception()
    log.error("Tugas latar %s berhenti: %r", task.get_name(), error, exc_info=error)


async def serve(args: argparse.Namespace) -> None:
    with open(ROOT / "config.json", encoding="utf-8") as handle:
        config = json.load(handle)
    host_key = resolve_host_key(args.key)
    wilayah = Wilayah.load(DATA_DIR / "wilayah.json")
    moderator = Moderator.load(DATA_DIR / "blocklist.txt")
    # Simulasi memakai berkas terpisah supaya tidak mengotori Klasemen Abadi asli.
    wins_file = DATA_DIR / ("wins.sim.json" if args.simulate else "wins.json")
    storage = Storage(wins_file, wilayah.codes, keep_session=args.keep_session, reset_all=args.reset_all)

    hub = Hub(config, wilayah, moderator, storage, simulate_mode=args.simulate, rate=args.rate,
              has_tiktok=bool(args.username), host_key=host_key)
    app = build_app(hub)
    runner = web.AppRunner(app, handle_signals=False)
    await runner.setup()
    port = args.port or config["server"]["port"]
    try:
        await web.TCPSite(runner, args.bind, port).start()
    except OSError as error:
        await runner.cleanup()
        raise SystemExit(f"Port {port} tidak bisa dipakai: {error}") from error

    base = (args.public_url or f"http://{lan_ip()}:{port}").rstrip("/")
    print_access_info(base, host_key)
    tasks = [asyncio.create_task(hub.like_loop()), asyncio.create_task(hub.stats_loop())]
    if args.simulate:
        hub.set_sim(True)
    elif args.username:
        # Diimpor di sini agar mode simulasi tetap jalan walau pustaka TikTokLive bermasalah.
        from tiktok_adapter import TikTokAdapter

        tasks.append(asyncio.create_task(TikTokAdapter(args.username, hub).run(), name="tiktok"))
    else:
        print("Tidak ada --username atau --simulate: server menunggu, bot bisa dinyalakan dari tombol darurat.\n")

    for task in tasks:
        task.add_done_callback(report_task_exit)

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for name in ("SIGINT", "SIGTERM"):
        try:
            loop.add_signal_handler(getattr(signal, name), stop.set)
        except (NotImplementedError, AttributeError):
            pass  # Windows: Ctrl+C ditangani lewat KeyboardInterrupt di main()
    try:
        await stop.wait()
    finally:
        hub.set_sim(False)
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await runner.cleanup()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s: %(message)s", datefmt="%H:%M:%S")
    logging.getLogger("aiohttp.access").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    try:
        asyncio.run(serve(parse_args()))
    except KeyboardInterrupt:
        pass
    print("Server berhenti.")


if __name__ == "__main__":
    main()
