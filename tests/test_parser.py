import json
from pathlib import Path

import pytest

from parser import ChatProcessor, is_rally, normalize

ROOT = Path(__file__).resolve().parent.parent


@pytest.mark.parametrize(
    "text, team, province",
    [
        ("3", "KALIMANTAN", None),
        ("balikpapan", "KALIMANTAN", "Kalimantan Timur"),
        ("BALI!!", "BALI_NUSRA", "Bali"),
        ("papua barat daya", "PAPUA", "Papua Barat Daya"),
        ("kepri", "SUMATERA", "Kepulauan Riau"),
        ("jawaaaa 🔥", "JAWA", None),
        ("jogja", "JAWA", "DI Yogyakarta"),
        ("papua barat", "PAPUA", "Papua Barat"),
        ("papua", "PAPUA", None),
        ("maluku", "MALUKU", None),
        ("maluku utara", "MALUKU", "Maluku Utara"),
        ("ambon", "MALUKU", "Maluku"),
        ("jawa barat", "JAWA", "Jawa Barat"),
        ("nusa tenggara", "BALI_NUSRA", None),
        ("labuan bajo", "BALI_NUSRA", "Nusa Tenggara Timur"),
        ("🔥 7 🔥", "PAPUA", None),
        ("3️⃣", "KALIMANTAN", None),
        ("malang", "JAWA", "Jawa Timur"),
        ("Medan!!", "SUMATERA", "Sumatera Utara"),
    ],
)
def test_join_matches(wilayah, text, team, province):
    match = wilayah.match(text)
    assert match is not None, text
    assert (match.team, match.province) == (team, province)


@pytest.mark.parametrize(
    "text",
    [
        "aku 2 kali",
        "jawa vs papua",
        "8",
        "0",
        "1 2",
        "",
        "🔥🔥",
        "balik lagi",
        "serang",
        "serang!",
        "malang banget nasibku",
        "medan perang",
        "solo karier",
    ],
)
def test_not_a_join(wilayah, text):
    assert wilayah.match(text) is None


def test_exactly_38_provinces_and_every_kubu_has_one():
    data = json.loads((ROOT / "data" / "wilayah.json").read_text(encoding="utf-8"))
    assert len(data["provinces"]) == 38
    assert len({p["name"] for p in data["provinces"]}) == 38
    assert len(data["kubu"]) == 7
    for kubu in data["kubu"]:
        assert any(p["kubu"] == kubu["code"] for p in data["provinces"]), kubu["code"]


def test_every_listed_alias_resolves_to_its_province(wilayah):
    data = json.loads((ROOT / "data" / "wilayah.json").read_text(encoding="utf-8"))
    island_aliases = {tuple(normalize(a).split()) for k in data["kubu"] for a in k["aliases"]}
    for province in data["provinces"]:
        for alias in [province["name"], *province["aliases"]]:
            match = wilayah.match(alias)
            assert match is not None, alias
            assert match.team == province["kubu"], alias
            if tuple(normalize(alias).split()) not in island_aliases:
                assert match.province == province["name"], alias


def test_normalize():
    assert normalize("  JAWAAAA!!!  🔥  ") == "jawa"
    assert normalize("Kalimantan---Timur") == "kalimantan timur"
    assert normalize("333") == "333"


@pytest.mark.parametrize("text", ["gas", "GASSS", "gaaas", "ayo gass", "gas!"])
def test_rally_words(text):
    assert is_rally(text)


@pytest.mark.parametrize("text", ["gasing", "bagas", "tugas selesai", ""])
def test_not_rally_words(text):
    assert not is_rally(text)


def test_chat_without_team_is_not_sent(wilayah):
    chat = ChatProcessor(wilayah)
    assert chat.handle("a", "halo", 0.0) is None
    assert chat.stats["no_team"] == 1


def test_dash_and_rally_cooldowns(wilayah):
    chat = ChatProcessor(wilayah, dash_cooldown=3, rally_cooldown=10)
    assert chat.handle("a", "jawa", 0.0)["action"] == "TEAM_JOIN"
    assert chat.handle("a", "halo", 1.0)["action"] == "DASH"
    assert chat.handle("a", "halo", 2.0) is None
    assert chat.handle("a", "halo", 4.0)["action"] == "DASH"
    assert chat.handle("a", "gas", 5.0)["action"] == "RALLY"
    assert chat.handle("a", "gas", 14.0) is None
    assert chat.handle("a", "gas", 15.0)["action"] == "RALLY"
    assert chat.handle("b", "1", 15.0)["team"] == "JAWA"


def test_action_carries_last_team(wilayah):
    chat = ChatProcessor(wilayah)
    chat.handle("a", "jawa", 0.0)
    chat.handle("a", "papua", 1.0)
    assert chat.handle("a", "halo", 2.0)["team"] == "PAPUA"


@pytest.mark.parametrize("nick", ["anj1ng_77", "B4NGS4TT", "t0l0l_banget", "A N J I N G", "anjiiiing", "asu", "dasar babi"])
def test_rude_nicks_are_replaced(moderator, nick):
    safe = moderator.safe_nick("user-1", nick)
    assert safe.startswith("Penonton")
    assert len(safe) == 12


@pytest.mark.parametrize("nick", ["Budi", "Pasukan", "Kasur", "Santai", "Bagus123", "Aditya"])
def test_clean_nicks_survive(moderator, nick):
    assert moderator.safe_nick("user-1", nick) == nick


def test_nick_is_cut_and_fallback_is_stable(moderator):
    assert moderator.safe_nick("u", "NamaYangPanjangSekali") == "NamaYangPanj"
    assert moderator.safe_nick("u", "anjing") == moderator.safe_nick("u", "anjing")
    assert moderator.safe_nick("u", "   ").startswith("Penonton")
