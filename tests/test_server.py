"""Uji hub WebSocket lewat koneksi sungguhan ke aiohttp test server."""
import asyncio
import json
from pathlib import Path

from aiohttp.test_utils import TestClient, TestServer

from server import Hub, build_app
from storage import Storage

ROOT = Path(__file__).resolve().parent.parent
CONFIG = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))


def run(scenario, tmp_path, wilayah, moderator, **hub_kwargs):
    async def runner():
        storage = Storage(tmp_path / "wins.json", wilayah.codes)
        hub = Hub(CONFIG, wilayah, moderator, storage, **hub_kwargs)
        client = TestClient(TestServer(build_app(hub)))
        await client.start_server()
        try:
            await scenario(hub, client)
        finally:
            hub.set_sim(False)
            await client.close()

    asyncio.run(runner())


async def connect(client, role):
    ws = await client.ws_connect("/ws")
    await send(ws, "HELLO", {"role": role})
    return ws


async def send(ws, msg_type, data):
    await ws.send_str(json.dumps({"v": 1, "type": msg_type, "data": data}))


async def read_until(ws, msg_type, timeout=2.0):
    while True:
        message = await asyncio.wait_for(ws.receive_json(), timeout)
        if message["type"] == msg_type:
            return message


async def assert_silent(ws, msg_type, duration=0.15):
    try:
        while True:
            message = await asyncio.wait_for(ws.receive_json(), duration)
            assert message["type"] != msg_type, message
    except asyncio.TimeoutError:
        pass


def result(round_id, winner="JAWA"):
    return {"roundId": round_id, "round": 1, "winner": winner, "territory": {}, "mvp": None}


def test_hello_gets_status_and_scoreboard(tmp_path, wilayah, moderator):
    async def scenario(hub, client):
        ws = await connect(client, "host")
        status = await read_until(ws, "STATUS")
        assert status["v"] == 1
        assert status["data"]["source"] == "tiktok"
        board = await read_until(ws, "SCOREBOARD")
        assert set(board["data"]["session"]) == set(wilayah.codes)

    run(scenario, tmp_path, wilayah, moderator)


def test_round_result_only_from_host_and_deduplicated(tmp_path, wilayah, moderator):
    async def scenario(hub, client):
        viewer = await connect(client, "view")
        await read_until(viewer, "SCOREBOARD")
        await send(viewer, "ROUND_RESULT", result("v1"))
        host = await connect(client, "host")
        await read_until(host, "SCOREBOARD")
        await asyncio.sleep(0.05)
        assert hub.storage.state["session"]["JAWA"] == 0

        await send(host, "ROUND_RESULT", result("r1"))
        board = await read_until(host, "SCOREBOARD")
        assert board["data"]["session"]["JAWA"] == 1
        assert "r1" in board["data"]["recentRoundIds"]

        await send(host, "ROUND_RESULT", result("r1"))
        await read_until(host, "SCOREBOARD")
        assert hub.storage.state["session"]["JAWA"] == 1

    run(scenario, tmp_path, wilayah, moderator)


def test_newest_host_replaces_old_one(tmp_path, wilayah, moderator):
    async def scenario(hub, client):
        first = await connect(client, "host")
        assert (await read_until(first, "HOST_INFO"))["data"]["active"] is True
        second = await connect(client, "host")
        await read_until(second, "HOST_INFO")
        assert (await read_until(first, "HOST_INFO"))["data"]["active"] is False

        await send(first, "ROUND_RESULT", result("old"))
        await asyncio.sleep(0.05)
        assert hub.storage.state["session"]["JAWA"] == 0

        await send(second, "ROUND_RESULT", result("new"))
        await read_until(second, "SCOREBOARD")
        assert hub.storage.state["session"]["JAWA"] == 1

    run(scenario, tmp_path, wilayah, moderator)


