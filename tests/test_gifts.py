import pytest

from gifts import GiftTracker, tier_of

TIERS = {"MICRO": 1, "MID": 10, "SULTAN": 100, "MEGA": 1000}


def send(tracker, count, end=False, group=1, now=0.0, unit=1, streakable=True, user="u1"):
    return tracker.process(
        user_id=user, gift_id=5655, gift_name="Mawar", unit_coins=unit, group_id=group,
        repeat_count=count, repeat_end=end, streakable=streakable, team="JAWA", now=now,
    )


@pytest.mark.parametrize(
    "coins, tier",
    [(1, "MICRO"), (9, "MICRO"), (10, "MID"), (99, "MID"), (100, "SULTAN"), (999, "SULTAN"), (1000, "MEGA"), (29999, "MEGA")],
)
def test_tier_boundaries(coins, tier):
    assert tier_of(coins, TIERS) == tier


def test_streak_rose_1_5_12_gives_deltas_1_4_7():
    tracker = GiftTracker(TIERS)
    assert [send(tracker, n)["delta"] for n in (1, 5, 12)] == [1, 4, 7]


def test_end_event_is_not_counted_twice():
    tracker = GiftTracker(TIERS)
    send(tracker, 1)
    send(tracker, 12)
    final = send(tracker, 12, end=True)
    assert final["delta"] == 0
    assert final["coins"] == 0
    assert final["streakEnded"] is True
    assert final["streakTotal"] == 12


def test_duplicate_end_event_is_dropped():
    tracker = GiftTracker(TIERS)
    send(tracker, 5, end=True)
    assert send(tracker, 5, end=True) is None


def test_end_event_with_extra_units_counts_only_the_difference():
    tracker = GiftTracker(TIERS)
    send(tracker, 5)
    assert send(tracker, 8, end=True)["delta"] == 3


def test_repeated_midstream_event_is_dropped():
    tracker = GiftTracker(TIERS)
    send(tracker, 5)
    assert send(tracker, 5) is None
    assert send(tracker, 3) is None


def test_new_streak_on_reused_group_starts_fresh():
    tracker = GiftTracker(TIERS)
    send(tracker, 5, end=True)
    assert send(tracker, 2)["delta"] == 2


def test_separate_groups_and_users_do_not_mix():
    tracker = GiftTracker(TIERS)
    send(tracker, 5, group=1)
    assert send(tracker, 3, group=2)["delta"] == 3
    assert send(tracker, 4, group=1, user="u2")["delta"] == 4


def test_non_streakable_counts_every_event():
    tracker = GiftTracker(TIERS)
    first = send(tracker, 1, unit=100, streakable=False)
    second = send(tracker, 1, unit=100, streakable=False)
    assert (first["delta"], second["delta"]) == (1, 1)
    assert first["coins"] == 100
    assert first["streakEnded"] is True
    assert first["tier"] == "SULTAN"


def test_coins_use_delta_times_unit():
    tracker = GiftTracker(TIERS)
    send(tracker, 2, unit=30)
    assert send(tracker, 5, unit=30)["coins"] == 90


def test_idle_streak_entries_are_cleared():
    tracker = GiftTracker(TIERS, idle_seconds=60)
    send(tracker, 5, now=0.0)
    assert tracker.active_count == 1
    send(tracker, 1, group=2, now=61.0)
    assert tracker.active_count == 1
