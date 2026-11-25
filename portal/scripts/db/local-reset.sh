#!/usr/bin/env bash
# Rebuilds a LOCAL test database from scratch on a plain PostgreSQL server:
#   Supabase stand-in (tests only) -> all migrations -> seed data.
# Usage: PGURL=postgres://postgres:postgres@localhost:5432 scripts/db/local-reset.sh [dbname]
set -euo pipefail
cd "$(dirname "$0")/../.."
DB="${1:-pa_test}"
PGURL="${PGURL:-postgres://postgres:postgres@localhost:5432}"
psql "$PGURL/postgres" -qAt -v ON_ERROR_STOP=1 -c "drop database if exists $DB with (force)" -c "create database $DB"
run() { PGOPTIONS="-c client_min_messages=warning" psql "$PGURL/$DB" -q -v ON_ERROR_STOP=1 -f "$1" > /dev/null; }
run tests/rls/supabase-shim.sql
for f in supabase/migrations/*.sql; do run "$f"; done
if [ "${SKIP_SEED:-0}" != "1" ]; then run supabase/seed.sql; fi
echo "Database $DB ready."
