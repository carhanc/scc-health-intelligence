#!/usr/bin/env python3
"""Fail if any tracked file references a sibling-repo path outside the project root.

Enforces DEC-001 (clean-room boundary). Run via `make audit` and in CI.
Approved locations (project root, data/, warehouse/, OS temp for in-progress
downloads) are allowed; any absolute reference to a sibling directory next to
this project (e.g. ~/Desktop/scc-caregap-atlas) is not.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

FORBIDDEN_PATTERNS = [
    re.compile(r"scc-caregap-atlas", re.IGNORECASE),
    re.compile(r"caregap[-_]?atlas", re.IGNORECASE),
]

# Files that are allowed to mention the forbidden project name because they
# document the clean-room boundary itself (this script, governance docs).
ALLOWLISTED_FILES = {
    "scripts/check_clean_room.py",
    "CLAUDE.md",
    "PLAN.md",
    "DECISIONS.md",
    "TASKS.md",
    "BOOTSTRAP_PROMPT.txt",
    "CONTINUATION_PROMPT.txt",
    "FINAL_VERIFICATION_PROMPT.txt",
    "BUILD_PACK_MANIFEST.md",
    "README_FIRST.md",
    "START_HERE.txt",
    "MASTER_BUILD_PROMPT.md",
}


def tracked_files(repo_root: Path) -> list[str]:
    result = subprocess.run(
        ["git", "ls-files"],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=True,
    )
    return [line for line in result.stdout.splitlines() if line.strip()]


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    violations: list[str] = []

    for rel_path in tracked_files(repo_root):
        if rel_path in ALLOWLISTED_FILES:
            continue
        full_path = repo_root / rel_path
        if not full_path.is_file():
            continue
        try:
            text = full_path.read_text(errors="ignore")
        except OSError:
            continue
        for pattern in FORBIDDEN_PATTERNS:
            if pattern.search(text):
                violations.append(rel_path)
                break

    if violations:
        print("Clean-room boundary violation (DEC-001): forbidden reference found in:")
        for v in violations:
            print(f"  - {v}")
        print("\nRemove any reference to the sibling repository before committing.")
        return 1

    print("Clean-room check passed: no sibling-repository references found.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
