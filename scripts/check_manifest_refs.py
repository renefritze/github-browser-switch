#!/usr/bin/env python3
"""
Validate that every local file path referenced in extension/manifest.json
actually exists on disk.

Exit code 0 = all references are satisfied.
Exit code 1 = one or more files are missing.

Usage:
    python scripts/check_manifest_refs.py
"""

import json
import sys
from pathlib import Path

REPO_ROOT     = Path(__file__).parent.parent
EXTENSION_DIR = REPO_ROOT / "extension"
MANIFEST_PATH = EXTENSION_DIR / "manifest.json"


def collect_paths(obj, found: list[str]) -> None:
    """Recursively walk the manifest JSON and collect string values."""
    if isinstance(obj, dict):
        for v in obj.values():
            collect_paths(v, found)
    elif isinstance(obj, list):
        for item in obj:
            collect_paths(item, found)
    elif isinstance(obj, str):
        found.append(obj)


def looks_like_local_path(s: str) -> bool:
    """
    Return True if the string looks like a local file path (not a URL,
    permission name, match pattern, or other non-path string).
    """
    if not s:
        return False
    if s.startswith(("http://", "https://", "chrome://", "about:")):
        return False
    if "<" in s or ">" in s:        # match patterns like <all_urls>
        return False
    if "://" in s:                  # any scheme URL
        return False
    if s.startswith("*"):            # glob match patterns
        return False
    # Must end with a known extension to be treated as a file reference
    return any(s.endswith(ext) for ext in (".html", ".js", ".css", ".png", ".svg", ".json"))


def main() -> int:
    if not MANIFEST_PATH.exists():
        print(f"ERROR: manifest not found at {MANIFEST_PATH}", file=sys.stderr)
        return 1

    with MANIFEST_PATH.open() as f:
        manifest = json.load(f)

    all_strings: list[str] = []
    collect_paths(manifest, all_strings)

    file_refs = [s for s in all_strings if looks_like_local_path(s)]

    errors: list[str] = []
    for ref in file_refs:
        candidate = EXTENSION_DIR / ref
        if not candidate.exists():
            errors.append(f"  MISSING: {ref}  (expected at {candidate})")

    if errors:
        print("manifest.json references missing files:")
        for e in errors:
            print(e)
        return 1

    print(f"OK — all {len(file_refs)} manifest file references exist:")
    for ref in file_refs:
        print(f"  ✓ {ref}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
