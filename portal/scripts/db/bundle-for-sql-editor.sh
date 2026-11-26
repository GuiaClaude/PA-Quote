#!/usr/bin/env bash
# Builds two paste-ready files for the Supabase dashboard's SQL Editor
# (for people who don't use the Supabase CLI):
#   supabase/setup/1-database.sql   every migration, in order (run once per project)
#   supabase/setup/2-demo-data.sql  the DEMO seed (demo projects only — never live)
set -euo pipefail
cd "$(dirname "$0")/../.."
out=supabase/setup
mkdir -p "$out"
{
  echo "-- Print Amplified ordering app: full database set-up."
  echo "-- Paste into Supabase → SQL Editor → New query → Run. Run ONCE on a NEW project."
  echo "-- Generated from supabase/migrations by scripts/db/bundle-for-sql-editor.sh — do not edit by hand."
  # COMMIT after each file: the SQL Editor runs the paste as ONE transaction, and a new enum
  # value (e.g. revision_status 'changes_requested') can only be used after it is committed.
  for f in supabase/migrations/*.sql; do echo; echo "-- ===== $(basename "$f") ====="; cat "$f"; echo; echo "commit;"; done
} > "$out/1-database.sql"
{
  echo "-- DEMO DATA ONLY. Never run this on the live project."
  echo "-- Creates the demo companies, users (password Demo-Print-2026!), items, orders and prices."
  cat supabase/seed.sql
} > "$out/2-demo-data.sql"
echo "Wrote $out/1-database.sql and $out/2-demo-data.sql"
