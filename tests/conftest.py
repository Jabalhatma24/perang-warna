import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from parser import Moderator, Wilayah  # noqa: E402


@pytest.fixture(scope="session")
def wilayah():
    return Wilayah.load(ROOT / "data" / "wilayah.json")


@pytest.fixture(scope="session")
def moderator():
    return Moderator.load(ROOT / "data" / "blocklist.txt")
