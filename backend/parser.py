"""Normalisasi chat, pencocokan wilayah, perintah, cooldown, dan moderasi nickname."""
from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path

_NON_WORD = re.compile(r"[\W_]+", re.UNICODE)
_REPEAT_3 = re.compile(r"([^\W\d_])\1{2,}", re.UNICODE)
_RALLY = re.compile(r"^(g+a+s+|r+u+s+h+)$")
_FLAG = re.compile("[\U0001F1E6-\U0001F1FF]{2}")
_LEET = str.maketrans({"4": "a", "3": "e", "1": "i", "0": "o", "5": "s"})


def _fold_latin(text: str) -> str:
    """Menghapus tanda baca huruf Latin (mexico = méxico). Aksara lain tidak disentuh."""
    kept: list[str] = []
    latin_base = False
    for char in unicodedata.normalize("NFD", text):
        if unicodedata.category(char) == "Mn":
            if latin_base:
                continue
        else:
            latin_base = char.isascii() and char.isalpha()
        kept.append(char)
    return unicodedata.normalize("NFC", "".join(kept)).replace("đ", "d").replace("ı", "i")


def normalize(text: str) -> str:
    """Huruf kecil tanpa tanda baca Latin, emoji/tanda baca jadi spasi, huruf berulang >= 3 diringkas."""
    text = _fold_latin(unicodedata.normalize("NFKC", text or "").lower())
    text = _NON_WORD.sub(" ", text)
    text = _REPEAT_3.sub(r"\1", text)
    return " ".join(text.split())


@dataclass(frozen=True)
class TeamMatch:
    team: str
    country: str | None


class Wilayah:
    """Kamus 7 kubu, negara, dan alias dari data/wilayah.json."""

    def __init__(self, data: dict):
        self.kubu = sorted(data["kubu"], key=lambda k: k["no"])
        self.countries = data["countries"]
        self.codes = [k["code"] for k in self.kubu]
        self.by_no = {str(k["no"]): k["code"] for k in self.kubu}
        self.ambiguous = {tuple(normalize(a).split()) for a in data.get("ambiguous", [])}
        self.alias_map: dict[tuple[str, ...], TeamMatch] = {}

        known = set(self.codes)
        self.flag_map: dict[str, TeamMatch] = {}
        for country in self.countries:
            if country["kubu"] not in known:
                raise ValueError(f"Kubu tidak dikenal untuk {country['name']}: {country['kubu']}")
            match = TeamMatch(country["kubu"], country["name"])
            self.flag_map[country["iso"]] = match
            for alias in [country["name"], *country.get("aliases", [])]:
                self.alias_map[tuple(normalize(alias).split())] = match

        # Alias kubu ditulis terakhir: label di layar seperti "SA" lebih utama daripada kode ISO negara.
        for kubu in self.kubu:
            for alias in kubu.get("aliases", []):
                self.alias_map[tuple(normalize(alias).split())] = TeamMatch(kubu["code"], None)

        self.max_alias_len = max(len(key) for key in self.alias_map)

    @classmethod
    def load(cls, path: str | Path) -> "Wilayah":
        with open(path, encoding="utf-8") as handle:
            return cls(json.load(handle))

    def _is_standalone_only(self, key: tuple[str, ...]) -> bool:
        # Kode 2 huruf (it, in, my, us) adalah kata sehari-hari, jadi hanya sah jika berdiri sendiri.
        return key in self.ambiguous or (len(key) == 1 and len(key[0]) <= 2 and key[0].isascii())

    def _flags_in(self, text: str) -> list[TeamMatch]:
        found = []
        for flag in _FLAG.findall(text or ""):
            iso = "".join(chr(ord(char) - 0x1F1E6 + ord("a")) for char in flag)
            if iso in self.flag_map:
                found.append(self.flag_map[iso])
        return found

    def match(self, text: str) -> TeamMatch | None:
        """Cocokkan komentar ke kubu. None berarti komentar ini bukan perintah gabung."""
        tokens = normalize(text).split()
        found = self._flags_in(text)
        if not tokens and not found:
            return None

        if not found and len(tokens) == 1 and tokens[0] in self.by_no:
            return TeamMatch(self.by_no[tokens[0]], None)

        index = 0
        while index < len(tokens):
            for size in range(min(self.max_alias_len, len(tokens) - index), 0, -1):
                key = tuple(tokens[index:index + size])
                match = self.alias_map.get(key)
                if match is None:
                    continue
                if self._is_standalone_only(key) and len(tokens) != size:
                    continue
                found.append(match)
                index += size
                break
            else:
                index += 1

        if not found or len({m.team for m in found}) > 1:
            return None
        country = next((m.country for m in found if m.country), None)
        return TeamMatch(found[0].team, country)


