#!/usr/bin/env bash
set -euo pipefail

version="3.268.0"
archive="pulumi-v${version}-linux-x64.tar.gz"
expected_sha256="903cafeaa9f6327e4bf53a8b7b99ae660f26198acfa804a2f982bf5de3f1de0b"
install_root="${RUNNER_TEMP:?RUNNER_TEMP is required}/pulumi-${version}"
download="${RUNNER_TEMP}/${archive}"

curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
  "https://github.com/pulumi/pulumi/releases/download/v${version}/${archive}" \
  --output "$download"
printf '%s  %s\n' "$expected_sha256" "$download" | sha256sum --check --strict
mkdir -p "$install_root"
tar --extract --gzip --file "$download" --directory "$install_root" \
  --no-same-owner --no-same-permissions
test "$("$install_root/pulumi/pulumi" version)" = "v${version}"
echo "$install_root/pulumi" >> "${GITHUB_PATH:?GITHUB_PATH is required}"