def test_unknown_winner_is_rejected(tmp_path, wilayah, moderator):
    async def scenario(hub, client):
        host = await connect(client, "host")
        await read_until(host, "SCOREBOARD")
        await send(host, "ROUND_RESULT", result("r1", winner="ATLANTIS"))
        await asyncio.sleep(0.05)
        assert "r1" not in hub.storage.state["roundIds"]

    run(scenario, tmp_path, wilayah, moderator)


def test_chat_flow_and_comment_text_never_leaves_backend(tmp_path, wilayah, moderator):
    async def scenario(hub, client):
        host = await connect(client, "host")
        await read_until(host, "SCOREBOARD")
        user = {"id": "42", "handle": "budi", "nick": "anj1ng", "isFollower": False}

        hub.on_comment(user, "rahasia tanpa kubu")
        await assert_silent(host, "CHAT_ACTION")

        hub.on_comment(user, "balikpapan")
        join = await read_until(host, "CHAT_ACTION")
        assert join["data"] == {"action": "TEAM_JOIN", "team": "KALIMANTAN", "province": "Kalimantan Timur"}
        assert join["user"]["nick"].startswith("Penonton")

        hub.on_comment(user, "komentar rahasia")
        dash = await read_until(host, "CHAT_ACTION")
        assert dash["data"]["action"] == "DASH"
        assert "rahasia" not in json.dumps(dash)

    run(scenario, tmp_path, wilayah, moderator)


def test_gift_like_and_captain_events(tmp_path, wilayah, moderator):
    async def scenario(hub, client):
        like_task = asyncio.create_task(hub.like_loop())
        host = await connect(client, "host")
        await read_until(host, "SCOREBOARD")
        user = {"id": "7", "handle": "sari", "nick": "Sari", "isFollower": True}

        hub.on_gift(user, 1, "Mawar", 1, 9, 1, False, True)
        gift = await read_until(host, "GIFT_TRIGGER")
        assert gift["data"]["team"] is None
        assert gift["data"]["delta"] == 1

        hub.on_social(user, "follow")
        await assert_silent(host, "CAPTAIN")
        hub.on_like(user, 5)

        hub.on_comment(user, "4")
        await read_until(host, "CHAT_ACTION")
        hub.on_social(user, "share")
        captain = await read_until(host, "CAPTAIN")
        assert captain["data"] == {"reason": "share", "team": "SUMATERA"}

        hub.on_like(user, 5)
        hub.on_like(user, 7)
        likes = await read_until(host, "LIKE_BATCH")
        assert likes["data"]["likes"] == {"SUMATERA": 12}
        like_task.cancel()

    run(scenario, tmp_path, wilayah, moderator)


def test_mega_gift_goes_to_prasasti(tmp_path, wilayah, moderator):
    async def scenario(hub, client):
        host = await connect(client, "host")
        await read_until(host, "SCOREBOARD")
        hub.on_gift({"id": "9", "handle": "s", "nick": "Sultan", "isFollower": False}, 2, "Paus", 1000, 1, 1, True, False)
        await read_until(host, "GIFT_TRIGGER")
        board = await read_until(host, "SCOREBOARD")
        assert board["data"]["prasasti"] == ["Sultan"]

    run(scenario, tmp_path, wilayah, moderator)


def test_emergency_simulation_stays_out_of_all_time(tmp_path, wilayah, moderator):
    async def scenario(hub, client):
        host = await connect(client, "host")
        await read_until(host, "SCOREBOARD")
        viewer = await connect(client, "view")
        await read_until(viewer, "SCOREBOARD")

        await send(viewer, "SIM_TOGGLE", {"on": True})
        await asyncio.sleep(0.05)
        assert not hub.sim_active

        await send(host, "SIM_TOGGLE", {"on": True})
        status = await read_until(host, "STATUS")
        assert status["data"]["simActive"] is True

        await send(host, "ROUND_RESULT", result("during-sim"))
        await read_until(host, "SCOREBOARD")
        assert hub.storage.state["session"]["JAWA"] == 1
        assert hub.storage.state["allTime"]["JAWA"] == 0

        await send(host, "SIM_TOGGLE", {"on": False})
        await asyncio.sleep(0.05)
        await send(host, "ROUND_RESULT", result("after-sim-mixed"))
        await asyncio.sleep(0.05)
        assert hub.storage.state["allTime"]["JAWA"] == 0, "ronde saat bot baru dimatikan masih tercampur"

        await send(host, "ROUND_RESULT", result("clean"))
        await asyncio.sleep(0.05)
        assert hub.storage.state["allTime"]["JAWA"] == 1

        await send(host, "ROUND_RESULT", {**result("local-bot"), "simulated": True})
        await asyncio.sleep(0.05)
        assert hub.storage.state["allTime"]["JAWA"] == 1

    run(scenario, tmp_path, wilayah, moderator, has_tiktok=True)


