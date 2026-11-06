"""Bot penonton. Memakai metode `sink` yang sama dengan adapter TikTok."""
from __future__ import annotations

import asyncio
import random

RATES = {
    # gift_chance: peluang gift dalam 10% kejadian sisa setelah chat/like/follow.
    "low": {"bots": 25, "events_per_second": 4, "gift_chance": 0.5},
    "normal": {"bots": 90, "events_per_second": 14, "gift_chance": 0.5},
    "high": {"bots": 480, "events_per_second": 90, "gift_chance": 0.25},
}

NAMES = [
    "Budi", "Sari", "Dewi", "Yuki", "Min", "Wei", "Jose", "Maria", "John", "Emma", "Liam", "Hans",
    "Pierre", "Sofia", "Ahmed", "Fatima", "Omar", "Kofi", "Amara", "Zola", "Tane", "Mia", "Lucas", "Ana",
]
RUDE_NAMES = ["anj1ng_77", "fuck_y0u", "b1tch_99"]
CHATTER = [
    "wkwkwk", "lol", "nice", "let's go", "hello everyone", "i love it", "in my country", "it is us",
    "japan vs usa", "so cool", "no way", "seru banget", "aku 2 kali", "cuba lagi", "french fries",
]
RALLY = ["gas", "GASSS", "rush", "RUSH!!", "gas terus", "rush them"]
MICRO_GIFTS = [(5655, "Rose", 1), (7934, "Heart Me", 1), (6064, "GG", 1), (5827, "Finger Heart", 5)]
MID_GIFTS = [(5269, "TikTok", 10), (6104, "Hat", 30), (5879, "Donut", 30), (6427, "Perfume", 20)]
SULTAN_GIFTS = [(5585, "Confetti", 100), (6369, "Lion Cub", 299), (6148, "Ship", 500)]
MEGA_GIFTS = [(6064, "Whale", 1000), (6202, "Galaxy", 1000), (7312, "Lion", 29999)]
STREAK_EVENTS_PER_SECOND = 5


class Simulator:
    def __init__(self, wilayah, sink, rate: str = "normal", rng: random.Random | None = None):
        if rate not in RATES:
            raise ValueError(f"Rate tidak dikenal: {rate}")
        self.wilayah = wilayah
        self.sink = sink
        self.settings = RATES[rate]
        self.rng = rng or random.Random()
        self._group = 100000
        self._streaks: list[dict] = []
        # Bobot timpang supaya bonus Underdog ikut teruji.
        weights = [40, 22, 12, 10, 8, 5, 3][:len(self.wilayah.codes)]
        self.rng.shuffle(weights)
        self.team_weights = weights
        self.aliases_by_team = self._collect_aliases()
        self.bots = [self._make_bot(index) for index in range(self.settings["bots"])]

    def _collect_aliases(self) -> dict[str, list[str]]:
        # Kode pendek dilewati: _join_text menambahkan huruf dan tanda baca, sedangkan kode hanya sah sendirian.
        def usable(alias: str) -> bool:
            return len(alias) > 2 and alias.lower() not in ambiguous

        ambiguous = {" ".join(key) for key in self.wilayah.ambiguous}
        aliases: dict[str, list[str]] = {}
        for kubu in self.wilayah.kubu:
            aliases[kubu["code"]] = [str(kubu["no"]), *filter(usable, kubu.get("aliases", []))]
        for country in self.wilayah.countries:
            aliases[country["kubu"]].extend(filter(usable, [country["name"], *country.get("aliases", [])]))
        return aliases

    def _make_bot(self, index: int) -> dict:
        if self.rng.random() < 0.02:
            nick = self.rng.choice(RUDE_NAMES)
        else:
            nick = f"{self.rng.choice(NAMES)}{index}"
        team = self.rng.choices(self.wilayah.codes, weights=self.team_weights)[0]
        return {
            "user": {"id": f"sim_{index}", "handle": f"sim_{index}", "nick": nick, "isFollower": False},
            "team": team,
            "joined": False,
        }

    def _join_text(self, bot: dict) -> str:
        alias = self.rng.choice(self.aliases_by_team[bot["team"]])
        roll = self.rng.random()
        if roll < 0.2:
            return alias.upper() + "!!"
        if roll < 0.35:
            return alias + "aaaa 🔥" if alias[-1].isalpha() else alias
        return alias

    def _begin_gift(self, bot: dict, pool: list, streak_length: int) -> None:
        gift_id, name, coins = self.rng.choice(pool)
        self._group += 1
        self._streaks.append({
            "user": bot["user"], "gift_id": gift_id, "name": name, "coins": coins,
            "group": self._group, "count": 0, "length": streak_length, "next_at": 0.0,
        })

    def _random_gift(self, bot: dict) -> None:
        tier = self.rng.random()
        if tier < 0.80:
            self._begin_gift(bot, MICRO_GIFTS, self.rng.randint(3, 25))
        elif tier < 0.95:
            self._begin_gift(bot, MID_GIFTS, self.rng.randint(1, 3))
        elif tier < 0.99:
            self._begin_gift(bot, SULTAN_GIFTS, 1)
        else:
            self._begin_gift(bot, MEGA_GIFTS, 1)

    def step(self, now: float) -> None:
        """Satu kejadian acak dari satu bot."""
        bot = self.rng.choice(self.bots)
        user = bot["user"]
        if not bot["joined"]:
            bot["joined"] = True
            self.sink.on_comment(user, self._join_text(bot))
            return

        roll = self.rng.random()
        if roll < 0.60:
            self.sink.on_comment(user, self.rng.choice(CHATTER))
        elif roll < 0.72:
            self.sink.on_comment(user, self.rng.choice(RALLY))
        elif roll < 0.74:
            self.sink.on_comment(user, self._join_text(bot))
        elif roll < 0.88:
            self.sink.on_like(user, self.rng.randint(1, 15))
        elif roll < 0.90:
            self.sink.on_social(user, self.rng.choice(["follow", "share"]))
        elif self.rng.random() < self.settings["gift_chance"]:
            self._random_gift(bot)

    def advance_streaks(self, now: float) -> None:
        for streak in self._streaks:
            if now < streak["next_at"]:
                continue
            streak["next_at"] = now + 1 / STREAK_EVENTS_PER_SECOND
            streak["count"] = min(streak["length"], streak["count"] + self.rng.randint(1, 3))
            end = streak["count"] >= streak["length"]
            self.sink.on_gift(
                streak["user"], streak["gift_id"], streak["name"], streak["coins"],
                streak["group"], streak["count"], end, True,
            )
            streak["done"] = end
        self._streaks = [s for s in self._streaks if not s.get("done")]

    async def run(self) -> None:
        loop = asyncio.get_running_loop()
        interval = 0.05
        credit = 0.0
        next_viewers = 0.0
        while True:
            now = loop.time()
            credit += self.settings["events_per_second"] * interval
            while credit >= 1:
                credit -= 1
                self.step(now)
            self.advance_streaks(now)
            if now >= next_viewers:
                next_viewers = now + 5
                self.sink.on_viewers(self.settings["bots"] + self.rng.randint(-5, 25))
            await asyncio.sleep(interval)
