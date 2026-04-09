#!/bin/bash
set -e

# Enable PostgreSQL extensions on all diablo production databases.
# This script runs once when the Postgres container is first initialized.
# It must sort after production.sql (which creates the additional databases).

for db in diablo_production diablo_production_cache diablo_production_queue diablo_production_cable; do
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" <<-EOSQL
        CREATE EXTENSION IF NOT EXISTS pgcrypto;
EOSQL
done
