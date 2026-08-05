#!/usr/bin/env bash
# =============================================================================
#  setup-test-db.sh — idempotent test database creation + migration.
#
#  Run before any `test:integration:*` script, locally or in CI. Safe to
#  re-run: creates the database only if it doesn't already exist, then
#  applies migrations (also idempotent).
#
#  Expects PGHOST/PGPORT/PGUSER/PGPASSWORD (or a DATABASE_URL to derive
#  connection info from) to already point at a reachable Postgres server —
#  see medusa/.env.test for the values this project uses.
# =============================================================================
set -euo pipefail

DB_NAME="${TEST_DB_NAME:-medusa_test}"

echo "[setup-test-db] Checking for database '${DB_NAME}'..."

EXISTS=$(psql -tAc "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'" postgres || echo "")

if [ "$EXISTS" != "1" ]; then
  echo "[setup-test-db] Creating database '${DB_NAME}'..."
  createdb "${DB_NAME}"
else
  echo "[setup-test-db] Database '${DB_NAME}' already exists."
fi

echo "[setup-test-db] Running migrations against '${DB_NAME}'..."
npx medusa db:migrate

echo "[setup-test-db] Done."
