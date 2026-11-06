"""Uji kunci host lewat koneksi sungguhan: penonton tanpa kunci tidak boleh mengganggu ronde yang live."""
import asyncio
import copy
import json
import os
import stat
from pathlib import Path

import pytest
from aiohttp import WSMsgType
from aiohttp.test_utils import TestClient, TestServer

import server
from server import Hub, build_app, operator_url, parse_args, resolve_host_key
from storage import Storage
from test_server import CONFIG, assert_silent, read_until, result, send

ROOT = Path(__file__).resolve().parent.parent
KEY = "kunci-rahasia-untuk-tes-123"
USER = {"id": "7", "handle": "sari", "nick": "Sari", "isFollower": True}


def run(scenario, tmp_path, wilayah, moderator, config=CONFIG):
    async def runner():
        storage = Storage(tmp_path / "wins.json", wilayah.codes)
        hub = Hub(config, wilayah, moderator, storage, host_key=KEY)
        client = TestClient(TestServer(build_app(hub)))
        await client.start_server()
        try:
            await scenario(hub, client)
        finally:
            hub.set_sim(False)
            await client.close()

    asyncio.run(runner())


async def hello(client, **data):
    ws = await client.ws_connect("/ws")
    await send(ws, "HELLO", data)
    return ws


async def real_host(client):
    ws = await hello(client, role="host", key=KEY)
    assert (await read_until(ws, "HOST_INFO"))["data"]["active"] is True
    return ws


@pytest.mark.parametrize("data", [
    {"role": "host"},
    {"role": "host", "key": ""},
    {"role": "host", "key": "kunci-salah-yang-cukup-panjang"},
    {"role": "host", "key": KEY[:-1]},
    {"role": "host", "key": None},
    {"role": "host", "key": 12345},
    {"role": "host", "key": [KEY]},
    {"role": "host", "key": "kunci-dengan-unicode-é"},
])
def test_wrong_or_missing_key_is_denied_and_locked_to_view(tmp_path, wilayah, moderator, data):
    async def scenario(hub, client):
        ws = await hello(client, **data)
        await read_until(ws, "HOST_DENIED")
        await read_until(ws, "SCOREBOARD")
        assert hub.active_host is None
        assert [c.role for c in hub.clients] == ["view"]

    run(scenario, tmp_path, wilayah, moderator)


def test_correct_key_becomes_host(tmp_path, wilayah, moderator):
    async def scenario(hub, client):
        ws = await real_host(client)
        await send(ws, "ROUND_RESULT", result("r1"))
        board = await read_until(ws, "SCOREBOARD")
        assert board["data"]["session"]["JAWA"] == 1

    run(scenario, tmp_path, wilayah, moderator)


def test_stranger_cannot_disturb_live_host(tmp_path, wilayah, moderator):
    async def scenario(hub, client):
        host = await real_host(client)
        host_record = hub.active_host
        await send(host, "STATE_SNAPSHOT", {"phase": "BATTLE"})

        stranger = await hello(client, role="host", key="tebakan-ngawur-panjang-sekali")
        await read_until(stranger, "HOST_DENIED")
        await send(stranger, "ROUND_RESULT", result("palsu"))
        await send(stranger, "SIM_TOGGLE", {"on": True})
        await send(stranger, "STATE_SNAPSHOT", {"phase": "CROWN"})
        await send(stranger, "HELLO", {"role": "host", "key": KEY})  # kunci benar di koneksi yang sudah ditolak
        await asyncio.sleep(0.1)

        assert hub.active_host is host_record
        assert hub.storage.state["session"]["JAWA"] == 0
        assert "palsu" not in hub.storage.state["roundIds"]
        assert not hub.sim_active
        assert json.loads(hub.last_snapshot)["data"]["phase"] == "BATTLE"

        # Host asli tidak pernah diberi tahu bahwa ia digantikan.
        while True:
            try:
                message = await asyncio.wait_for(host.receive_json(), 0.15)
            except asyncio.TimeoutError:
                break
            if message["type"] == "HOST_INFO":
                assert message["data"]["active"] is True

    run(scenario, tmp_path, wilayah, moderator)


