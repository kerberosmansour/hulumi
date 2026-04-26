#!/usr/bin/env bash
# populate-github-app-secret.sh — write a GitHub App credential JSON
# (app_id + private_key) into the AWS Secrets Manager container that
# @hulumi/k8s-baseline.GitHubAppCredential provisioned.
#
# Usage:
#   populate-github-app-secret.sh <SECRET_ID> <APP_ID> <PEM_PATH>
#
# Where:
#   SECRET_ID   — AWS Secrets Manager secret name or ARN (the component output)
#   APP_ID      — GitHub App's numeric ID
#   PEM_PATH    — path to the App's private key PEM file on disk
#
# Side-effects:
#   - Calls AWS CLI's `secretsmanager put-secret-value`
#   - Writes a structured `security_event.github_app_secret_populated` line to stderr (no value bytes)
#   - On any failure, scrubs any temp files and exits non-zero

set -euo pipefail

scratch=""
cleanup() {
  if [ -n "${scratch}" ] && [ -f "${scratch}" ]; then
    # shred-then-remove if shred is available; else just remove.
    if command -v shred >/dev/null 2>&1; then
      shred -u "${scratch}" 2>/dev/null || rm -f "${scratch}"
    else
      rm -f "${scratch}"
    fi
  fi
}
trap cleanup EXIT INT TERM

if [ "$#" -ne 3 ]; then
  echo "usage: $0 <SECRET_ID> <APP_ID> <PEM_PATH>" >&2
  exit 2
fi

SECRET_ID="$1"
APP_ID="$2"
PEM_PATH="$3"

if [ -z "${SECRET_ID}" ] || [ -z "${APP_ID}" ] || [ -z "${PEM_PATH}" ]; then
  echo "error: SECRET_ID, APP_ID, PEM_PATH must all be non-empty" >&2
  exit 2
fi

# Reject metacharacters in SECRET_ID — guards against injection if a caller
# passes the value through unsanitized shell.
case "${SECRET_ID}" in
  *[\;\|\&\`\$\(\)]*)
    echo "error: SECRET_ID contains shell metacharacters; refusing" >&2
    exit 2
    ;;
esac

if [ ! -f "${PEM_PATH}" ]; then
  echo "error: PEM file not found: ${PEM_PATH}" >&2
  exit 2
fi

if ! command -v aws >/dev/null 2>&1; then
  echo "error: aws CLI not on PATH" >&2
  exit 2
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "error: jq not on PATH" >&2
  exit 2
fi

scratch="$(mktemp)"
chmod 600 "${scratch}"

# Build the JSON payload with jq's -Rs to safely JSON-escape the PEM content.
jq -nRs --arg app_id "${APP_ID}" \
  '{app_id: $app_id, private_key: input_filename | ., private_key_path: input_filename}' \
  </dev/null >/dev/null  # prime jq's input so the next call has a clean state

PRIVATE_KEY_JSON=$(jq -Rs '.' < "${PEM_PATH}")
PAYLOAD=$(jq -n --arg app_id "${APP_ID}" --argjson private_key "${PRIVATE_KEY_JSON}" \
  '{app_id: $app_id, private_key: $private_key}')

printf '%s' "${PAYLOAD}" > "${scratch}"

aws secretsmanager put-secret-value \
  --secret-id "${SECRET_ID}" \
  --secret-string "file://${scratch}" \
  >/dev/null

# Structured audit line — no value bytes.
printf 'security_event.github_app_secret_populated secret_id=%s app_id=%s\n' \
  "${SECRET_ID}" "${APP_ID}" >&2

exit 0