def test_snapshot_reaches_view_clients_only(tmp_path, wilayah, moderator):
    async def scenario(hub, client):
        host = await connect(client, "host")
        await read_until(host, "SCOREBOARD")
        viewer = await connect(client, "view")
        await read_until(viewer, "SCOREBOARD")
        info = await read_until(host, "HOST_INFO")
        while info["data"]["viewClients"] != 1:
            info = await read_until(host, "HOST_INFO")

        await send(host, "STATE_SNAPSHOT", {"phase": "BATTLE"})
        snapshot = await read_until(viewer, "STATE_SNAPSHOT")
        assert snapshot["data"]["phase"] == "BATTLE"
        await assert_silent(host, "STATE_SNAPSHOT")

        late = await connect(client, "view")
        cached = await read_until(late, "STATE_SNAPSHOT")
        assert cached["data"]["phase"] == "BATTLE"

    run(scenario, tmp_path, wilayah, moderator)


def test_malformed_messages_are_ignored(tmp_path, wilayah, moderator):
    async def scenario(hub, client):
        host = await connect(client, "host")
        await read_until(host, "SCOREBOARD")
        await host.send_str("{bukan json")
        await host.send_str(json.dumps({"tanpa": "type"}))
        await host.send_str(json.dumps({"type": "HELLO", "data": [1, 2]}))
        await send(host, "ROUND_RESULT", result("ok"))
        board = await read_until(host, "SCOREBOARD")
        assert board["data"]["session"]["JAWA"] == 1

    run(scenario, tmp_path, wilayah, moderator)


def test_http_routes(tmp_path, wilayah, moderator):
    async def scenario(hub, client):
        config = await client.get("/config.json")
        assert (await config.json())["grid"]["cols"] == 96
        data = await client.get("/wilayah.json")
        assert len(json.loads(await data.text())["provinces"]) == 38
        index = await client.get("/")
        assert index.status == 200
        traversal = await client.get("/../config.json")
        assert traversal.status in (200, 403, 404)
        secret = await client.get("/%2e%2e/backend/server.py")
        assert secret.status in (403, 404)

    run(scenario, tmp_path, wilayah, moderator)


def test_every_rate_produces_every_gift_tier(wilayah):
    """Di tiap kepadatan bot, MID/SULTAN/MEGA harus benar-benar muncul, bukan hanya MICRO."""
    import random

    from gifts import tier_of
    from simulator import RATES, Simulator

    class Sink:
        def __init__(self):
            self.tiers = set()
            self.gifts = 0

        def on_comment(self, user, text):
            pass

        def on_like(self, user, count):
            pass

        def on_social(self, user, reason):
            pass

        def on_viewers(self, count):
            pass

        def on_gift(self, user, gift_id, name, coins, group, count, end, streakable):
            self.gifts += 1
            self.tiers.add(tier_of(coins, CONFIG["gift"]["tiers"]))

    for rate in RATES:
        sink = Sink()
        simulator = Simulator(wilayah, sink, rate, random.Random(7))
        for tick in range(60000):
            simulator.step(0.0)
            simulator.advance_streaks(tick * 10.0)
        assert sink.tiers == {"MICRO", "MID", "SULTAN", "MEGA"}, rate