def test_view_without_key_gets_no_raw_audience_events(tmp_path, wilayah, moderator):
    async def scenario(hub, client):
        host = await real_host(client)
        viewer = await hello(client, role="view")
        await read_until(viewer, "SCOREBOARD")

        hub.on_comment(USER, "4")
        await read_until(host, "CHAT_ACTION")
        hub.on_gift(USER, 1, "Mawar", 1, 9, 1, True, True)
        await read_until(host, "GIFT_TRIGGER")
        hub.on_social(USER, "share")
        await read_until(host, "CAPTAIN")
        for msg_type in ("CHAT_ACTION", "GIFT_TRIGGER", "CAPTAIN"):
            await assert_silent(viewer, msg_type, 0.05)

    run(scenario, tmp_path, wilayah, moderator)


def test_connection_without_hello_receives_nothing(tmp_path, wilayah, moderator):
    async def scenario(hub, client):
        await real_host(client)
        silent = await client.ws_connect("/ws")
        await asyncio.sleep(0.05)
        hub.on_viewers(10)
        hub.broadcast("STATUS", hub.status())
        with pytest.raises(asyncio.TimeoutError):
            await asyncio.wait_for(silent.receive_json(), 0.15)

    run(scenario, tmp_path, wilayah, moderator)


def test_viewer_cap_closes_extras_but_host_still_gets_in(tmp_path, wilayah, moderator):
    config = copy.deepcopy(CONFIG)
    config["server"]["maxViewers"] = 2

    async def scenario(hub, client):
        first = await hello(client, role="view")
        await read_until(first, "SCOREBOARD")
        second = await hello(client, role="view")
        await read_until(second, "SCOREBOARD")

        extra = await hello(client, role="view")
        await read_until(extra, "VIEW_FULL")
        closing = await asyncio.wait_for(extra.receive(), 2)
        assert closing.type in (WSMsgType.CLOSE, WSMsgType.CLOSING, WSMsgType.CLOSED)
        assert extra.close_code == server.CLOSE_VIEWERS_FULL

        wrong_key = await hello(client, role="host", key="salah-salah-salah-salah")
        await read_until(wrong_key, "VIEW_FULL")

        await real_host(client)
        assert hub.view_count() == 2

    run(scenario, tmp_path, wilayah, moderator, config)


def test_max_viewers_zero_disables_spectators(tmp_path, wilayah, moderator):
    config = copy.deepcopy(CONFIG)
    config["server"]["maxViewers"] = 0

    async def scenario(hub, client):
        viewer = await hello(client, role="view")
        await read_until(viewer, "VIEW_FULL")
        await real_host(client)

    run(scenario, tmp_path, wilayah, moderator, config)


def test_operator_on_second_device_replaces_host_and_old_screen_keeps_updating(tmp_path, wilayah, moderator):
    async def scenario(hub, client):
        old = await real_host(client)
        new = await hello(client, role="host", key=KEY)
        assert (await read_until(new, "HOST_INFO"))["data"]["active"] is True
        assert (await read_until(old, "HOST_INFO"))["data"]["active"] is False

        await send(new, "STATE_SNAPSHOT", {"phase": "OVERTIME"})
        snapshot = await read_until(old, "STATE_SNAPSHOT")
        assert snapshot["data"]["phase"] == "OVERTIME"

        await send(old, "ROUND_RESULT", result("lama"))
        await asyncio.sleep(0.05)
        assert "lama" not in hub.storage.state["roundIds"]

    run(scenario, tmp_path, wilayah, moderator)


