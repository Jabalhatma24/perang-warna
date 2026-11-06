import json
import random
from pathlib import Path

import pytest

from parser import PLATE_PREFIXES, ChatProcessor, is_rally, normalize, province_aliases

ROOT = Path(__file__).resolve().parent.parent
DATA = json.loads((ROOT / "data" / "wilayah.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize(
    "text, team, province",
    [
        # Angka
        ("1", "JAWA", None),
        ("🔥 4 🔥", "SULAWESI", None),
        ("3️⃣", "KALIMANTAN", None),
        ("2", "SUMATERA", None),
        # Nama pulau dan nama lamanya
        ("jawa", "JAWA", None),
        ("SUMATERA!!", "SUMATERA", None),
        ("sumatra", "SUMATERA", None),
        ("andalas", "SUMATERA", None),
        ("borneo", "KALIMANTAN", None),
        ("celebes", "SULAWESI", None),
        ("pulau jawa", "JAWA", None),
        ("JAWAAAA 🔥", "JAWA", None),
        # Label markas, hanya jika berdiri sendiri
        ("JW", "JAWA", None),
        ("sm", "SUMATERA", None),
        ("KL", "KALIMANTAN", None),
        ("sl", "SULAWESI", None),
        # Nama provinsi lengkap lebih utama daripada nama pulau di dalamnya
        ("jawa barat", "JAWA", "Jawa Barat"),
        ("Sumatera Utara", "SUMATERA", "Sumatera Utara"),
        ("sumatra utara", "SUMATERA", "Sumatera Utara"),
        ("kalimantan timur", "KALIMANTAN", "Kalimantan Timur"),
        ("sulawesi selatan", "SULAWESI", "Sulawesi Selatan"),
        ("kepulauan riau", "SUMATERA", "Kepulauan Riau"),
        ("riau", "SUMATERA", "Riau"),
        ("DI Yogyakarta", "JAWA", "DI Yogyakarta"),
        # Singkatan provinsi
        ("jabar", "JAWA", "Jawa Barat"),
        ("jateng", "JAWA", "Jawa Tengah"),
        ("jatim", "JAWA", "Jawa Timur"),
        ("dki", "JAWA", "DKI Jakarta"),
        ("diy", "JAWA", "DI Yogyakarta"),
        ("sumut", "SUMATERA", "Sumatera Utara"),
        ("sumbar", "SUMATERA", "Sumatera Barat"),
        ("sumsel", "SUMATERA", "Sumatera Selatan"),
        ("kepri", "SUMATERA", "Kepulauan Riau"),
        ("nad", "SUMATERA", "Aceh"),
        ("kalbar", "KALIMANTAN", "Kalimantan Barat"),
        ("kalteng", "KALIMANTAN", "Kalimantan Tengah"),
        ("kalsel", "KALIMANTAN", "Kalimantan Selatan"),
        ("kaltim", "KALIMANTAN", "Kalimantan Timur"),
        ("kaltara", "KALIMANTAN", "Kalimantan Utara"),
        ("sulut", "SULAWESI", "Sulawesi Utara"),
        ("sulteng", "SULAWESI", "Sulawesi Tengah"),
        ("sulbar", "SULAWESI", "Sulawesi Barat"),
        ("sulsel", "SULAWESI", "Sulawesi Selatan"),
        ("sultra", "SULAWESI", "Sulawesi Tenggara"),
        # Kota besar dan singkatan kota yang populer
        ("jakarta", "JAWA", "DKI Jakarta"),
        ("jkt", "JAWA", "DKI Jakarta"),
        ("jaksel", "JAWA", "DKI Jakarta"),
        ("bandung", "JAWA", "Jawa Barat"),
        ("bdg", "JAWA", "Jawa Barat"),
        ("bekasi", "JAWA", "Jawa Barat"),
        ("tangsel", "JAWA", "Banten"),
        ("semarang", "JAWA", "Jawa Tengah"),
        ("jogja", "JAWA", "DI Yogyakarta"),
        ("yogyakarta", "JAWA", "DI Yogyakarta"),
        ("surabaya", "JAWA", "Jawa Timur"),
        ("sby", "JAWA", "Jawa Timur"),
        ("mlg", "JAWA", "Jawa Timur"),
        ("madura", "JAWA", "Jawa Timur"),
        ("banda aceh", "SUMATERA", "Aceh"),
        ("mdn", "SUMATERA", "Sumatera Utara"),
        ("palembang", "SUMATERA", "Sumatera Selatan"),
        ("plg", "SUMATERA", "Sumatera Selatan"),
        ("pekanbaru", "SUMATERA", "Riau"),
        ("pku", "SUMATERA", "Riau"),
        ("batam", "SUMATERA", "Kepulauan Riau"),
        ("bandar lampung", "SUMATERA", "Lampung"),
        ("bangka", "SUMATERA", "Kepulauan Bangka Belitung"),
        ("pontianak", "KALIMANTAN", "Kalimantan Barat"),
        ("banjarmasin", "KALIMANTAN", "Kalimantan Selatan"),
        ("samarinda", "KALIMANTAN", "Kalimantan Timur"),
        ("balikpapan", "KALIMANTAN", "Kalimantan Timur"),
        ("bpp", "KALIMANTAN", "Kalimantan Timur"),
        ("palangka raya", "KALIMANTAN", "Kalimantan Tengah"),
        ("tarakan", "KALIMANTAN", "Kalimantan Utara"),
        ("ikn", "KALIMANTAN", "Kalimantan Timur"),
        ("makassar", "SULAWESI", "Sulawesi Selatan"),
        ("mks", "SULAWESI", "Sulawesi Selatan"),
        ("manado", "SULAWESI", "Sulawesi Utara"),
        ("menado", "SULAWESI", "Sulawesi Utara"),
        ("gorontalo", "SULAWESI", "Gorontalo"),
        ("kendari", "SULAWESI", "Sulawesi Tenggara"),
        ("mamuju", "SULAWESI", "Sulawesi Barat"),
        # Sebutan lokal dan bahasa gaul daerah
        ("jekardah", "JAWA", "DKI Jakarta"),
        ("betawi", "JAWA", "DKI Jakarta"),
        ("urang sunda", "JAWA", "Jawa Barat"),
        ("ngapak", "JAWA", "Jawa Tengah"),
        ("ngalam", "JAWA", "Jawa Timur"),
        ("arek suroboyo", "JAWA", "Jawa Timur"),
        ("bonek", "JAWA", "Jawa Timur"),
        ("bobotoh", "JAWA", "Jawa Barat"),
        ("horas bah", "SUMATERA", "Sumatera Utara"),
        ("batak", "SUMATERA", "Sumatera Utara"),
        ("urang awak", "SUMATERA", "Sumatera Barat"),
        ("minang", "SUMATERA", "Sumatera Barat"),
        ("wong kito galo", "SUMATERA", "Sumatera Selatan"),
        ("urang banjar", "KALIMANTAN", "Kalimantan Selatan"),
        ("dayak", "KALIMANTAN", "Kalimantan Tengah"),
        ("ewako", "SULAWESI", "Sulawesi Selatan"),
        ("bugis", "SULAWESI", "Sulawesi Selatan"),
        ("kawanua", "SULAWESI", "Sulawesi Utara"),
        # Absen plat nomor
        ("plat B", "JAWA", "DKI Jakarta"),
        ("PLAT AB hadir", "JAWA", "DI Yogyakarta"),
        ("pelat D", "JAWA", "Jawa Barat"),
        ("plat-L", "JAWA", "Jawa Timur"),
        ("plat BK", "SUMATERA", "Sumatera Utara"),
        ("plat bg", "SUMATERA", "Sumatera Selatan"),
        ("plat KT", "KALIMANTAN", "Kalimantan Timur"),
        ("plat DA", "KALIMANTAN", "Kalimantan Selatan"),
        ("plat DD", "SULAWESI", "Sulawesi Selatan"),
        ("plat DB", "SULAWESI", "Sulawesi Utara"),
        # Kalimat absen yang biasa di live
        ("aku dari bandung", "JAWA", "Jawa Barat"),
        ("absen jogja", "JAWA", "DI Yogyakarta"),
        ("hadir dari palembang 🔥", "SUMATERA", "Sumatera Selatan"),
        ("salam dari samarinda", "KALIMANTAN", "Kalimantan Timur"),
        ("gas makassar", "SULAWESI", "Sulawesi Selatan"),
        ("MAKASSARRR", "SULAWESI", "Sulawesi Selatan"),
        # Dua kota di satu pulau tetap sah, provinsinya yang pertama disebut
        ("bandung surabaya", "JAWA", "Jawa Barat"),
        ("jawa timur pride", "JAWA", "Jawa Timur"),
        # Kata umum yang juga nama kota, jika berdiri sendiri
        ("malang", "JAWA", "Jawa Timur"),
        ("solo", "JAWA", "Jawa Tengah"),
        ("batu", "JAWA", "Jawa Timur"),
        ("medan", "SUMATERA", "Sumatera Utara"),
        ("medannn", "SUMATERA", "Sumatera Utara"),
        ("padang", "SUMATERA", "Sumatera Barat"),
        ("palu", "SULAWESI", "Sulawesi Tengah"),
        # Nama yang dipakai di dua pulau: dipilih yang paling dikenal
        ("banjar", "KALIMANTAN", "Kalimantan Selatan"),
        ("kota banjar", "JAWA", "Jawa Barat"),
        ("martapura", "KALIMANTAN", "Kalimantan Selatan"),
        ("ketapang", "KALIMANTAN", "Kalimantan Barat"),
        # Kata ejekan di dalam nama kota tidak dihitung
        ("kota serang", "JAWA", "Banten"),
    ],
)
def test_join_matches(wilayah, text, team, province):
    match = wilayah.match(text)
    assert match is not None, text
    assert (match.team, match.province) == (team, province)


@pytest.mark.parametrize(
    "text",
    [
        # Angka
        "aku 2 kali", "8", "0", "1 2", "", "🔥🔥",
        # Pulau di luar 4 kubu: penontonnya ikut dengan angka 1-4
        "5", "6", "7", "bali", "denpasar", "lombok", "ntb", "ntt", "kupang", "maluku", "ambon", "ternate",
        "papua", "jayapura", "sorong", "merauke", "plat dk", "plat pa", "salam dari bali",
        # Indonesia dan judul game menyebut semua pulau sekaligus
        "indonesia", "nkri", "🇮🇩", "nusantara", "perang pulau nusantara", "ibu kota nusantara",
        # Beda pulau
        "jawa vs sumatera", "jawa sumatera", "bandung palembang", "plat b plat bk",
        # Ejekan atau serangan ke pulau lawan
        "serbu jawa", "serang sumatera", "hajar kalimantan", "sumatera cupu", "kalimantan kalah",
        "sulawesi lemah", "bukan jawa", "anti sumatera", "lawan makassar", "vs medan",
        # Label 2 huruf di dalam kalimat
        "i love kl", "sm entertainment", "kl kapan", "jw marriott",
        # Kata umum yang juga nama kota, di dalam kalimat
        "nasib malang banget", "di medan perang", "padang rumput", "solo karir", "palu godam",
        "batu akik", "roh kudus", "sari pati", "dari sabang sampai merauke", "liang lahat", "bau bau banget",
        # Bukan potongan kata
        "jawaban", "sumatran", "balikpapanku", "malangnya", "medanku", "serbuk", "kalimantang",
        # Plat tanpa awalan
        "b", "ab", "bk",
    ],
)
def test_not_a_join(wilayah, text):
    assert wilayah.match(text) is None, text


def test_island_data_shape():
    kubu = {k["code"]: k for k in DATA["kubu"]}
    assert list(kubu) == ["JAWA", "SUMATERA", "KALIMANTAN", "SULAWESI"]
    assert [k["no"] for k in DATA["kubu"]] == [1, 2, 3, 4]
    assert [k["color"] for k in DATA["kubu"]] == ["#FF3B30", "#FFCC00", "#34C759", "#007AFF"]
    assert [k["label"] for k in DATA["kubu"]] == ["JW", "SM", "KL", "SL"]
    assert [k["short"] for k in DATA["kubu"]] == ["JAWA", "SUMATERA", "KALIMANTAN", "SULAWESI"]

    provinces = DATA["provinces"]
    per_island = {code: sum(p["kubu"] == code for p in provinces) for code in kubu}
    assert per_island == {"JAWA": 6, "SUMATERA": 10, "KALIMANTAN": 5, "SULAWESI": 6}
    assert len({p["name"] for p in provinces}) == len(provinces)
    assert len({p["tag"] for p in provinces}) == len(provinces)
    for province in provinces:
        assert province["kubu"] in kubu
        assert 3 <= len(province["tag"]) <= 8 and province["tag"].isupper()
        assert province["plates"], province["name"]


def test_plate_codes_belong_to_one_province():
    plates = [plate for p in DATA["provinces"] for plate in p["plates"]]
    assert len(plates) == len(set(plates))
    assert all(plate.isalpha() and plate.isupper() and len(plate) <= 2 for plate in plates)


def test_every_plate_resolves(wilayah):
    for province in DATA["provinces"]:
        for plate in province["plates"]:
            for prefix in PLATE_PREFIXES:
                match = wilayah.match(f"{prefix} {plate}")
                assert match is not None, plate
                assert (match.team, match.province) == (province["kubu"], province["name"]), plate


def test_no_alias_belongs_to_two_entries():
    seen = {}
    entries = [(k["code"], k["aliases"]) for k in DATA["kubu"]]
    entries += [(p["name"], province_aliases(p)) for p in DATA["provinces"]]
    for owner, aliases in entries:
        for alias in aliases:
            key = normalize(alias)
            assert seen.setdefault(key, owner) == owner, f"{alias}: {seen[key]} dan {owner}"


def test_every_listed_alias_resolves_to_its_province(wilayah):
    island_aliases = {tuple(normalize(a).split()) for k in DATA["kubu"] for a in k["aliases"]}
    for province in DATA["provinces"]:
        for alias in province_aliases(province):
            match = wilayah.match(alias)
            assert match is not None, alias
            assert match.team == province["kubu"], alias
            if tuple(normalize(alias).split()) not in island_aliases:
                assert match.province == province["name"], alias


def test_ambiguous_and_hostile_lists_are_consistent(wilayah):
    aliases = {tuple(normalize(a).split()) for p in DATA["provinces"] for a in province_aliases(p)}
    aliases |= {tuple(normalize(a).split()) for k in DATA["kubu"] for a in k["aliases"]}
    # Setiap kata ambigu memang alias; kalau tidak, daftar itu salah ketik.
    assert wilayah.ambiguous <= aliases
    # Kata ejekan sendirian tidak pernah menjadi alias.
    assert not {(word,) for word in wilayah.hostile} & aliases


def test_normalize():
    assert normalize("  JAWAAAA!!!  🔥  ") == "jawa"
    assert normalize("Pare-Pare") == "pare pare"
    assert normalize("PLAT-AB") == "plat ab"
    assert normalize("Bandúng") == "bandung"
    assert normalize("333") == "333"
    assert normalize("日本") == "日本"


@pytest.mark.parametrize(
    "text",
    ["gas", "GASSS", "gaaas", "ayo gass", "gas!", "gaskeun", "GASPOL", "serbu", "SERBUUU!!", "serang", "rush", "RUSH!!"],
)
def test_rally_words(text):
    assert is_rally(text)


@pytest.mark.parametrize(
    "text", ["gasing", "bagas", "tugas selesai", "", "brush", "crush", "rushing", "serbuk", "penyerang", "serangan"],
)
def test_not_rally_words(text):
    assert not is_rally(text)


def test_chat_without_team_is_not_sent(wilayah):
    chat = ChatProcessor(wilayah)
    assert chat.handle("a", "halo semua", 0.0) is None
    assert chat.stats["no_team"] == 1


def test_join_carries_province(wilayah):
    chat = ChatProcessor(wilayah)
    assert chat.handle("a", "aku dari bandung", 0.0) == {"action": "TEAM_JOIN", "team": "JAWA", "province": "Jawa Barat"}
    assert chat.handle("b", "2", 0.0) == {"action": "TEAM_JOIN", "team": "SUMATERA", "province": None}


def test_province_is_remembered_for_every_action(wilayah):
    chat = ChatProcessor(wilayah, dash_cooldown=0, rally_cooldown=0)
    chat.handle("a", "surabaya", 0.0)
    assert chat.handle("a", "halo", 1.0) == {"action": "DASH", "team": "JAWA", "province": "Jawa Timur"}
    assert chat.handle("a", "gas", 2.0)["province"] == "Jawa Timur"
    # Angka pulau yang sama tidak menghapus provinsi.
    assert chat.handle("a", "1", 3.0) == {"action": "TEAM_JOIN", "team": "JAWA", "province": "Jawa Timur"}
    # Pindah pulau tanpa menyebut provinsi menghapusnya, menyebut kota menggantinya.
    assert chat.handle("a", "2", 4.0)["province"] is None
    assert chat.handle("a", "halo", 5.0)["province"] is None
    assert chat.handle("a", "padang", 6.0)["province"] == "Sumatera Barat"


def test_trash_talk_does_not_switch_team(wilayah):
    """Ejekan ke pulau lawan adalah komentar biasa: kubu tetap, like tetap untuk pulau sendiri."""
    chat = ChatProcessor(wilayah, dash_cooldown=0, rally_cooldown=0)
    chat.handle("a", "1", 0.0)
    assert chat.handle("a", "sumatera cupu", 1.0) == {"action": "DASH", "team": "JAWA", "province": None}
    assert chat.handle("a", "serbu sumatera", 2.0) == {"action": "RALLY", "team": "JAWA", "province": None}
    assert chat.handle("a", "di medan perang", 3.0)["action"] == "DASH"
    assert chat.team_of("a") == "JAWA"


def test_dash_and_rally_cooldowns(wilayah):
    chat = ChatProcessor(wilayah, dash_cooldown=3, rally_cooldown=10)
    assert chat.handle("a", "jawa", 0.0)["action"] == "TEAM_JOIN"
    assert chat.handle("a", "halo", 1.0)["action"] == "DASH"
    assert chat.handle("a", "halo", 2.0) is None
    assert chat.handle("a", "halo", 4.0)["action"] == "DASH"
    assert chat.handle("a", "serbu", 5.0)["action"] == "RALLY"
    assert chat.handle("a", "gas", 14.0) is None
    assert chat.handle("a", "gas", 15.0)["action"] == "RALLY"
    assert chat.handle("b", "1", 15.0)["team"] == "JAWA"


def test_action_carries_last_team(wilayah):
    chat = ChatProcessor(wilayah)
    chat.handle("a", "jawa", 0.0)
    chat.handle("a", "sulawesi", 1.0)
    assert chat.handle("a", "halo", 2.0)["team"] == "SULAWESI"


def test_simulator_join_texts_and_chatter(wilayah):
    """Bot simulasi harus bergabung ke pulaunya sendiri, dan obrolannya tidak boleh memindahkan pulau."""
    from simulator import CHATTER, Simulator

    simulator = Simulator(wilayah, sink=None, rate="high", rng=random.Random(3))
    for bot in simulator.bots:
        for _ in range(20):
            text = simulator._join_text(bot)
            match = wilayah.match(text)
            assert match is not None and match.team == bot["team"], text
    for text in CHATTER:
        assert wilayah.match(text) is None, text


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
    ["Budi", "Pasukan", "Kasur", "Santai", "Bagus123", "Aditya", "Ucok_Medan", "ArekMalang", "Daeng", "Butet", "日本人"],
)
def test_clean_nicks_survive(moderator, nick):
    assert moderator.safe_nick("user-1", nick) == nick


def test_nick_is_cut_and_fallback_is_stable(moderator):
    assert moderator.safe_nick("u", "NamaYangPanjangSekali") == "NamaYangPanj"
    assert moderator.safe_nick("u", "anjing") == moderator.safe_nick("u", "anjing")
    assert moderator.safe_nick("u", "   ").startswith("Player")


def test_region_names_are_not_censored_as_nicknames(moderator):
    # Plat nomor tidak ikut: "plat K" memang mirip singkatan kasar, dan tidak pernah menjadi nickname.
    names = [a for p in DATA["provinces"] for a in [p["name"], p["tag"], *p["aliases"]]]
    names += [a for k in DATA["kubu"] for a in [k["name"], *k["aliases"]]]
    blocked = [name for name in names if moderator.is_blocked(name)]
    assert blocked == []
