"""Uji alat di folder tools/ tanpa jaringan dan tanpa menyentuh OBS sungguhan."""
import json
import os
import re
import stat
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

import get_stream_key  # noqa: E402
import setup_obs_profile as obs  # noqa: E402

SAMPLE_INI = """[General]
Name=ContinentalWar

[Video]
BaseCX=1920
BaseCY=1080
OutputCX=1920
OutputCY=1080
FPSCommon=30
ScaleType=lanczos
ColorSpace=709

[AdvOut]
RecFilePath=/home/me/Video
AudioEncoder=libfdk_aac
"""


def test_key_tool_is_pinned_to_a_full_commit():
    assert re.fullmatch(r"[0-9a-f]{40}", get_stream_key.PINNED_COMMIT)


def test_key_tool_runtime_skips_build_only_packages():
    joined = " ".join(get_stream_key.RUNTIME_PACKAGES)
    assert "nuitka" not in joined and "clang" not in joined


@pytest.mark.parametrize(
    "line, expected",
    [
        ("Got Streamlabs OAuth token: abc.def-123\n", "Got Streamlabs OAuth token: <disembunyikan>\n"),
        ("Opening browser for Streamlabs login\n", "Opening browser for Streamlabs login\n"),
    ],
)
def test_token_is_hidden_from_terminal(line, expected):
    assert get_stream_key.redact(line) == expected


def test_secrets_folder_is_ignored_by_git():
    assert "tools/.streamlabs-keygen/" in (ROOT / ".gitignore").read_text(encoding="utf-8").splitlines()


def test_obs_settings_keep_other_values(tmp_path):
    profile = tmp_path / "ContinentalWar"
    profile.mkdir()
    (profile / "basic.ini").write_text(SAMPLE_INI, encoding="utf-8")

    backup = obs.configure(profile, "nvenc", 6000, 60)

    ini = obs.read_ini(profile / "basic.ini")
    assert ini["Video"]["BaseCX"] == "1080" and ini["Video"]["OutputCY"] == "1920"
    assert ini["Video"]["FPSCommon"] == "60" and ini["Video"]["FPSType"] == "0"
    assert ini["AdvOut"]["Encoder"] == "obs_nvenc_h264_tex"
    assert ini["Output"]["Mode"] == "Advanced"
    # Nilai lain dan huruf besar pada nama kunci tetap utuh, karena OBS membedakannya.
    assert ini["AdvOut"]["RecFilePath"] == "/home/me/Video"
    assert ini["General"]["Name"] == "ContinentalWar"
    assert "BaseCX=1080" in (profile / "basic.ini").read_text(encoding="utf-8")

    encoder = json.loads((profile / "streamEncoder.json").read_text(encoding="utf-8"))
    assert encoder["bitrate"] == 6000 and encoder["rate_control"] == "CBR" and encoder["keyint_sec"] == 2
    assert "BaseCX=1920" in (backup / "basic.ini").read_text(encoding="utf-8")
    # OBS memindai folder profil, jadi backup tidak boleh berada di sampingnya.
    assert backup.parent != profile.parent


def test_obs_missing_profile_is_a_clear_error(tmp_path):
    with pytest.raises(SystemExit):
        obs.configure(tmp_path / "TidakAda", "nvenc", 6000, 60)


def test_obs_missing_config_is_a_clear_error(tmp_path):
    with pytest.raises(SystemExit):
        obs.find_config_dir([tmp_path / "kosong"])


def test_obs_tool_never_writes_a_stream_key(tmp_path):
    profile = tmp_path / "ContinentalWar"
    profile.mkdir()
    (profile / "basic.ini").write_text(SAMPLE_INI, encoding="utf-8")
    (profile / "service.json").write_text('{"settings": {"key": "rahasia"}}', encoding="utf-8")
    obs.configure(profile, "nvenc", 6000, 60)
    assert json.loads((profile / "service.json").read_text(encoding="utf-8"))["settings"]["key"] == "rahasia"


def make_local_repo(path, script='print("halo")\n'):
    """Repo tiruan di disk, supaya tes tidak mengunduh atau menjalankan kode pihak luar."""
    path.mkdir()
    def git(*args):
        env = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}
        return subprocess.run(["git", "-C", str(path), *args], check=True, capture_output=True, text=True, env=env).stdout.strip()
    git("init", "--quiet")
    (path / get_stream_key.ENTRY_POINT).write_text(script, encoding="utf-8")
    git("add", ".")
    git("commit", "--quiet", "-m", "pertama")
    first = git("rev-parse", "HEAD")
    (path / "baru.txt").write_text("commit lebih baru", encoding="utf-8")
    git("add", ".")
    git("commit", "--quiet", "-m", "kedua")
    return first, git("rev-parse", "HEAD")


def test_key_tool_checks_out_exactly_the_pinned_commit(tmp_path):
    first, _ = make_local_repo(tmp_path / "asal")
    repo = get_stream_key.fetch_repo(tmp_path / "alat", str(tmp_path / "asal"), first)
    assert get_stream_key.head_commit(repo) == first
    assert not (repo / "baru.txt").exists()
    assert (repo / "_version.py").read_text(encoding="utf-8") == get_stream_key.VERSION_FILE


def test_key_tool_refuses_unknown_commit(tmp_path):
    make_local_repo(tmp_path / "asal")
    with pytest.raises(SystemExit):
        get_stream_key.fetch_repo(tmp_path / "alat", str(tmp_path / "asal"), "0" * 40)


def test_key_tool_hides_token_and_protects_config(tmp_path, capsys):
    script = (
        'print("Got Streamlabs OAuth token: RAHASIA123")\n'
        'open("config.json", "w").write("{}")\n'
    )
    tool = tmp_path / "alat"
    (tool / "repo").parent.mkdir()
    make_local_repo(tool / "repo", script)

    assert get_stream_key.launch(Path(sys.executable), tool) == 0

    output = capsys.readouterr().out
    assert "RAHASIA123" not in output and "<disembunyikan>" in output
    assert stat.S_IMODE((tool / "repo" / "config.json").stat().st_mode) == 0o600


def test_obs_launcher_selects_nvidia_and_is_valid_bash():
    script = ROOT / "tools" / "start_obs.sh"
    assert subprocess.run(["bash", "-n", str(script)]).returncode == 0
    assert os.access(script, os.X_OK)
    text = script.read_text(encoding="utf-8")
    assert "__NV_PRIME_RENDER_OFFLOAD=1" in text and "--profile ContinentalWar" in text
