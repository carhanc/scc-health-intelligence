"""Puts scripts/ on sys.path so standalone scripts (not a package) can be
imported directly as modules in tests, e.g. `import fetch_data_artifact`."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
