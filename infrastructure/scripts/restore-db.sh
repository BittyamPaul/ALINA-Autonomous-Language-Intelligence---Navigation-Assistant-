#!/usr/bin/env bash
# ==============================================================================
# ALINA — Production SurrealDB Disaster Recovery & Restore Utility
# ==============================================================================
# Usage:
#   ./restore-db.sh <path_to_backup_archive.surql.gz>
#
# Environment variables:
#   SURREAL_ENDPOINT   (default: http://127.0.0.1:8000)
#   SURREAL_NAMESPACE  (default: alina)
#   SURREAL_DATABASE   (default: main)
#   SURREAL_USERNAME   (default: root)
#   SURREAL_PASSWORD   (default: root)
# ==============================================================================

set -euo pipefail

log() {
  local level="$1"
  local msg="$2"
  echo "{\"timestamp\":\"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\",\"level\":\"${level}\",\"service\":\"alina-restore\",\"message\":\"${msg}\"}"
}

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <path_to_backup_file.surql.gz>" >&2
  exit 1
fi

ARCHIVE_PATH="$1"

if [ ! -f "${ARCHIVE_PATH}" ]; then
  log "FATAL" "Target archive does not exist: ${ARCHIVE_PATH}"
  exit 1
fi

ENDPOINT="${SURREAL_ENDPOINT:-http://127.0.0.1:8000}"
NAMESPACE="${SURREAL_NAMESPACE:-alina}"
DATABASE="${SURREAL_DATABASE:-main}"
USER="${SURREAL_USERNAME:-root}"
PASS="${SURREAL_PASSWORD:-root}"

log "INFO" "Starting disaster recovery restore for ${NAMESPACE}/${DATABASE} on ${ENDPOINT} from ${ARCHIVE_PATH}"

# Checksum verification if .sha256 companion file exists
CHECKSUM_FILE="${ARCHIVE_PATH}.sha256"
if [ -f "${CHECKSUM_FILE}" ]; then
  log "INFO" "Verifying SHA-256 integrity checksum..."
  BACKUP_DIR="$(dirname "${ARCHIVE_PATH}")"
  FILE_BASENAME="$(basename "${ARCHIVE_PATH}")"
  
  if command -v sha256sum >/dev/null 2>&1; then
    (cd "${BACKUP_DIR}" && sha256sum -c "$(basename "${CHECKSUM_FILE}")") || {
      log "FATAL" "SHA-256 Checksum validation FAILED! Possible data corruption or tampering."
      exit 1
    }
  elif command -v shasum >/dev/null 2>&1; then
    (cd "${BACKUP_DIR}" && shasum -a 256 -c "$(basename "${CHECKSUM_FILE}")") || {
      log "FATAL" "SHA-256 Checksum validation FAILED! Possible data corruption or tampering."
      exit 1
    }
  fi
  log "INFO" "Integrity checksum verified successfully."
fi

TEMP_RESTORE_SQL="$(mktemp /tmp/alina_restore_XXXXXX.surql)"
trap 'rm -f "${TEMP_RESTORE_SQL}"' EXIT

log "INFO" "Decompressing snapshot archive..."
gzip -d -c "${ARCHIVE_PATH}" > "${TEMP_RESTORE_SQL}"

if [ ! -s "${TEMP_RESTORE_SQL}" ]; then
  log "FATAL" "Decompressed snapshot is empty. Aborting restore."
  exit 1
fi

# Execute database import
if command -v surreal >/dev/null 2>&1; then
  log "INFO" "Executing restore using surreal import CLI..."
  surreal import \
    --conn "${ENDPOINT}" \
    --ns "${NAMESPACE}" \
    --db "${DATABASE}" \
    --user "${USER}" \
    --pass "${PASS}" \
    "${TEMP_RESTORE_SQL}"
else
  log "INFO" "surreal CLI not found; executing restore via HTTP /import endpoint..."
  BASE_URL="${ENDPOINT%/rpc}"
  BASE_URL="${BASE_URL%/}"

  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    "${BASE_URL}/import" \
    -H "Accept: application/json" \
    -H "NS: ${NAMESPACE}" \
    -H "DB: ${DATABASE}" \
    -u "${USER}:${PASS}" \
    --data-binary "@${TEMP_RESTORE_SQL}")

  if [ "${HTTP_CODE}" -ne 200 ]; then
    log "FATAL" "HTTP Import failed with status code ${HTTP_CODE}"
    exit 1
  fi
fi

# Post-restore health check verification
log "INFO" "Verifying database health post-restore..."
BASE_URL="${ENDPOINT%/rpc}"
BASE_URL="${BASE_URL%/}"

HEALTH_STATUS=$(curl -s -X POST "${BASE_URL}/sql" \
  -H "Accept: application/json" \
  -H "NS: ${NAMESPACE}" \
  -H "DB: ${DATABASE}" \
  -u "${USER}:${PASS}" \
  -d "RETURN true;" || echo "FAILED")

if [[ "${HEALTH_STATUS}" =~ "true" ]]; then
  log "INFO" "Database restored and healthy. Verification passed."
else
  log "WARN" "Database restored, but post-verification query did not return expected response: ${HEALTH_STATUS}"
fi

log "INFO" "Disaster recovery restore procedure completed."
