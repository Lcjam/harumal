#!/bin/sh
set -eu

: "${APP_SECRET:?APP_SECRET is required}"
: "${APP_DB_USER:=harumal_app}"
: "${POSTGRES_DB:=harumal}"
: "${POSTGRES_USER:=harumal}"
: "${PGHOST:=db}"

[ "${#APP_SECRET}" -ge 32 ] || { echo "APP_SECRET must contain at least 32 characters" >&2; exit 1; }

printf '%s' "$APP_DB_USER" | grep -Eq '^[a-z_][a-z0-9_]*$' || {
  echo "APP_DB_USER must be a lowercase PostgreSQL identifier" >&2
  exit 1
}
[ "${#APP_DB_USER}" -le 63 ] || { echo "APP_DB_USER is too long" >&2; exit 1; }

APP_DB_PASSWORD="$(printf '%s' "${APP_SECRET}:harumal-app-db-v1" | sha256sum | awk '{print $1}')"
export PGPASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"

psql --host "$PGHOST" --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=ON_ERROR_STOP=1 \
  --set=app_user="$APP_DB_USER" \
  --set=app_password="$APP_DB_PASSWORD" <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;

SELECT format(
  'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT',
  :'app_user', :'app_password'
)
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'app_user') \gexec

SELECT format(
  'ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT',
  :'app_user', :'app_password'
) \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'app_user') \gexec
SELECT format('GRANT USAGE, CREATE ON SCHEMA public TO %I', :'app_user') \gexec
SELECT format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', :'app_user') \gexec
SELECT format('GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO %I', :'app_user') \gexec

-- The application does not use PostgreSQL XML features. Removing the default
-- privilege makes the unpatched low-severity XML parser advisories unreachable
-- from the application role.
REVOKE USAGE ON TYPE pg_catalog.xml FROM PUBLIC;
SQL

unset APP_DB_PASSWORD PGPASSWORD
echo "Application database role is provisioned with least privilege."
