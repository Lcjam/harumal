#!/bin/sh
set -eu
umask 077

PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
BACKUP_DIR="$PROJECT_DIR/backups"
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-14}
POSTGRES_USER=${POSTGRES_USER:-harumal}
POSTGRES_DB=${POSTGRES_DB:-harumal}
STAMP=$(date '+%Y%m%d-%H%M%S')
TARGET="$BACKUP_DIR/harumal-$STAMP.sql.gz"
TEMP_SQL="$BACKUP_DIR/.harumal-$STAMP.sql"
TEMP_ARCHIVE="$TARGET.tmp"

case "$RETENTION_DAYS" in
  ''|*[!0-9]*)
    echo "BACKUP_RETENTION_DAYS must be a non-negative integer." >&2
    exit 1
    ;;
esac

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
cd "$PROJECT_DIR"
trap 'rm -f "$TEMP_SQL" "$TEMP_ARCHIVE"' EXIT HUP INT TERM
docker compose exec -T db pg_dump --clean --if-exists --no-owner -U "$POSTGRES_USER" "$POSTGRES_DB" > "$TEMP_SQL"
gzip -c "$TEMP_SQL" > "$TEMP_ARCHIVE"
gzip -t "$TEMP_ARCHIVE"
mv "$TEMP_ARCHIVE" "$TARGET"
rm -f "$TEMP_SQL"
trap - EXIT HUP INT TERM
chmod 600 "$TARGET"
find "$BACKUP_DIR" -type f -name 'harumal-*.sql.gz' -mtime "+$RETENTION_DAYS" -delete
echo "$TARGET"
