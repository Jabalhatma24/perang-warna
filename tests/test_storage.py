import json

from storage import Storage

CODES = ["ASIA", "OCEANIA"]


def make(tmp_path, **kwargs):
    return Storage(tmp_path / "wins.json", CODES, **kwargs)


def test_round_is_recorded_once(tmp_path):
    store = make(tmp_path)
    assert store.record_round("r1", "ASIA", None) is True
    assert store.record_round("r1", "ASIA", None) is False
    assert store.state["session"]["ASIA"] == 1
    assert store.state["allTime"]["ASIA"] == 1


def test_session_resets_on_restart_but_all_time_stays(tmp_path):
    make(tmp_path).record_round("r1", "ASIA", {"id": "1", "nick": "Budi", "coins": 5})
    store = make(tmp_path)
    assert store.state["session"]["ASIA"] == 0
    assert store.state["allTime"]["ASIA"] == 1
    assert store.state["hallOfFame"][0]["nick"] == "Budi"
    assert store.record_round("r1", "ASIA", None) is False


def test_keep_session_and_reset_all(tmp_path):
    make(tmp_path).record_round("r1", "ASIA", {"id": "1", "nick": "Budi", "coins": 5})
    kept = make(tmp_path, keep_session=True)
    assert kept.state["session"]["ASIA"] == 1
    wiped = make(tmp_path, reset_all=True)
    assert wiped.state["allTime"]["ASIA"] == 0
    assert wiped.state["hallOfFame"] == []


def test_streak_counts_and_breaks(tmp_path):
    store = make(tmp_path)
    store.record_round("r1", "ASIA", None)
    store.record_round("r2", "ASIA", None)
    assert store.state["streak"] == {"team": "ASIA", "count": 2}
    store.record_round("r3", "OCEANIA", None)
    assert store.state["streak"] == {"team": "OCEANIA", "count": 1}


def test_hall_of_fame_keeps_last_five(tmp_path):
    store = make(tmp_path)
    for index in range(7):
        store.record_round(f"r{index}", "ASIA", {"id": str(index), "nick": f"N{index}", "coins": index})
    names = [entry["nick"] for entry in store.state["hallOfFame"]]
    assert names == ["N6", "N5", "N4", "N3", "N2"]


def test_simulated_round_stays_out_of_permanent_records(tmp_path):
    store = make(tmp_path)
    store.record_round("r1", "ASIA", {"id": "1", "nick": "Bot", "coins": 9}, count_permanent=False)
    assert store.state["session"]["ASIA"] == 1
    assert store.state["allTime"]["ASIA"] == 0
    assert store.state["hallOfFame"] == []


def test_no_winner_is_remembered_but_not_counted(tmp_path):
    store = make(tmp_path)
    assert store.record_round("r1", None, None) is True
    assert store.record_round("r1", None, None) is False
    assert sum(store.state["session"].values()) == 0


def test_corrupt_file_is_set_aside(tmp_path):
    path = tmp_path / "wins.json"
    path.write_text("{bukan json", encoding="utf-8")
    store = Storage(path, CODES)
    assert store.state["allTime"]["ASIA"] == 0
    assert list(tmp_path.glob("wins.json.rusak-*"))
    assert json.loads(path.read_text(encoding="utf-8"))["allTime"]["ASIA"] == 0


def test_no_temp_files_left_behind(tmp_path):
    store = make(tmp_path)
    store.record_round("r1", "ASIA", None)
    assert [p.name for p in tmp_path.iterdir()] == ["wins.json"]


def test_prasasti_is_unique_and_reset_per_session(tmp_path):
    store = make(tmp_path)
    assert store.add_prasasti("Sultan") is True
    assert store.add_prasasti("Sultan") is False
    assert make(tmp_path).state["prasasti"] == []


def test_continental_wins_never_touch_the_old_nusantara_file(tmp_path, monkeypatch):
    import server

    monkeypatch.setattr(server, "DATA_DIR", tmp_path)
    old = tmp_path / "wins.json"
    old.write_text('{"allTime": {"JAWA": 4, "SULAWESI": 1}}', encoding="utf-8")
    before = old.read_bytes()

    for simulate in (False, True):
        path = server.wins_path(simulate)
        assert path != old
        Storage(path, ["ASIA", "EUROPE"]).record_round("r1", "ASIA", None)
    assert old.read_bytes() == before
