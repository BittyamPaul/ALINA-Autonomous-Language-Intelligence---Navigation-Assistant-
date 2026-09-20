#!/usr/bin/env bash
# ==============================================================================
# ALINA — Production SurrealDB Backup & Snapshot Pipeline
# ==============================================================================
# Usage:
#   ./backup-db.sh [backup_directory]
#
# Environment variables:
#   SURREAL_ENDPOINT   (default: http://127.0.0.1:8000)
#   SURREAL_NAMESPACE  (default: alina)
#   SURREAL_DATABASE   (default: main)
#   SURREAL_USERNAME   (default: root)
#   SURREAL_PASSWORD   (default: root)
#   BACKUP_DIR         (default: ./backups)
#   RETENTION_DAYS     (default: 30)
#   BACKUP_STORAGE_BUCKET (optional: s3://... or gs://...)
# ==============================================================================

set -euo pipefail

# Configuration
ENDPOINT="${SURREAL_ENDPOINT:-http://127.0.0.1:8000}"
NAMESPACE="${SURREAL_NAMESPACE:-alina}"
DATABASE="${SURREAL_DATABASE:-main}"
USER="${SURREAL_USERNAME:-root}"
PASS="${SURREAL_PASSWORD:-root}"
BACKUP_DIR="${1:-${BACKUP_DIR:-./backups}}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP="$(date -u +"%Y%m%d_%H%M%SZ")"
BACKUP_PREFIX="alina_backup_${NAMESPACE}_${DATABASE}_${TIMESTAMP}"
RAW_FILE="${BACKUP_DIR}/${BACKUP_PREFIX}.surql"
ARCHIVE_FILE="${RAW_FILE}.gz"
CHECKSUM_FILE="${ARCHIVE_FILE}.sha256"

mkdir -p "${BACKUP_DIR}"

log() {
  local level="$1"
  local msg="$2"
  echo "{\"timestamp\":\"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\",\"level\":\"${level}\",\"service\":\"alina-backup\",\"message\":\"${msg}\"}"
}

log "INFO" "Starting SurrealDB backup for ${NAMESPACE}/${DATABASE} at ${ENDPOINT}"

# Check for surreal CLI tool
if command -v surreal >/dev/null 2>&1; then
  log "INFO" "Exporting SurrealDB snapshot using surreal CLI..."
  surreal export \
    --conn "${ENDPOINT}" \
    --ns "${NAMESPACE}" \
    --db "${DATABASE}" \
    --user "${USER}" \
    --pass "${PASS}" \
    "${RAW_FILE}"
else
  # Fallback: Use HTTP export API with curl
  log "INFO" "surreal CLI not found; utilizing HTTP export API via curl..."
  # Clean endpoint trailing slash
  BASE_URL="${ENDPOINT%/rpc}"
  BASE_URL="${BASE_URL%/}"
  
  curl -s -f -X POST \
    "${BASE_URL}/export" \
    -H "Accept: application/octet-stream" \
    -H "NS: ${NAMESPACE}" \
    -H "DB: ${DATABASE}" \
    -u "${USER}:${PASS}" \
    --output "${RAW_FILE}"
fi

# Verify exported file is not empty
if [ ! -s "${RAW_FILE}" ]; then
  log "ERROR" "Export failed or generated an empty file: ${RAW_FILE}"
  rm -f "${RAW_FILE}"
  exit 1
fi

FILE_SIZE_RAW="$(wc -c < "${RAW_FILE}" | tr -d ' ')"
log "INFO" "Database export successful. Raw size: ${FILE_SIZE_RAW} bytes. Compressing with gzip..."

# Compress with gzip maximum compression
gzip -9 -c "${RAW_FILE}" > "${ARCHIVE_FILE}"
rm -f "${RAW_FILE}"

FILE_SIZE_GZ="$(wc -c < "${ARCHIVE_FILE}" | tr -d ' ')"

# Generate SHA-256 Checksum for tamper protection & verification
if command -v sha256sum >/dev/null 2>&1; then
  (cd "${BACKUP_DIR}" && sha256sum "$(basename "${ARCHIVE_FILE}")" > "$(basename "${CHECKSUM_FILE}")")
elif command -v shasum >/dev/null 2>&1; then
  (cd "${BACKUP_DIR}" && shasum -a 256 "$(basename "${ARCHIVE_FILE}")" > "$(basename "${CHECKSUM_FILE}")")
fi

log "INFO" "Compressed snapshot ready: ${ARCHIVE_FILE} (${FILE_SIZE_GZ} bytes). SHA-256 checksum recorded."

# Optional off-site sync to S3 / Cloud Storage
if [ -n "${BACKUP_STORAGE_BUCKET:-}" ]; then
  log "INFO" "Syncing backup to cloud vault: ${BACKUP_STORAGE_BUCKET}"
  if [[ "${BACKUP_STORAGE_BUCKET}" =~ ^s3:// ]] && command -v aws >/dev/null 2>&1; then
    aws s3 cp "${ARCHIVE_FILE}" "${BACKUP_STORAGE_BUCKET}/" --sse aws:kms
    aws s3 cp "${CHECKSUM_FILE}" "${BACKUP_STORAGE_BUCKET}/" --sse aws:kms
    log "INFO" "Off-site S3 sync completed successfully."
  elif [[ "${BACKUP_STORAGE_BUCKET}" =~ ^gs:// ]] && command -v gsutil >/dev/null 2>&1; then
    gsutil cp "${ARCHIVE_FILE}" "${BACKUP_STORAGE_BUCKET}/"
    gsutil cp "${CHECKSUM_FILE}" "${BACKUP_STORAGE_BUCKET}/"
    log "INFO" "Off-site GCS sync completed successfully."
  else
    log "WARN" "Cloud storage CLI not available or unsupported scheme; skipped remote upload."
  fi
fi

# Prune local backups exceeding retention window
log "INFO" "Pruning snapshots older than ${RETENTION_DAYS} days in ${BACKUP_DIR}..."
find "${BACKUP_DIR}" -name "alina_backup_*.surql.gz*" -type f -mtime +"${RETENTION_DAYS}" -delete

log "INFO" "Backup job completed successfully."
