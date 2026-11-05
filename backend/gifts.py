"""Tier gift dan perhitungan delta streak."""
from __future__ import annotations

from dataclasses import dataclass


def tier_of(unit_coins: int, tiers: dict[str, int]) -> str:
    """Tier dari koin per unit. Ambang `tiers` berisi batas bawah tiap tier."""
    if unit_coins >= tiers["MEGA"]:
        return "MEGA"
    if unit_coins >= tiers["SULTAN"]:
        return "SULTAN"
    if unit_coins >= tiers["MID"]:
        return "MID"
    return "MICRO"


@dataclass
class _Streak:
    last_total: int
    last_seen: float
    ended: bool = False


class GiftTracker:
    """Mengubah jumlah kumulatif streak dari TikTok menjadi selisih per event."""

    def __init__(self, tiers: dict[str, int], idle_seconds: float = 60.0):
        self.tiers = tiers
        self.idle_seconds = idle_seconds
        self._streaks: dict[str, _Streak] = {}

    def process(
        self,
        *,
        user_id: str,
        gift_id: int | str,
        gift_name: str,
        unit_coins: int,
        group_id: int | str,
        repeat_count: int,
        repeat_end: bool,
        streakable: bool,
        team: str | None,
        now: float,
    ) -> dict | None:
        """Mengembalikan data GIFT_TRIGGER, atau None jika event ini duplikat."""
        self.cleanup(now)
        total = max(0, int(repeat_count))
        streak_id = f"{user_id}:{gift_id}:{group_id}"

        if not streakable:
            # Gift non-streak hanya dikirim sekali dan group_id bisa berulang,
            # jadi setiap event dihitung penuh.
            delta = max(1, total)
            return self._payload(gift_id, gift_name, unit_coins, delta, delta, streak_id, True, team)

        entry = self._streaks.get(streak_id)
        if entry is not None and entry.ended:
            if repeat_end and total <= entry.last_total:
                entry.last_seen = now
                return None  # event akhir yang terkirim dua kali
            if total <= entry.last_total:
                entry = None  # grup yang sama dipakai streak baru

        previous = entry.last_total if entry is not None else 0
        delta = max(0, total - previous)

        if entry is None:
            entry = _Streak(last_total=total, last_seen=now, ended=repeat_end)
            self._streaks[streak_id] = entry
        else:
            entry.last_total = max(previous, total)
            entry.last_seen = now
            entry.ended = entry.ended or repeat_end

        if delta == 0 and not repeat_end:
            return None
        return self._payload(
            gift_id, gift_name, unit_coins, delta, entry.last_total, streak_id, repeat_end, team
        )

    def _payload(self, gift_id, gift_name, unit_coins, delta, total, streak_id, ended, team) -> dict:
        return {
            "giftId": gift_id,
            "giftName": gift_name,
            "unitCoins": unit_coins,
            "delta": delta,
            "coins": delta * unit_coins,
            "streakTotal": total,
            "streakId": streak_id,
            "streakEnded": ended,
            "tier": tier_of(unit_coins, self.tiers),
            "team": team,
        }

    def cleanup(self, now: float) -> None:
        stale = [key for key, s in self._streaks.items() if now - s.last_seen > self.idle_seconds]
        for key in stale:
            del self._streaks[key]

    @property
    def active_count(self) -> int:
        return len(self._streaks)
