#!/usr/bin/env bash
# mint-github-app-token.sh — sign a JWT with the GitHub App's private key,
# discover the installation ID for a target repo, exchange the JWT for a
# 1-hour scoped installation token. Prints the token to stdout (and only
# stdout) for use under BuildKit's --mount=type=secret pattern.
#
# Usage:
#   mint-github-app-token.sh <SECRET_ID> <REPO_OWNER> <REPO_NAME>
#
# Where:
#   SECRET_ID    — AWS Secrets Manager secret ID containing {app_id, private_key}
#   REPO_OWNER   — GitHub org/user owning the target repo
#   REPO_NAME    — repo name
#
# Side-effects:
#   - Reads the SM secret via `aws secretsmanager get-secret-value`
#   - Calls GitHub's API: GET /repos/{owner}/{repo}/installation, then
#     POST /app/installations/{id}/access_tokens
#   - Prints the minted token (`ghs_...`) to STDOUT exactly once
#   - On failure, writes a `security_event.mint_failed` line to stderr and exits
#     non-zero. NEVER echoes the PEM, the JWT, or any token bytes to stderr.

set -euo pipefail

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
trap cleanup EXIT INT TERM

if [ "$#" -ne 3 ]; then
  echo "usage: $0 <SECRET_ID> <REPO_OWNER> <REPO_NAME>" >&2
  exit 2
fi

SECRET_ID="$1"
REPO_OWNER="$2"
REPO_NAME="$3"

if [ -z "${SECRET_ID}" ] || [ -z "${REPO_OWNER}" ] || [ -z "${REPO_NAME}" ]; then
  echo "error: SECRET_ID, REPO_OWNER, REPO_NAME must all be non-empty" >&2
  exit 2
fi

case "${SECRET_ID}" in
  *[\;\|\&\`\$\(\)]*)
    echo "error: SECRET_ID contains shell metacharacters; refusing" >&2
    exit 2
    ;;
esac

if ! command -v aws >/dev/null 2>&1; then
  echo "security_event.mint_failed reason=aws_cli_missing" >&2
  exit 2
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "security_event.mint_failed reason=jq_missing" >&2
  exit 2
fi
if ! command -v openssl >/dev/null 2>&1; then
  echo "security_event.mint_failed reason=openssl_missing" >&2
  exit 2
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "security_event.mint_failed reason=curl_missing" >&2
  exit 2
fi

# Pull the secret JSON.
SECRET_JSON=$(aws secretsmanager get-secret-value --secret-id "${SECRET_ID}" --query SecretString --output text 2>/dev/null) || {
  echo "security_event.mint_failed reason=sm_get_failed secret_id=${SECRET_ID}" >&2
  exit 1
}

APP_ID=$(printf '%s' "${SECRET_JSON}" | jq -r '.app_id')
if [ -z "${APP_ID}" ] || [ "${APP_ID}" = "null" ]; then
  echo "security_event.mint_failed reason=missing_app_id" >&2
  exit 1
fi

scratch="$(mktemp)"
chmod 600 "${scratch}"
printf '%s' "${SECRET_JSON}" | jq -r '.private_key' > "${scratch}"

# Build the JWT.
NOW=$(date +%s)
IAT=$((NOW - 60))
EXP=$((NOW + 540))   # 9 minutes — JWT max is 10 minutes

b64url() {
  # base64url encode (no padding)
  openssl base64 -A | tr '+/' '-_' | tr -d '='
}

HEADER=$(printf '{"alg":"RS256","typ":"JWT"}' | b64url)
PAYLOAD=$(printf '{"iat":%d,"exp":%d,"iss":"%s"}' "${IAT}" "${EXP}" "${APP_ID}" | b64url)
SIGNING_INPUT="${HEADER}.${PAYLOAD}"

SIGNATURE=$(printf '%s' "${SIGNING_INPUT}" | openssl dgst -sha256 -sign "${scratch}" | b64url)
JWT="${SIGNING_INPUT}.${SIGNATURE}"

# Discover installation ID.
INSTALLATION_ID=$(curl -fsS \
  -H "Authorization: Bearer ${JWT}" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/installation" 2>/dev/null \
  | jq -r '.id') || {
  echo "security_event.mint_failed reason=installation_lookup_failed repo=${REPO_OWNER}/${REPO_NAME}" >&2
  exit 1
}

if [ -z "${INSTALLATION_ID}" ] || [ "${INSTALLATION_ID}" = "null" ]; then
  echo "security_event.mint_failed reason=installation_id_missing repo=${REPO_OWNER}/${REPO_NAME}" >&2
  exit 1
fi

# Mint the installation token (1-hour scoped).
TOKEN=$(curl -fsS -X POST \
  -H "Authorization: Bearer ${JWT}" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/app/installations/${INSTALLATION_ID}/access_tokens" 2>/dev/null \
  | jq -r '.token') || {
  echo "security_event.mint_failed reason=token_mint_failed installation_id=${INSTALLATION_ID}" >&2
  exit 1
}

if [ -z "${TOKEN}" ] || [ "${TOKEN}" = "null" ]; then
  echo "security_event.mint_failed reason=token_missing installation_id=${INSTALLATION_ID}" >&2
  exit 1
fi

# stdout — the only place the token appears.
printf '%s\n' "${TOKEN}"
exit 0
