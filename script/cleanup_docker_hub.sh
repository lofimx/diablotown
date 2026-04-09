#!/usr/bin/env bash
#
# Delete Docker Hub image tags for deobald/helltown that haven't been
# updated in the past 48 hours. Always keeps the most recent tag.
#
# Requires: curl, jq
# Env vars: KAMAL_REGISTRY_CLEANUP_PASSWORD (Docker Hub PAT with delete scope)

set -euo pipefail

REPO="deobald/helltown"
USERNAME="deobald"
MAX_AGE_HOURS=48

if [ -z "${KAMAL_REGISTRY_CLEANUP_PASSWORD:-}" ]; then
  echo "Error: KAMAL_REGISTRY_CLEANUP_PASSWORD is not set" >&2
  exit 1
fi

# Authenticate
TOKEN=$(curl -s -X POST "https://hub.docker.com/v2/users/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"${USERNAME}\",\"password\":\"${KAMAL_REGISTRY_CLEANUP_PASSWORD}\"}" \
  | jq -r '.token')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "Error: Failed to authenticate with Docker Hub" >&2
  exit 1
fi

# Fetch tags sorted by most recently updated
TAGS_JSON=$(curl -s "https://hub.docker.com/v2/repositories/${REPO}/tags/?page_size=100&ordering=-last_updated" \
  -H "Authorization: Bearer ${TOKEN}")

TAG_COUNT=$(echo "$TAGS_JSON" | jq '.results | length')
echo "Found ${TAG_COUNT} tag(s) in ${REPO}"

if [ "$TAG_COUNT" -le 1 ]; then
  echo "Only one tag (or none) — nothing to clean up"
  exit 0
fi

CUTOFF=$(date -u -d "-${MAX_AGE_HOURS} hours" +%s 2>/dev/null || date -u -v-${MAX_AGE_HOURS}H +%s)
DELETED=0

# Skip index 0 (most recent tag — always kept)
for i in $(seq 1 $((TAG_COUNT - 1))); do
  TAG_NAME=$(echo "$TAGS_JSON" | jq -r ".results[${i}].name")
  LAST_UPDATED=$(echo "$TAGS_JSON" | jq -r ".results[${i}].last_updated")

  # Parse ISO 8601 timestamp to epoch
  TAG_EPOCH=$(date -u -d "$LAST_UPDATED" +%s 2>/dev/null || date -u -j -f "%Y-%m-%dT%H:%M:%S" "$(echo "$LAST_UPDATED" | cut -d. -f1)" +%s)

  if [ "$TAG_EPOCH" -lt "$CUTOFF" ]; then
    echo "Deleting ${TAG_NAME} (last updated: ${LAST_UPDATED})"
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
      "https://hub.docker.com/v2/repositories/${REPO}/tags/${TAG_NAME}/" \
      -H "Authorization: Bearer ${TOKEN}")

    if [ "$HTTP_CODE" = "204" ]; then
      DELETED=$((DELETED + 1))
    else
      echo "  Warning: DELETE returned HTTP ${HTTP_CODE}" >&2
    fi
  else
    echo "Keeping ${TAG_NAME} (last updated: ${LAST_UPDATED})"
  fi
done

echo "Done. Deleted ${DELETED} tag(s)."
