#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: sh scripts/restore.sh backups/harumal-YYYYMMDD-HHMMSS.sql.gz" >&2
  exit 1
fi

PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
BACKUP_FILE=$1
POSTGRES_USER=${POSTGRES_USER:-harumal}
POSTGRES_DB=${POSTGRES_DB:-harumal}

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup not found: $BACKUP_FILE" >&2
  exit 1
fi

if ! gzip -t "$BACKUP_FILE"; then
  echo "Backup is not a valid gzip archive: $BACKUP_FILE" >&2
  exit 1
fi

printf "This replaces the current '%s' database. Type RESTORE to continue: " "$POSTGRES_DB"
read -r CONFIRM
if [ "$CONFIRM" != "RESTORE" ]; then
  echo "Cancelled."
  exit 1
fi

cd "$PROJECT_DIR"
gzip -dc "$BACKUP_FILE" | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$POSTGRES_DB"
echo "Restore complete."
