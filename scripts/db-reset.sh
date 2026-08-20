#!/usr/bin/env bash
# Drops the Postgres volume, recreates it and re-runs every migration.
# Waits on the container's healthcheck rather than guessing with a sleep.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "dropping volume…"
docker compose down -v >/dev/null
docker compose up -d >/dev/null

printf 'waiting for postgres'
for _ in $(seq 1 60); do
  if [ "$(docker inspect --format='{{.State.Health.Status}}' ct-postgres 2>/dev/null)" = "healthy" ]; then
    echo " ready"
    pnpm --filter @ct/api migrate
    # Reference data, not somebody's rows — a reset is meant to clear the second
    # kind and restore the first, which is why the exercise catalogue survives it
    # and the recipe library has to be put back explicitly.
    pnpm --filter @ct/api seed:library
    echo
    echo "Database is back to a fresh install. Restart the API so it drops its stale connection pool:"
    echo "  pnpm dev:api      (or just pnpm dev)"
    exit 0
  fi
  printf '.'
  sleep 1
done

echo
echo "postgres did not become healthy in 60s — check: docker compose logs db" >&2
exit 1
