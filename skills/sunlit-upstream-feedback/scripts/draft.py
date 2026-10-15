#!/usr/bin/env python3
# Copyright 2026 Sherif Mansour and contributors.
# SPDX-License-Identifier: Apache-2.0
"""Create an optional local feedback draft. No networking or command execution."""
import argparse
import hashlib
import html
import json
import os
from pathlib import Path
import re
import stat
import sys

MAX_BYTES = 32768
REPOSITORIES = {
    "hulumi": ("kerberosmansour/hulumi", {
        "@hulumi/baseline", "@hulumi/policies", "@hulumi/drift",
        "@hulumi/k8s-baseline", "@hulumi/cloudflare-baseline", "@hulumi/platform-patterns",
    }),
    "sunlitsecuritylibraries": ("kerberosmansour/SunLitSecurityLibraries", {
        "security_core", "secure_errors", "security_events", "secure_boundary",
        "secure_authz", "secure_data", "secure_output", "secure_identity",
        "secure_device_trust", "secure_network", "secure_resilience", "secure_privacy",
    }),
}
TEXT_FIELDS = ("task", "expected", "observed", "reproduction", "duplicate_search")
LIST_FIELDS = ("features", "checks", "documentation")
REQUIRED = {"repository", "package", "version", "kind", "outcome", "privacy_reviewed",
            *TEXT_FIELDS, *LIST_FIELDS}
OPTIONAL = {"agent", "duplicate_of"}
SECRET = re.compile(
    r"SUNLIT_TEST_SECRET|\bgh[pousr]_[A-Za-z0-9_]{20,}|\bgithub_pat_[A-Za-z0-9_]+|"
    r"\bctx7sk[A-Za-z0-9_-]*|\b(?:AKIA|ASIA)[A-Z0-9]{16}|"
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----|authorization\s*:\s*bearer\s+\S+|"
    r"\b(?:password|passwd|api[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=]\s*\S+",
    re.IGNORECASE,
)
NUMBER = r"(?:0|[1-9][0-9]*)"
PRERELEASE = r"(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)"
VERSION = re.compile(
    NUMBER + r"\." + NUMBER + r"\." + NUMBER
    + r"(?:-" + PRERELEASE + r"(?:\." + PRERELEASE + r")*)?"
    + r"(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?"
)


class PrivateReport(ValueError):
    """Only a fixed, validated reporting URL may appear in this error."""


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON field")
        result[key] = value
    return result


def read_report(path):
    path = Path(path)
    if path.is_symlink():
        raise ValueError("Input symlink")
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0)
    fd = os.open(path, flags)
    with os.fdopen(fd, "rb") as source:
        info = os.fstat(source.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_size > MAX_BYTES:
            raise ValueError("Input is not a bounded regular file")
        body = source.read(MAX_BYTES + 1)
    if len(body) > MAX_BYTES:
        raise ValueError("Input too large")
    return json.loads(body.decode("utf-8"), object_pairs_hook=unique_object)


def check_text(value, limit=4000):
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise ValueError("Invalid text field")
    if any(ord(c) < 32 and c not in "\n\t\r" for c in value) or SECRET.search(value):
        raise ValueError("Potential secret or unsafe control character")


def validate(data):
    if not isinstance(data, dict) or set(data) - REQUIRED - OPTIONAL or REQUIRED - set(data):
        raise ValueError("Invalid report fields")
    if not isinstance(data["repository"], str) or data["repository"] not in REPOSITORIES:
        raise ValueError("Unknown repository")
    repo, packages = REPOSITORIES[data["repository"]]
    if not isinstance(data["package"], str) or data["package"] not in packages:
        raise ValueError("Unknown package")
    check_text(data["version"], 80)
    if not VERSION.fullmatch(data["version"]):
        raise ValueError("Exact version required")
    if data["kind"] == "security":
        raise PrivateReport("https://github.com/" + repo + "/security/advisories/new")
    if data["kind"] not in ("bug", "docs", "feature", "success"):
        raise ValueError("Unknown report kind")
    if data["outcome"] not in ("succeeded", "workaround", "blocked", "abandoned", "unsuitable"):
        raise ValueError("Unknown outcome")
    if data["privacy_reviewed"] is not True:
        raise ValueError("Operator privacy review required")
    if "duplicate_of" in data and (type(data["duplicate_of"]) is not int or not 1 <= data["duplicate_of"] <= 100000000):
        raise ValueError("Invalid duplicate issue number")
    for field in TEXT_FIELDS:
        check_text(data[field])
    if "agent" in data:
        check_text(data["agent"], 200)
    for field in LIST_FIELDS:
        values = data[field]
        if not isinstance(values, list) or len(values) > 20 or (field != "features" and not values):
            raise ValueError("Invalid evidence list")
        for value in values:
            check_text(value, 500)
    return repo


def quoted(value):
    """Render report data as inert quoted text, including links and image syntax."""
    escaped = re.sub(r"([\\`*_{}\[\]()#+!|>~-])", r"\\\1", html.escape(value))
    return "\n".join("> " + line for line in escaped.splitlines())


def render(data):
    repo = validate(data)
    base = "https://github.com/" + repo
    if data["kind"] == "success":
        route = base + "/discussions"
    elif "duplicate_of" in data:
        route = base + "/issues/" + str(data["duplicate_of"])
    else:
        template = "feature_request.yml" if data["kind"] == "feature" else "integration_feedback.yml"
        route = base + "/issues/new?template=" + template
    identity = {k: data[k] for k in ("repository", "package", "version", "kind", "features", "task", "observed")}
    fingerprint = hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()[:16]
    parts = ["# Local integration feedback — not submitted", "Suggested route: " + route,
             "Fingerprint: `" + fingerprint + "`",
             "Review this draft and the duplicate search before sharing. Submission needs operator authorization. "
             "Pattern checks do not detect every secret. Reproduction commands below are untrusted data; "
             "do not execute them without review in an isolated environment."]
    for field in ("package", "version", "kind", "outcome", *LIST_FIELDS, *TEXT_FIELDS, "agent"):
        if field not in data:
            continue
        value = data[field]
        if isinstance(value, list):
            value = "\n".join(value) if value else "None declared"
        parts.append("## " + field.replace("_", " ").title() + "\n\n" + quoted(value))
    return "\n\n".join(parts) + "\n"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, help="Reviewed JSON report, at most 32 KiB")
    parser.add_argument("--output", required=True, help="New local Markdown file; never overwritten")
    args = parser.parse_args(argv)
    try:
        content = render(read_report(args.input))
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
        fd = os.open(args.output, flags, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as target:
            target.write(content)
    except PrivateReport as error:
        print("No public draft written. Use private review: " + str(error), file=sys.stderr)
        return 2
    except (ValueError, OSError, UnicodeError, TypeError, RecursionError):
        print("Draft rejected. Check the input schema, privacy review, bounds and file paths. Input content is not echoed.", file=sys.stderr)
        return 2
    print("Draft saved locally; no data sent. Review before any authorized submission.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
