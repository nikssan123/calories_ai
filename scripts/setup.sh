#!/usr/bin/env bash
# One-command setup: dependencies, .env, Postgres, migrations.
# Safe to re-run — every step is a no-op once it has been done.
set -euo pipefail
cd "$(dirname "$0")/.."

fail() { echo; echo "✗ $1" >&2; exit 1; }
step() { echo; echo "→ $1"; }

# ---------------------------------------------------------------- preflight
step "Checking prerequisites"

command -v node >/dev/null || fail "Node is not installed. Node 22+ is required: https://nodejs.org"
node_major=$(node -p 'process.versions.node.split(".")[0]')
[ "$node_major" -ge 22 ] || fail "Node $(node -v) is too old — this project needs Node 22 or newer."
echo "  node $(node -v)"

command -v pnpm >/dev/null || fail "pnpm is not installed. Run: npm install -g pnpm"
echo "  pnpm $(pnpm -v)"

command -v docker >/dev/null || fail "Docker is not installed. Postgres runs in Docker: https://docs.docker.com/get-docker/"
docker info >/dev/null 2>&1 || fail "Docker is installed but not running. Start Docker Desktop and re-run this script."
echo "  docker ok"

# The agent runs on your Claude Code subscription unless another provider is
# configured. Detection differs by platform — macOS keeps the OAuth token in the
# Keychain, Linux in ~/.claude/.credentials.json — so this warns rather than
# blocks. Setup still completes; only chat would fail.
provider=$(grep -E '^AI_PROVIDER=' .env 2>/dev/null | tail -1 | cut -d= -f2 | tr -d ' ')
claude_ready=no
[ -n "$provider" ] && [ "$provider" != "anthropic" ] && claude_ready=skip
[ -f "$HOME/.claude/.credentials.json" ] && claude_ready=yes
[ -n "${ANTHROPIC_API_KEY:-}" ] && claude_ready=yes
command -v claude >/dev/null && claude_ready=yes
if [ "$claude_ready" = skip ]; then
  echo "  provider '$provider' — skipping the Claude check"
elif [ "$claude_ready" = yes ]; then
  echo "  claude ok"
else
  echo "  ! Claude Code was not detected. Everything else will still be set up," >&2
  echo "    but chat needs it. Install it and run 'claude' once to sign in:" >&2
  echo "    https://claude.com/claude-code" >&2
fi

# ---------------------------------------------------------------- .env
step "Configuring environment"
if [ -f .env ]; then
  echo "  .env already exists — left untouched"
else
  cp .env.example .env
  echo "  .env created from .env.example"
fi

# ---------------------------------------------------------------- deps
step "Installing dependencies"
pnpm install

# ---------------------------------------------------------------- database
step "Starting Postgres"
docker compose up -d >/dev/null

printf '  waiting for postgres'
for _ in $(seq 1 60); do
  if [ "$(docker inspect --format='{{.State.Health.Status}}' ct-postgres 2>/dev/null)" = "healthy" ]; then
    echo " ready"
    break
  fi
  printf '.'
  sleep 1
done

if [ "$(docker inspect --format='{{.State.Health.Status}}' ct-postgres 2>/dev/null)" != "healthy" ]; then
  echo
  fail "Postgres did not become healthy in 60s — check: docker compose logs db"
fi

step "Running migrations"
pnpm --filter @ct/api migrate

# ---------------------------------------------------------------- done
cat <<'DONE'

✓ Setup complete.

  pnpm dev      API on :4000, web on :3000

Then open http://localhost:3000 and create an account — the journal
will interview you to set your targets.
DONE
