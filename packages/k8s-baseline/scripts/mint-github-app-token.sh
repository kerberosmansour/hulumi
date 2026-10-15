#!/usr/bin/env bash
# Invoke the GitHubAppCredential broker. The caller never receives or reads the
# GitHub App private key; the broker enforces the component-bound scope.

set -euo pipefail
export LC_ALL=C

readonly MAX_RESPONSE_BYTES=16384

scratch=""
cleanup() {
  if [ -n "${scratch}" ] && [ -f "${scratch}" ]; then
    if command -v shred >/dev/null 2>&1; then
      shred -u "${scratch}" 2>/dev/null || rm -f "${scratch}"
    else
      rm -f "${scratch}"
    fi
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

fail() {
  printf 'security_event.github_app_broker_invoke_failed reason=%s\n' "$1" >&2
  exit "${2:-1}"
}

if [ "$#" -ne 3 ]; then
  echo "usage: $0 <BROKER_FUNCTION_NAME_OR_ARN> <REPO_OWNER> <REPO_NAME>" >&2
  exit 2
fi

BROKER_FUNCTION="$1"
REPO_OWNER="$2"
REPO_NAME="$3"

if [ -z "${BROKER_FUNCTION}" ] || [ -z "${REPO_OWNER}" ] || [ -z "${REPO_NAME}" ]; then
  fail "required_argument_missing" 2
fi
if [[ ! "${REPO_OWNER}" =~ ^[A-Za-z0-9]([A-Za-z0-9-]{0,37}[A-Za-z0-9])?$ ]]; then
  fail "invalid_repo_owner" 2
fi
if [[ ! "${REPO_NAME}" =~ ^[A-Za-z0-9_.-]{1,100}$ ]] || [ "${REPO_NAME}" = "." ] || [ "${REPO_NAME}" = ".." ]; then
  fail "invalid_repo_name" 2
fi

for command in aws jq; do
  command -v "${command}" >/dev/null 2>&1 || fail "${command}_missing" 2
done

REQUEST=$(jq -cn --arg owner "${REPO_OWNER}" --arg repository "${REPO_NAME}" \
  '{owner: $owner, repository: $repository}') || fail "request_build_failed"

scratch="$(mktemp)"
chmod 600 "${scratch}"

INVOKE_METADATA=$(aws lambda invoke \
  --function-name "${BROKER_FUNCTION}" \
  --cli-binary-format raw-in-base64-out \
  --payload "${REQUEST}" \
  "${scratch}" 2>/dev/null) || fail "broker_invoke_failed"

if ! printf '%s' "${INVOKE_METADATA}" | jq -e 'type == "object"' >/dev/null; then
  fail "invalid_invoke_metadata"
fi
if printf '%s' "${INVOKE_METADATA}" | jq -e '.FunctionError != null' >/dev/null; then
  fail "broker_function_error"
fi

RESPONSE_BYTES=$(wc -c < "${scratch}" | tr -d '[:space:]')
if [ "${RESPONSE_BYTES}" -le 0 ] || [ "${RESPONSE_BYTES}" -gt "${MAX_RESPONSE_BYTES}" ]; then
  fail "invalid_broker_response"
fi

TOKEN=$(jq -er '.token | select(type == "string" and length > 0 and length <= 4096)' \
  "${scratch}" 2>/dev/null) || fail "invalid_broker_response"
if ! jq -e '.expiresAt | type == "string" and test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?Z$")' \
  "${scratch}" >/dev/null 2>&1; then
  fail "invalid_broker_response"
fi

printf '%s\n' "${TOKEN}"
