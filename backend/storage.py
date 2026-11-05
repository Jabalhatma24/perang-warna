"""Penyimpanan Win, streak, Hall of Fame, dan Prasasti Sultan dengan tulis atomik."""
from __future__ import annotations

import json
import logging
import os
import tempfile
import time
from pathlib import Path

log = logging.getLogger("storage")

HALL_OF_FAME_SIZE = 5
ROUND_ID_MEMORY = 200


class Storage:
    def __init__(self, path: str | Path, codes: list[str], keep_session: bool = False, reset_all: bool = False):
        self.path = Path(path)
        self.codes = list(codes)
        self.state = self._load()
        if reset_all:
            self.state["allTime"] = self._zeros()
            self.state["hallOfFame"] = []
        if not keep_session:
            self.state["session"] = self._zeros()
            self.state["streak"] = {"team": None, "count": 0}
            self.state["prasasti"] = []
        self.save()

    def _zeros(self) -> dict[str, int]:
        return {code: 0 for code in self.codes}

    def _fresh(self) -> dict:
        return {
            "session": self._zeros(),
            "allTime": self._zeros(),
            "streak": {"team": None, "count": 0},
            "hallOfFame": [],
            "roundIds": [],
            "prasasti": [],
        }

    def _load(self) -> dict:
        state = self._fresh()
        if not self.path.exists():
            return state
        try:
            with open(self.path, encoding="utf-8") as handle:
                loaded = json.load(handle)
            if not isinstance(loaded, dict):
                raise ValueError("isi berkas bukan objek JSON")
        except (OSError, ValueError) as error:
            backup = self.path.with_suffix(self.path.suffix + f".rusak-{int(time.time())}")
            log.warning("%s tidak bisa dibaca (%s), disimpan sebagai %s", self.path, error, backup)
            try:
                os.replace(self.path, backup)
            except OSError:
                pass
            return state
        state.update({key: loaded[key] for key in state if key in loaded})
        for key in ("session", "allTime"):
            state[key] = {code: int(state[key].get(code, 0)) for code in self.codes}
        return state

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        descriptor, temp_name = tempfile.mkstemp(
            dir=self.path.parent, prefix=self.path.name + ".", suffix=".tmp"
        )
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                json.dump(self.state, handle, ensure_ascii=False, indent=2)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temp_name, self.path)
        except BaseException:
            try:
                os.unlink(temp_name)
            except OSError:
                pass
            raise

    def record_round(
        self,
        round_id: str,
        winner: str | None,
        mvp: dict | None,
        round_no: int | None = None,
        count_permanent: bool = True,
    ) -> bool:
        """Mencatat hasil ronde. False jika roundId sudah pernah diterima.

        `count_permanent=False` dipakai untuk ronde yang tercampur bot simulasi:
        Win sesi tetap bertambah, tetapi Klasemen Abadi dan Hall of Fame tidak.
        """
        if not round_id or round_id in self.state["roundIds"]:
            return False
        self.state["roundIds"] = (self.state["roundIds"] + [round_id])[-ROUND_ID_MEMORY:]

        if winner in self.codes:
            self.state["session"][winner] += 1
            if count_permanent:
                self.state["allTime"][winner] += 1
            streak = self.state["streak"]
            if streak["team"] == winner:
                streak["count"] += 1
            else:
                self.state["streak"] = {"team": winner, "count": 1}
            if mvp and count_permanent:
                entry = {
                    "id": str(mvp.get("id", "")),
                    "nick": str(mvp.get("nick", ""))[:12],
                    "coins": int(mvp.get("coins", 0)),
                    "team": winner,
                    "round": round_no,
                    "ts": int(time.time() * 1000),
                }
                self.state["hallOfFame"] = ([entry] + self.state["hallOfFame"])[:HALL_OF_FAME_SIZE]

        self.save()
        return True

    def add_prasasti(self, nick: str) -> bool:
        if not nick or nick in self.state["prasasti"]:
            return False
        self.state["prasasti"].append(nick)
        self.save()
        return True

    def scoreboard(self) -> dict:
        return {
            "session": dict(self.state["session"]),
            "allTime": dict(self.state["allTime"]),
            "streak": dict(self.state["streak"]),
            "hallOfFame": list(self.state["hallOfFame"]),
            "prasasti": list(self.state["prasasti"]),
            "recentRoundIds": self.state["roundIds"][-20:],
        }