def test_key_never_leaks_over_http_or_websocket(tmp_path, wilayah, moderator):
    async def scenario(hub, client):
        viewer = await hello(client, role="view")
        status = await read_until(viewer, "STATUS")
        board = await read_until(viewer, "SCOREBOARD")
        for payload in (status, board):
            assert KEY not in json.dumps(payload)
        for path in ("/", "/config.json", "/wilayah.json", "/manifest.json", "/js/game.js", "/js/net.js"):
            response = await client.get(path)
            assert response.status == 200, path
            assert KEY not in await response.text(), path

    run(scenario, tmp_path, wilayah, moderator)


def test_secret_files_are_not_served(tmp_path, wilayah, moderator):
    async def scenario(hub, client):
        for path in ("/data/host.key", "/host.key", "/%2e%2e/data/host.key", "/..%2fdata%2fhost.key"):
            assert (await client.get(path)).status in (403, 404), path

    run(scenario, tmp_path, wilayah, moderator)


def test_cli_flag_beats_env_and_file(tmp_path, monkeypatch):
    path = tmp_path / "host.key"
    path.write_text("kunci-dari-berkas-panjang\n", encoding="utf-8")
    monkeypatch.setenv(server.HOST_KEY_ENV, "kunci-dari-env-yang-panjang")
    assert resolve_host_key("kunci-dari-cli-yang-panjang", path) == "kunci-dari-cli-yang-panjang"
    assert resolve_host_key(None, path) == "kunci-dari-env-yang-panjang"
    monkeypatch.delenv(server.HOST_KEY_ENV)
    assert resolve_host_key(None, path) == "kunci-dari-berkas-panjang"


def test_key_is_generated_once_and_survives_restart(tmp_path, monkeypatch):
    monkeypatch.delenv(server.HOST_KEY_ENV, raising=False)
    path = tmp_path / "host.key"
    first = resolve_host_key(None, path)
    assert len(first) >= server.MIN_HOST_KEY_LENGTH
    assert resolve_host_key(None, path) == first
    if os.name == "posix":
        assert stat.S_IMODE(path.stat().st_mode) == 0o600


@pytest.mark.parametrize("weak", ["pendek", "123456789012345"])
def test_short_key_refuses_to_start(tmp_path, monkeypatch, weak):
    monkeypatch.delenv(server.HOST_KEY_ENV, raising=False)
    with pytest.raises(SystemExit):
        resolve_host_key(weak, tmp_path / "host.key")
    assert not (tmp_path / "host.key").exists()


def test_operator_url_keeps_key_out_of_the_http_request():
    url = operator_url("http://192.168.1.2:8080", "a+b/c=d")
    assert url == "http://192.168.1.2:8080/#key=a%2Bb%2Fc%3Dd"


def test_cli_defaults():
    args = parse_args([])
    assert args.bind == "0.0.0.0" and args.key is None and args.public_url is None
    assert parse_args(["--bind", "127.0.0.1"]).bind == "127.0.0.1"


def test_host_key_file_is_ignored_by_git():
    ignored = (ROOT / ".gitignore").read_text(encoding="utf-8").splitlines()
    assert "data/host.key" in ignored


def test_pwa_manifest_is_valid_and_its_icons_exist():
    manifest = json.loads((ROOT / "public" / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["display"] == "standalone"
    assert manifest["start_url"] == "/" and manifest["scope"] == "/"
    assert "key" not in manifest["start_url"]
    sizes = {icon["sizes"] for icon in manifest["icons"]}
    assert {"192x192", "512x512"} <= sizes
    for icon in manifest["icons"]:
        assert (ROOT / "public" / icon["src"]).stat().st_size > 0


def test_pc_window_command_has_no_address_bar_and_keeps_rendering_when_covered():
    command = server.pc_window_command(8080, "kunci+rahasia")
    assert "--app=" in command and "localhost:8080/#key=kunci%2Brahasia" in command
    assert "--window-size=608,1080" in command
    assert "--user-data-dir=" in command
    for flag in ("CalculateNativeWinOcclusion", "--disable-backgrounding-occluded-windows",
                 "--disable-renderer-backgrounding", "--disable-background-timer-throttling"):
        assert flag in command
