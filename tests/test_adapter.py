"""Memastikan nama atribut di tiktok_adapter cocok dengan event asli TikTokLive.

Event dibuat dari bytes protobuf lewat `.parse()`, jalur yang sama dengan koneksi nyata.
Tes ini tidak terhubung ke TikTok.
"""
import asyncio

from TikTokLive.client.errors import UserOfflineError
from TikTokLive.events import CommentEvent, FollowEvent, GiftEvent, LikeEvent, RoomUserSeqEvent, ShareEvent
from TikTokLive.proto.custom_proto import ExtendedUser
from TikTokLiveProto.v3.webcast.model import Gift
from TikTokLiveProto.v3.webcast.model.base.user import FollowInfo

import tiktok_adapter
from tiktok_adapter import TikTokAdapter, comment_to_sink, gift_to_sink, like_to_sink, social_to_sink


class FakeSink:
    def __init__(self):
        self.calls = []
        self.statuses = []

    def on_comment(self, *args):
        self.calls.append(("comment", *args))

    def on_gift(self, *args):
        self.calls.append(("gift", *args))

    def on_like(self, *args):
        self.calls.append(("like", *args))

    def on_social(self, *args):
        self.calls.append(("social", *args))

    def on_viewers(self, *args):
        self.calls.append(("viewers", *args))

    def on_source_status(self, connected, detail):
        self.statuses.append((connected, detail))


def make_user():
    return ExtendedUser(id=123, nickname="Budi", display_id="budi_id", follow_info=FollowInfo(follow_status=1))


def reparse(event_class, event):
    return event_class().parse(bytes(event))


def test_comment_event_round_trip():
    sink = FakeSink()
    comment_to_sink(reparse(CommentEvent, CommentEvent(content="jawa", user=make_user())), sink)
    assert sink.calls == [("comment", {"id": "123", "handle": "budi_id", "nick": "Budi", "isFollower": True}, "jawa")]


def test_gift_event_round_trip():
    sink = FakeSink()
    event = GiftEvent(
        user=make_user(), gift=Gift(id=5655, name="Rose", diamond_count=1, type=1),
        repeat_count=5, repeat_end=1, group_id=77,
    )
    gift_to_sink(reparse(GiftEvent, event), sink)
    name, user, gift_id, gift_name, coins, group, count, end, streakable = sink.calls[0]
    assert (name, user["id"], gift_id, gift_name, coins, group, count, end, streakable) == (
        "gift", "123", 5655, "Rose", 1, 77, 5, True, True
    )


def test_non_streakable_gift_flag():
    sink = FakeSink()
    event = GiftEvent(user=make_user(), gift=Gift(id=1, name="Paus", diamond_count=1000, type=2), repeat_count=1)
    gift_to_sink(reparse(GiftEvent, event), sink)
    assert sink.calls[0][-1] is False


def test_like_and_social_events():
    sink = FakeSink()
    like_to_sink(reparse(LikeEvent, LikeEvent(user=make_user(), count=15)), sink)
    social_to_sink(reparse(FollowEvent, FollowEvent(user=make_user())), sink, "follow")
    social_to_sink(reparse(ShareEvent, ShareEvent(user=make_user())), sink, "share")
    assert [call[0] for call in sink.calls] == ["like", "social", "social"]
    assert sink.calls[0][2] == 15
    assert [call[2] for call in sink.calls[1:]] == ["follow", "share"]


def test_event_without_user_is_ignored():
    sink = FakeSink()
    comment_to_sink(CommentEvent(content="halo"), sink)
    gift_to_sink(GiftEvent(repeat_count=1), sink)
    assert sink.calls == []


def test_viewer_count_attribute_exists():
    assert reparse(RoomUserSeqEvent, RoomUserSeqEvent(total=87)).total == 87


def test_offline_user_keeps_retrying_with_backoff(monkeypatch):
    delays = []

    class OfflineClient:
        def __init__(self, unique_id):
            pass

        def add_listener(self, event, handler):
            pass

        async def start(self, **kwargs):
            raise UserOfflineError()

        async def disconnect(self):
            pass

        @property
        def web(self):
            return self

        async def close(self):
            pass

    async def fake_sleep(seconds):
        delays.append(seconds)
        if len(delays) == 5:
            raise asyncio.CancelledError()

    monkeypatch.setattr(tiktok_adapter, "TikTokLiveClient", OfflineClient)
    monkeypatch.setattr(tiktok_adapter.asyncio, "sleep", fake_sleep)
    sink = FakeSink()

    async def scenario():
        try:
            await TikTokAdapter("@akun", sink).run()
        except asyncio.CancelledError:
            pass

    asyncio.run(scenario())
    assert delays == [5, 10, 20, 60, 60]
    assert any("Live belum dimulai" in detail for _, detail in sink.statuses)
    assert all(connected is False for connected, _ in sink.statuses)


def test_real_client_accepts_all_listeners_and_delivers_events():
    """Memakai TikTokLiveClient asli tanpa jaringan: handler harus benar-benar terdaftar dan terpanggil."""
    sink = FakeSink()

    async def scenario():
        client = TikTokAdapter("@akun", sink)._build_client()
        client.emit(CommentEvent.get_type(), reparse(CommentEvent, CommentEvent(content="jawa", user=make_user())))
        client.emit(RoomUserSeqEvent.get_type(), reparse(RoomUserSeqEvent, RoomUserSeqEvent(total=87)))
        client.emit(FollowEvent.get_type(), reparse(FollowEvent, FollowEvent(user=make_user())))
        await asyncio.sleep(0.05)
        await client.web.close()

    asyncio.run(scenario())
    assert [call[0] for call in sink.calls] == ["comment", "viewers", "social"]
    assert sink.calls[1][1] == 87


def test_handler_error_does_not_escape():
    class BrokenSink(FakeSink):
        def on_comment(self, *args):
            raise RuntimeError("rusak")

    sink = BrokenSink()

    async def scenario():
        client = TikTokAdapter("@akun", sink)._build_client()
        client.emit(CommentEvent.get_type(), reparse(CommentEvent, CommentEvent(content="jawa", user=make_user())))
        await asyncio.sleep(0.05)
        await client.web.close()

    asyncio.run(scenario())


def test_client_construction_failure_is_retried(monkeypatch):
    delays = []

    def explode(unique_id):
        raise RuntimeError("pustaka berubah")

    async def fake_sleep(seconds):
        delays.append(seconds)
        if len(delays) == 2:
            raise asyncio.CancelledError()

    monkeypatch.setattr(tiktok_adapter, "TikTokLiveClient", explode)
    monkeypatch.setattr(tiktok_adapter.asyncio, "sleep", fake_sleep)
    sink = FakeSink()

    async def scenario():
        try:
            await TikTokAdapter("@akun", sink).run()
        except asyncio.CancelledError:
            pass

    asyncio.run(scenario())
    assert delays == [5, 10]
    assert any("RuntimeError" in detail for _, detail in sink.statuses)