def is_rally(text: str) -> bool:
    return any(_RALLY.match(token) for token in normalize(text).split())


class ChatProcessor:
    """Mengubah komentar menjadi aksi, menyimpan kubu terakhir dan cooldown per akun."""

    def __init__(self, wilayah: Wilayah, dash_cooldown: float = 3.0, rally_cooldown: float = 10.0):
        self.wilayah = wilayah
        self.dash_cooldown = dash_cooldown
        self.rally_cooldown = rally_cooldown
        self.user_team: dict[str, str] = {}
        self._last_dash: dict[str, float] = {}
        self._last_rally: dict[str, float] = {}
        self.stats = {"comments": 0, "no_team": 0, "cooldown_dropped": 0}

    def team_of(self, user_id: str) -> str | None:
        return self.user_team.get(user_id)

    def handle(self, user_id: str, text: str, now: float) -> dict | None:
        """Mengembalikan data CHAT_ACTION, atau None jika tidak ada yang perlu dikirim."""
        self.stats["comments"] += 1

        match = self.wilayah.match(text)
        if match is not None:
            self.user_team[user_id] = match.team
            return {"action": "TEAM_JOIN", "team": match.team, "country": match.country}

        team = self.user_team.get(user_id)
        if team is None:
            self.stats["no_team"] += 1
            return None

        if is_rally(text):
            if now - self._last_rally.get(user_id, float("-inf")) < self.rally_cooldown:
                self.stats["cooldown_dropped"] += 1
                return None
            self._last_rally[user_id] = now
            return {"action": "RALLY", "team": team, "country": None}

        if now - self._last_dash.get(user_id, float("-inf")) < self.dash_cooldown:
            self.stats["cooldown_dropped"] += 1
            return None
        self._last_dash[user_id] = now
        return {"action": "DASH", "team": team, "country": None}


def _moderation_form(text: str) -> str:
    """Bentuk khusus cek blocklist: leetspeak dibalik dan semua huruf ganda diringkas."""
    text = unicodedata.normalize("NFKC", text or "").lower().translate(_LEET)
    text = _NON_WORD.sub(" ", text)
    text = re.sub(r"([^\W\d_])\1+", r"\1", text, flags=re.UNICODE)
    return " ".join(text.split())


class Moderator:
    """Menyaring nickname. Kata >= 5 huruf dicek sebagai potongan, sisanya kata utuh.

    Awalan `=` di blocklist memaksa cek kata utuh, untuk kata yang bentuk ringkasnya
    menjadi bagian kata wajar (misalnya nama negara).
    """

    NICK_MAX = 12

    def __init__(self, words: list[str]):
        self._substring: list[str] = []
        self._whole: set[str] = set()
        for word in words:
            whole_only = word.startswith("=")
            form = _moderation_form(word.lstrip("="))
            if not form:
                continue
            if not whole_only and len(form.replace(" ", "")) >= 5:
                self._substring.append(form.replace(" ", ""))
            else:
                self._whole.add(form)

    @classmethod
    def load(cls, path: str | Path) -> "Moderator":
        words: list[str] = []
        with open(path, encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if line and not line.startswith("#"):
                    words.append(line)
        return cls(words)

    def is_blocked(self, text: str) -> bool:
        form = _moderation_form(text)
        if not form:
            return False
        compact = form.replace(" ", "")
        if any(word in compact for word in self._substring):
            return True
        tokens = form.split()
        return compact in self._whole or any(token in self._whole for token in tokens)

    @staticmethod
    def _fallback(user_id: str) -> str:
        digits = int(hashlib.sha256(user_id.encode("utf-8")).hexdigest(), 16) % 10000
        return f"Player{digits:04d}"

    def safe_nick(self, user_id: str, nick: str) -> str:
        cleaned = " ".join((nick or "").split())
        if not cleaned or self.is_blocked(cleaned):
            return self._fallback(user_id)
        return cleaned[: self.NICK_MAX]
