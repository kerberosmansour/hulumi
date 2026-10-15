#!/usr/bin/env bash
# Populate the Secrets Manager container provisioned by GitHubAppCredential.
# Repository and permission scope is mandatory and must match the component's
# IaC-owned hulumi:github-app-scope-sha256 tag.

set -euo pipefail
export LC_ALL=C

readonly SCOPE_TAG='hulumi:github-app-scope-sha256'
readonly MAX_SCOPE_BYTES=16384
readonly MAX_SECRET_BYTES=65536
readonly MAX_PEM_BYTES=49152

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
  printf 'security_event.github_app_secret_population_failed reason=%s\n' "$1" >&2
  exit "${2:-1}"
}

if [ "$#" -ne 5 ]; then
  echo "usage: $0 <SECRET_ID> <APP_ID> <PEM_PATH> <REPOS_JSON> <PERMISSIONS_JSON>" >&2
  echo "error: explicit component-matching repository and permission scope is required" >&2
  exit 2
fi

SECRET_ID="$1"
APP_ID="$2"
PEM_PATH="$3"
REPOS_JSON_INPUT="$4"
PERMISSIONS_JSON_INPUT="$5"

if [ -z "${SECRET_ID}" ] || [ -z "${APP_ID}" ] || [ -z "${PEM_PATH}" ]; then
  fail "required_argument_missing" 2
fi
if [[ ! "${APP_ID}" =~ ^[0-9]+$ ]]; then
  fail "invalid_app_id" 2
fi
if [ ! -f "${PEM_PATH}" ] || [ -L "${PEM_PATH}" ]; then
  fail "invalid_pem_file" 2
fi
PEM_BYTES=$(wc -c < "${PEM_PATH}" | tr -d '[:space:]')
if [ "${PEM_BYTES}" -le 0 ] || [ "${PEM_BYTES}" -gt "${MAX_PEM_BYTES}" ]; then
  fail "invalid_pem_size" 2
fi

for command in jq openssl awk aws; do
  command -v "${command}" >/dev/null 2>&1 || fail "${command}_missing" 2
done

if ! printf '%s' "${REPOS_JSON_INPUT}" | jq -e '
  type == "array" and
  length > 0 and length <= 500 and
  length == (unique | length) and
  ((index("*") == null) or length == 1) and
  all(.[];
    type == "string" and
    (. == "*" or
      (test("^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?/[A-Za-z0-9_.-]{1,100}$") and
       (split("/")[1] != ".") and (split("/")[1] != ".."))))
' >/dev/null; then
  fail "invalid_repositories" 2
fi
if ! printf '%s' "${PERMISSIONS_JSON_INPUT}" | jq -e '
  type == "object" and
  length > 0 and length <= 100 and
  all(to_entries[];
    (.key | test("^[a-z][a-z0-9_]{0,63}$")) and
    (.value == "read" or .value == "write" or .value == "admin"))
' >/dev/null; then
  fail "invalid_permissions" 2
fi

CANONICAL_SCOPE=$(jq -cn \
  --argjson repos "${REPOS_JSON_INPUT}" \
  --argjson permissions "${PERMISSIONS_JSON_INPUT}" \
  '{permissions: ($permissions | to_entries | sort_by(.key) | from_entries), repos: ($repos | sort)}')
SCOPE_BYTES=${#CANONICAL_SCOPE}
if [ "${SCOPE_BYTES}" -gt "${MAX_SCOPE_BYTES}" ]; then
  fail "scope_too_large" 2
fi
SCOPE_SHA=$(printf '%s' "${CANONICAL_SCOPE}" | openssl dgst -sha256 | awk '{print $NF}')
if [[ ! "${SCOPE_SHA}" =~ ^[0-9a-f]{64}$ ]]; then
  fail "scope_hash_failed"
fi

EXPECTED_SCOPE_SHA=$(aws secretsmanager describe-secret \
  --secret-id "${SECRET_ID}" \
  --query "Tags[?Key=='${SCOPE_TAG}'].Value | [0]" \
  --output text 2>/dev/null) || fail "scope_tag_lookup_failed"
if [[ ! "${EXPECTED_SCOPE_SHA}" =~ ^[0-9a-f]{64}$ ]]; then
  fail "scope_tag_missing"
fi
if [ "${SCOPE_SHA}" != "${EXPECTED_SCOPE_SHA}" ]; then
  fail "scope_mismatch"
fi

scratch="$(mktemp)"
chmod 600 "${scratch}"
jq -cn \
  --arg app_id "${APP_ID}" \
  --rawfile private_key "${PEM_PATH}" \
  --argjson repos "${REPOS_JSON_INPUT}" \
  --argjson permissions "${PERMISSIONS_JSON_INPUT}" \
  --arg scope_sha256 "${SCOPE_SHA}" \
  '{app_id: $app_id, private_key: $private_key, permissions: ($permissions | to_entries | sort_by(.key) | from_entries), repos: ($repos | sort), scope_sha256: $scope_sha256}' \
  > "${scratch}" || fail "secret_payload_build_failed"
PAYLOAD_BYTES=$(wc -c < "${scratch}" | tr -d '[:space:]')
if [ "${PAYLOAD_BYTES}" -le 0 ] || [ "${PAYLOAD_BYTES}" -gt "${MAX_SECRET_BYTES}" ]; then
  fail "secret_payload_too_large" 2
fi

aws secretsmanager put-secret-value \
  --secret-id "${SECRET_ID}" \
  --secret-string "file://${scratch}" \
  >/dev/null || fail "secret_write_failed"

printf 'security_event.github_app_secret_populated scope_sha256=%s\n' "${SCOPE_SHA}" >&2
