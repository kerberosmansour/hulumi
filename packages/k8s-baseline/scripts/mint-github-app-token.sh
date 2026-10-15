#!/usr/bin/env bash
# Mint a one-hour GitHub App installation token whose repository and permission
# authority is bound to the GitHubAppCredential component scope.

set -euo pipefail
export LC_ALL=C

readonly SCOPE_TAG='hulumi:github-app-scope-sha256'
readonly MAX_SCOPE_BYTES=16384
readonly MAX_SECRET_BYTES=65536

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
  printf 'security_event.mint_failed reason=%s\n' "$1" >&2
  exit "${2:-1}"
}

if [ "$#" -ne 3 ]; then
  echo "usage: $0 <SECRET_ID> <REPO_OWNER> <REPO_NAME>" >&2
  exit 2
fi

SECRET_ID="$1"
REPO_OWNER="$2"
REPO_NAME="$3"
TARGET_REPO="${REPO_OWNER}/${REPO_NAME}"

if [ -z "${SECRET_ID}" ] || [ -z "${REPO_OWNER}" ] || [ -z "${REPO_NAME}" ]; then
  fail "required_argument_missing" 2
fi
if [[ ! "${REPO_OWNER}" =~ ^[A-Za-z0-9]([A-Za-z0-9-]{0,37}[A-Za-z0-9])?$ ]]; then
  fail "invalid_repo_owner" 2
fi
if [[ ! "${REPO_NAME}" =~ ^[A-Za-z0-9_.-]{1,100}$ ]] || [ "${REPO_NAME}" = "." ] || [ "${REPO_NAME}" = ".." ]; then
  fail "invalid_repo_name" 2
fi

for command in aws jq openssl awk curl; do
  command -v "${command}" >/dev/null 2>&1 || fail "${command}_missing" 2
done

EXPECTED_SCOPE_SHA=$(aws secretsmanager describe-secret \
  --secret-id "${SECRET_ID}" \
  --query "Tags[?Key=='${SCOPE_TAG}'].Value | [0]" \
  --output text 2>/dev/null) || fail "scope_tag_lookup_failed"
if [[ ! "${EXPECTED_SCOPE_SHA}" =~ ^[0-9a-f]{64}$ ]]; then
  fail "scope_tag_missing"
fi

SECRET_JSON=$(aws secretsmanager get-secret-value \
  --secret-id "${SECRET_ID}" \
  --query SecretString \
  --output text 2>/dev/null) || fail "sm_get_failed"
if [ "${#SECRET_JSON}" -gt "${MAX_SECRET_BYTES}" ]; then
  fail "secret_payload_too_large"
fi

APP_ID=$(printf '%s' "${SECRET_JSON}" | jq -er '.app_id | select(type == "string" and test("^[0-9]+$"))') || fail "invalid_app_id"
REPOS_JSON=$(printf '%s' "${SECRET_JSON}" | jq -ce '.repos') || fail "invalid_repositories"
PERMISSIONS_JSON=$(printf '%s' "${SECRET_JSON}" | jq -ce '.permissions') || fail "invalid_permissions"
PAYLOAD_SCOPE_SHA=$(printf '%s' "${SECRET_JSON}" | jq -er '.scope_sha256 | select(type == "string" and test("^[0-9a-f]{64}$"))') || fail "scope_digest_missing"
if ! printf '%s' "${SECRET_JSON}" | jq -e '.private_key | type == "string" and length > 0' >/dev/null; then
  fail "private_key_missing"
fi

if ! printf '%s' "${REPOS_JSON}" | jq -e '
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
  fail "invalid_repositories"
fi
if ! printf '%s' "${PERMISSIONS_JSON}" | jq -e '
  type == "object" and
  length > 0 and length <= 100 and
  all(to_entries[];
    (.key | test("^[a-z][a-z0-9_]{0,63}$")) and
    (.value == "read" or .value == "write" or .value == "admin"))
' >/dev/null; then
  fail "invalid_permissions"
fi

CANONICAL_SCOPE=$(jq -cn \
  --argjson repos "${REPOS_JSON}" \
  --argjson permissions "${PERMISSIONS_JSON}" \
  '{permissions: ($permissions | to_entries | sort_by(.key) | from_entries), repos: ($repos | sort)}')
if [ "${#CANONICAL_SCOPE}" -gt "${MAX_SCOPE_BYTES}" ]; then
  fail "scope_too_large"
fi
COMPUTED_SCOPE_SHA=$(printf '%s' "${CANONICAL_SCOPE}" | openssl dgst -sha256 | awk '{print $NF}')
if [ "${COMPUTED_SCOPE_SHA}" != "${PAYLOAD_SCOPE_SHA}" ] || [ "${COMPUTED_SCOPE_SHA}" != "${EXPECTED_SCOPE_SHA}" ]; then
  fail "scope_mismatch"
fi
if ! printf '%s' "${REPOS_JSON}" | jq -e --arg target "${TARGET_REPO}" 'index("*") != null or index($target) != null' >/dev/null; then
  fail "repo_not_allowed"
fi

REQUEST_BODY=$(jq -cn \
  --arg repo_name "${REPO_NAME}" \
  --argjson permissions "${PERMISSIONS_JSON}" \
  '{repositories: [$repo_name], permissions: $permissions}')

scratch="$(mktemp)"
chmod 600 "${scratch}"
printf '%s' "${SECRET_JSON}" | jq -r '.private_key' > "${scratch}"

NOW=$(date +%s)
IAT=$((NOW - 60))
EXP=$((NOW + 540))

b64url() {
  openssl base64 -A | tr '+/' '-_' | tr -d '='
}

HEADER=$(printf '{"alg":"RS256","typ":"JWT"}' | b64url)
JWT_PAYLOAD=$(printf '{"iat":%d,"exp":%d,"iss":"%s"}' "${IAT}" "${EXP}" "${APP_ID}" | b64url)
SIGNING_INPUT="${HEADER}.${JWT_PAYLOAD}"
SIGNATURE=$(printf '%s' "${SIGNING_INPUT}" | openssl dgst -sha256 -sign "${scratch}" | b64url)
JWT="${SIGNING_INPUT}.${SIGNATURE}"

INSTALLATION_RESPONSE=$(curl --proto '=https' --tlsv1.2 -fsS \
  -H "Authorization: Bearer ${JWT}" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2026-03-10" \
  "https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/installation" 2>/dev/null) || fail "installation_lookup_failed"
INSTALLATION_ID=$(printf '%s' "${INSTALLATION_RESPONSE}" | jq -er '.id | select(type == "number" and . > 0)') || fail "installation_id_missing"

TOKEN_RESPONSE=$(curl --proto '=https' --tlsv1.2 -fsS -X POST \
  -H "Authorization: Bearer ${JWT}" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2026-03-10" \
  -H "Content-Type: application/json" \
  --data "${REQUEST_BODY}" \
  "https://api.github.com/app/installations/${INSTALLATION_ID}/access_tokens" 2>/dev/null) || fail "token_mint_failed"
TOKEN=$(printf '%s' "${TOKEN_RESPONSE}" | jq -er '.token | select(type == "string" and length > 0)') || fail "token_missing"

printf '%s\n' "${TOKEN}"
