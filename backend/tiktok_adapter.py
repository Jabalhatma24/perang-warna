"""SATU-SATUNYA berkas yang menyentuh TikTokLive.

API di bawah diverifikasi dari source TikTokLive 7.0.1. Jika TikTok atau pustakanya
berubah, cukup sesuaikan berkas ini; backend lain hanya melihat metode `sink`:
    on_comment(user, text)
    on_gift(user, gift_id, gift_name, unit_coins, group_id, repeat_count, repeat_end, streakable)
    on_like(user, count)
    on_social(user, reason)        # reason: "follow" | "share"
    on_viewers(count)
    on_source_status(connected, detail)

Signing: pustaka membaca API key dari environment variable SIGN_API_KEY.
"""
from __future__ import annotations

import asyncio
import logging

from TikTokLive import TikTokLiveClient
from TikTokLive.client.errors import SignAPIError, UserNotFoundError, UserOfflineError
from TikTokLive.events import (
    CommentEvent,
    ConnectEvent,
    DisconnectEvent,
    FollowEvent,
    GiftEvent,
    LikeEvent,
    LiveEndEvent,
    RoomUserSeqEvent,
    ShareEvent,
)

log = logging.getLogger("tiktok")

BACKOFF_SECONDS = (5, 10, 20, 60)


def user_from_event(user) -> dict | None:
    """Mengubah objek user TikTokLive menjadi user netral. None jika tidak ada id."""
    if user is None or not getattr(user, "id", 0):
        return None
    follow_info = getattr(user, "follow_info", None)
    return {
        "id": str(user.id),
        "handle": getattr(user, "display_id", "") or "",
        "nick": getattr(user, "nickname", "") or "",
        "isFollower": bool(follow_info is not None and follow_info.follow_status >= 1),
    }


def comment_to_sink(event, sink) -> None:
    user = user_from_event(event.user)
    if user is not None:
        sink.on_comment(user, event.content or "")


def gift_to_sink(event, sink) -> None:
    user = user_from_event(event.user)
    gift = event.gift
    if user is None or gift is None:
        return
    sink.on_gift(
        user,
        gift.id,
        gift.name or "Gift",
        gift.diamond_count,
        event.group_id,
        event.repeat_count,
        bool(event.repeat_end),
        gift.type == 1,  # sama dengan ExtendedGift.streakable di TikTokLive
    )


def like_to_sink(event, sink) -> None:
    user = user_from_event(event.user)
    if user is not None:
        sink.on_like(user, event.count or 1)


def social_to_sink(event, sink, reason: str) -> None:
    user = user_from_event(event.user)
    if user is not None:
        sink.on_social(user, reason)


class TikTokAdapter:
    def __init__(self, username: str, sink):
        self.username = username
        self.sink = sink
        self._connected_once = False

    def _build_client(self) -> TikTokLiveClient:
        client = TikTokLiveClient(unique_id=self.username)
        sink = self.sink

        def guarded(handler):
            async def wrapper(event):
                try:
                    handler(event)
                except Exception:
                    log.exception("Gagal memproses event %s", type(event).__name__)

            return wrapper

        def on_connect(event):
            self._connected_once = True
            sink.on_source_status(True, f"Terhubung ke {self.username}")

        def on_viewers(event):
            if event.total:
                sink.on_viewers(event.total)

        # Sengaja add_listener: di TikTokLive 7.0.1 bentuk client.on(Event, handler) crash
        # dengan AttributeError ('str' object has no attribute 'get_type').
        client.add_listener(ConnectEvent, guarded(on_connect))
        client.add_listener(DisconnectEvent, guarded(lambda e: sink.on_source_status(False, "Koneksi TikTok terputus")))
        client.add_listener(LiveEndEvent, guarded(lambda e: sink.on_source_status(False, "Live berakhir")))
        client.add_listener(CommentEvent, guarded(lambda e: comment_to_sink(e, sink)))
        client.add_listener(GiftEvent, guarded(lambda e: gift_to_sink(e, sink)))
        client.add_listener(LikeEvent, guarded(lambda e: like_to_sink(e, sink)))
        client.add_listener(FollowEvent, guarded(lambda e: social_to_sink(e, sink, "follow")))
        client.add_listener(ShareEvent, guarded(lambda e: social_to_sink(e, sink, "share")))
        client.add_listener(RoomUserSeqEvent, guarded(on_viewers))
        return client

    async def run(self) -> None:
        """Mencoba terhubung selamanya dengan backoff. Berhenti hanya jika dibatalkan."""
        attempt = 0
        while True:
            client = None
            self._connected_once = False
            try:
                self.sink.on_source_status(False, f"Menghubungkan ke {self.username}...")
                client = self._build_client()
                # process_connect_events=False: jangan memutar ulang chat/gift lama saat masuk room.
                task = await client.start(process_connect_events=False)
                await task
                detail = "Koneksi TikTok berakhir"
            except asyncio.CancelledError:
                raise
            except UserOfflineError:
                detail = "Live belum dimulai"
            except UserNotFoundError:
                detail = "Akun tidak ditemukan atau belum bisa live"
            except SignAPIError as error:
                log.warning("Layanan signing menolak: %s", error)
                detail = "Layanan signing menolak, cek SIGN_API_KEY"
            except Exception as error:  # pustaka tidak resmi: kegagalan apa pun tidak boleh mematikan server
                log.warning("Koneksi TikTok gagal: %s", error)
                detail = f"Gagal terhubung: {type(error).__name__}"
            finally:
                if client is not None:
                    # Jangan pakai client.close() atau close_client=True: keduanya memanggil
                    # _clean_tasks() yang dirancang membatalkan SEMUA task di event loop.
                    try:
                        await client.disconnect()
                        await client.web.close()
                    except Exception as error:
                        log.debug("Gagal menutup client TikTok: %s", error)

            if self._connected_once:
                attempt = 0
            delay = BACKOFF_SECONDS[min(attempt, len(BACKOFF_SECONDS) - 1)]
            attempt += 1
            self.sink.on_source_status(False, f"{detail}. Coba lagi dalam {delay} detik")
            await asyncio.sleep(delay)
