#!/usr/bin/env python3
# Copyright 2026 Sherif Mansour and contributors.
# SPDX-License-Identifier: Apache-2.0
"""Check or update the current README banner from an explicit reviewed local tag."""
import argparse
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
PACKAGES = ("baseline", "policies", "drift", "k8s-baseline", "cloudflare-baseline", "platform-patterns")
TAG = re.compile(r"v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)")
PREFIX = "Current coordinated release:"


def banner(tag, root_manifest, versions):
    if not isinstance(tag, str) or not TAG.fullmatch(tag) or len(tag) > 80:
        raise ValueError("An explicit stable v-prefixed release tag is required")
    version = tag[1:]
    if len(versions) != len(PACKAGES) or any(value != version for value in versions):
        raise ValueError("All six package versions must match the selected tag")
    engine = root_manifest.get("engines", {}).get("node", "")
    if not isinstance(engine, str) or not re.fullmatch(r">=\d+\.\d+\.\d+", engine):
        raise ValueError("Expected an explicit minimum Node.js version")
    return (f"{PREFIX} **{version}**. Requires Node.js {engine}. Read the "
            f"[security changes and migration](./docs/release/v{version}-release-notes.md) "
            "before upgrading existing stacks.")


def replace_banner(source, line):
    lines = source.splitlines(keepends=True)
    matches = [i for i, value in enumerate(lines) if value.startswith(PREFIX)]
    if len(matches) != 1:
        raise ValueError("README must contain exactly one current-release banner")
    i = matches[0]
    ending = "\r\n" if lines[i].endswith("\r\n") else "\n" if lines[i].endswith("\n") else ""
    lines[i] = line + ending
    return "".join(lines)


def tagged_json(tag, path):
    ref = f"refs/tags/{tag}:{path}"
    size = subprocess.run(["git", "cat-file", "-s", ref], cwd=ROOT,
                          capture_output=True, check=True, timeout=5)
    if not 0 < int(size.stdout) <= 1048576:
        raise ValueError("Tagged metadata exceeds the 1 MiB limit")
    result = subprocess.run(["git", "show", ref], cwd=ROOT,
                            capture_output=True, check=True, timeout=5)
    if len(result.stdout) > 1048576:
        raise ValueError("Tagged metadata exceeds the 1 MiB limit")
    value = json.loads(result.stdout)
    if not isinstance(value, dict):
        raise ValueError("Expected a manifest object")
    return value


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tag", required=True, help="Already-reviewed local release tag, e.g. v3.0.0")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--write", action="store_true")
    args = parser.parse_args(argv)
    try:
        if not TAG.fullmatch(args.tag) or len(args.tag) > 80:
            raise ValueError("Invalid release tag")
        if not (ROOT / f"docs/release/{args.tag}-release-notes.md").is_file():
            raise ValueError("Matching local migration notes are required")
        root = tagged_json(args.tag, "package.json")
        versions = [tagged_json(args.tag, f"packages/{name}/package.json").get("version") for name in PACKAGES]
        path = ROOT / "README.md"
        source = path.read_bytes().decode("utf-8")
        updated = replace_banner(source, banner(args.tag, root, versions))
        if args.write:
            if updated != source:
                path.write_bytes(updated.encode("utf-8"))
            print("Current-release banner matches the selected tag; historical text preserved.")
            return 0
        if updated != source:
            print("Current-release banner differs; review the tag before running --write.", file=sys.stderr)
            return 1
        print("Current-release banner matches the selected tag.")
        return 0
    except (ValueError, OSError, UnicodeError, AttributeError, subprocess.SubprocessError):
        print("Release metadata check failed. Check the local tag, coordinated manifests and migration notes.", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
