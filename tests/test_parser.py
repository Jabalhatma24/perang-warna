import json
from pathlib import Path

import pytest

from parser import ChatProcessor, is_rally, normalize

ROOT = Path(__file__).resolve().parent.parent
DATA = json.loads((ROOT / "data" / "wilayah.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize(
    "text, team, country",
    [
        # Angka
        ("1", "ASIA", None),
        ("🔥 4 🔥", "SOUTH_AMERICA", None),
        ("3️⃣", "NORTH_AMERICA", None),
        # Nama benua
        ("asia", "ASIA", None),
        ("EUROPE!!", "EUROPE", None),
        ("n.america", "NORTH_AMERICA", None),
        ("amerika selatan", "SOUTH_AMERICA", None),
        # Negara: Inggris dan Indonesia
        ("indonesia", "ASIA", "Indonesia"),
        ("INDONESIAAAA 🔥", "ASIA", "Indonesia"),
        ("from brazil", "SOUTH_AMERICA", "Brazil"),
        ("jepang", "ASIA", "Japan"),
        ("jerman", "EUROPE", "Germany"),
        ("amerika serikat", "NORTH_AMERICA", "USA"),
        ("holland", "EUROPE", "Netherlands"),
        ("jawa", "ASIA", "Indonesia"),
        # Kode ISO, hanya jika berdiri sendiri
        ("id", "ASIA", "Indonesia"),
        ("IT", "EUROPE", "Italy"),
        ("in", "ASIA", "India"),
        ("my", "ASIA", "Malaysia"),
        ("us", "NORTH_AMERICA", "USA"),
        ("uk", "EUROPE", "United Kingdom"),
        # Label di layar lebih utama daripada kode ISO negara
        ("SA", "SOUTH_AMERICA", None),
        ("AS", "ASIA", None),
        ("NA", "NORTH_AMERICA", None),
        # Tanda baca Latin
        ("México", "NORTH_AMERICA", "Mexico"),
        ("España", "EUROPE", "Spain"),
        ("Việt Nam", "ASIA", "Vietnam"),
        ("Perú", "SOUTH_AMERICA", "Peru"),
        # Aksara lokal
        ("日本", "ASIA", "Japan"),
        ("한국", "ASIA", "South Korea"),
        ("ไทย", "ASIA", "Thailand"),
        ("भारत", "ASIA", "India"),
        ("Россия", "EUROPE", "Russia"),
        # Emoji bendera
        ("🇯🇵", "ASIA", "Japan"),
        ("🇧🇷 lets go", "SOUTH_AMERICA", "Brazil"),
        ("🇳🇴", "EUROPE", "Norway"),
        ("🇮🇩🇮🇩🇮🇩", "ASIA", "Indonesia"),
        # Dua negara dalam satu kubu tetap sah
        ("japan and korea", "ASIA", "Japan"),
        # Nama yang juga kata sehari-hari, jika berdiri sendiri
        ("cuba", "NORTH_AMERICA", "Cuba"),
        ("french", "EUROPE", "France"),
    ],
)
def test_join_matches(wilayah, text, team, country):
    match = wilayah.match(text)
    assert match is not None, text
    assert (match.team, match.country) == (team, country)


@pytest.mark.parametrize(
    "text",
    [
        # Angka
        "aku 2 kali", "8", "0", "1 2", "", "🔥🔥",
        # Beda kubu
        "japan vs usa", "🇯🇵🇺🇸", "🇯🇵 usa",
        # Kode ISO di dalam kalimat
        "i love it", "in my country", "it is us", "my team", "us too", "go to id",
        # Kode ISO yang merupakan kata sehari-hari
        "no", "me", "so", "to", "is", "am", "at", "be", "do", "si", "la", "pa", "by", "ai",
        # Nama negara yang juga kata sehari-hari, di dalam kalimat
        "cuba lagi", "what a chad", "french fries", "michael jordan", "turkey sandwich", "korean food",
        # Bukan potongan kata
        "balikpapan", "nigerian" + "x", "bali" + "kpapan", "iranian", "omani", "chinatown", "perumahan", "malian",
        # Bendera yang tidak terdaftar
        "🇦🇶",
        # Benua yang tidak ikut: hanya 4 benua dengan pengguna TikTok terbanyak
        "5", "6", "7", "timur tengah", "afrika", "oceania", "egypt", "saudi", "dubai", "australia", "nigeria", "🇸🇦", "🇦🇺",
    ],
)
def test_not_a_join(wilayah, text):
    assert wilayah.match(text) is None, text


def test_world_data_shape():
    assert [k["code"] for k in DATA["kubu"]] == ["ASIA", "EUROPE", "NORTH_AMERICA", "SOUTH_AMERICA"]
    assert [k["no"] for k in DATA["kubu"]] == list(range(1, 5))
    assert len(DATA["countries"]) >= 100
    assert len({c["name"] for c in DATA["countries"]}) == len(DATA["countries"])
    assert len({c["iso"] for c in DATA["countries"]}) == len(DATA["countries"])
    codes = {k["code"] for k in DATA["kubu"]}
    for kubu in DATA["kubu"]:
        assert any(c["kubu"] == kubu["code"] for c in DATA["countries"]), kubu["code"]
        assert len(kubu["label"]) == 2 and kubu["short"]
    for country in DATA["countries"]:
        assert country["kubu"] in codes
        assert len(country["iso"]) == 2


def test_no_alias_belongs_to_two_entries():
    seen = {}
    entries = [(k["code"], k["aliases"]) for k in DATA["kubu"]]
    entries += [(c["name"], [c["name"], *c["aliases"]]) for c in DATA["countries"]]
    for owner, aliases in entries:
        for alias in aliases:
            key = normalize(alias)
            assert seen.setdefault(key, owner) == owner, f"{alias}: {seen[key]} dan {owner}"


def test_every_listed_alias_resolves_to_its_country(wilayah):
    continent_aliases = {tuple(normalize(a).split()) for k in DATA["kubu"] for a in k["aliases"]}
    for country in DATA["countries"]:
        for alias in [country["name"], *country["aliases"]]:
            match = wilayah.match(alias)
            assert match is not None, alias
            assert match.team == country["kubu"], alias
            if tuple(normalize(alias).split()) not in continent_aliases:
                assert match.country == country["name"], alias


def test_every_country_flag_resolves(wilayah):
    for country in DATA["countries"]:
        flag = "".join(chr(0x1F1E6 + ord(letter) - ord("a")) for letter in country["iso"])
        match = wilayah.match(flag)
        assert match is not None, country["name"]
        assert (match.team, match.country) == (country["kubu"], country["name"])


def test_placements_from_the_brief(wilayah):
    expected = {
        "Russia": "EUROPE", "Mexico": "NORTH_AMERICA", "Philippines": "ASIA", "Brazil": "SOUTH_AMERICA",
        "Indonesia": "ASIA", "USA": "NORTH_AMERICA",
    }
    placed = {c["name"]: c["kubu"] for c in DATA["countries"]}
    for name, team in expected.items():
        assert placed[name] == team, name


def test_normalize():
    assert normalize("  JAWAAAA!!!  🔥  ") == "jawa"
    assert normalize("South---Africa") == "south africa"
    assert normalize("333") == "333"
    assert normalize("MÉXICO") == "mexico"
    assert normalize("Đà Nẵng") == "da nang"
    assert normalize("日本") == "日本"
    assert normalize("한국") == "한국"


@pytest.mark.parametrize("text", ["gas", "GASSS", "gaaas", "ayo gass", "gas!", "rush", "RUSH!!", "ruuush", "rush them"])
def test_rally_words(text):
    assert is_rally(text)


@pytest.mark.parametrize("text", ["gasing", "bagas", "tugas selesai", "", "brush", "crush", "rushing"])
def test_not_rally_words(text):
    assert not is_rally(text)


def test_chat_without_team_is_not_sent(wilayah):
    chat = ChatProcessor(wilayah)
    assert chat.handle("a", "hello", 0.0) is None
    assert chat.stats["no_team"] == 1


def test_sentence_with_iso_word_does_not_switch_team(wilayah):
    chat = ChatProcessor(wilayah)
    chat.handle("a", "japan", 0.0)
    assert chat.handle("a", "i love it here", 1.0)["action"] == "DASH"
    assert chat.team_of("a") == "ASIA"


def test_dash_and_rally_cooldowns(wilayah):
    chat = ChatProcessor(wilayah, dash_cooldown=3, rally_cooldown=10)
    assert chat.handle("a", "asia", 0.0)["action"] == "TEAM_JOIN"
    assert chat.handle("a", "hello", 1.0)["action"] == "DASH"
    assert chat.handle("a", "hello", 2.0) is None
    assert chat.handle("a", "hello", 4.0)["action"] == "DASH"
    assert chat.handle("a", "rush", 5.0)["action"] == "RALLY"
    assert chat.handle("a", "gas", 14.0) is None
    assert chat.handle("a", "gas", 15.0)["action"] == "RALLY"
    assert chat.handle("b", "1", 15.0)["team"] == "ASIA"


def test_action_carries_last_team(wilayah):
    chat = ChatProcessor(wilayah)
    chat.handle("a", "asia", 0.0)
    chat.handle("a", "europe", 1.0)
    assert chat.handle("a", "hello", 2.0)["team"] == "EUROPE"


@pytest.mark.parametrize(
    "nick",
    [
        "anj1ng_77", "B4NGS4TT", "t0l0l_banget", "A N J I N G", "anjiiiing", "asu", "dasar babi",
        "fuck_y0u", "FUCKYOU", "b1tch_99", "sh1t", "h1tler", "nigg3r", "puta", "pendejo99", "блять",
    ],
)
def test_rude_nicks_are_replaced(moderator, nick):
    safe = moderator.safe_nick("user-1", nick)
    assert safe.startswith("Player")
    assert len(safe) == 10


@pytest.mark.parametrize(
    "nick",
    ["Budi", "Pasukan", "Kasur", "Santai", "Bagus123", "Aditya", "NigeriaKing", "Hitchcock", "Dickson", "Cassandra", "Yuki", "ماريا", "日本人"],
)
def test_clean_nicks_survive(moderator, nick):
    assert moderator.safe_nick("user-1", nick) == nick


def test_nick_is_cut_and_fallback_is_stable(moderator):
    assert moderator.safe_nick("u", "NamaYangPanjangSekali") == "NamaYangPanj"
    assert moderator.safe_nick("u", "anjing") == moderator.safe_nick("u", "anjing")
    assert moderator.safe_nick("u", "   ").startswith("Player")


def test_country_names_are_not_censored_as_nicknames(moderator):
    names = [a for c in DATA["countries"] for a in [c["name"], *c["aliases"]]]
    names += [a for k in DATA["kubu"] for a in [k["name"], *k["aliases"]]]
    blocked = [name for name in names if moderator.is_blocked(name)]
    assert blocked == []
