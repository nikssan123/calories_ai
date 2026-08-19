#!/bin/bash
# Deploy the latest committed version to the always-on host.
#
#   bin/deploy.sh                  # deploy origin/main
#   bin/deploy.sh --push           # push local main first, then deploy it
#   bin/deploy.sh --dry-run        # show exactly what would happen, change nothing
#   bin/deploy.sh --ref <sha>      # deploy (or roll back to) a specific commit
#   bin/deploy.sh --build always   # force a rebuild of both images
#
# Deployment model, for context on why this script is shaped the way it is:
#
#   * The host holds a plain git clone at $DEPLOY_PATH run by `docker compose`.
#     Deploying is "fetch, fast-forward, rebuild what changed, up -d" — nothing is
#     copied from this machine, so only *pushed* commits can ever be deployed.
#   * Unlike the bot, nothing here is bind-mounted: both images compile their code
#     in, so any change to apps/ or packages/ needs a rebuild.
#   * The state worth protecting is Postgres and the uploaded photos, and neither
#     lives in git. This script backs up both before it touches anything, which is
#     the one thing that makes a bad deploy recoverable. The photos matter as much
#     as the rows: a `photos` row whose file has gone points at nothing, and the
#     meal it belongs to renders as a broken image forever.
#   * Migrations run in the API container's start command, so schema and code ship
#     together and there is no window where new code serves an old schema. That
#     also means a rollback past a migration is NOT automatic — see the warning
#     printed at the end.

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"

HOST="${DEPLOY_SSH_HOST:-}"
PATH_REMOTE="${DEPLOY_PATH:-/srv/calorytracker}"
REF=""
PUSH=0
BUILD_MODE="auto"      # auto | always | never
PULL_BASE=0
DRY=0

usage() {
    sed -n '2,/^set -euo/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//; $d'
    cat <<'USAGE'
Options:
  --host USER@HOST   target host           (default: $DEPLOY_SSH_HOST)
  --path DIR         repo path on host     (default: $DEPLOY_PATH or /srv/calorytracker)
  --ref REF          commit/branch to deploy (default: origin/main)
  --push             push the current branch to origin before deploying
  --build MODE       auto (rebuild only what changed) | always | never
  --pull             also pull fresh base images when building
  --dry-run          report the plan, change nothing
  -h, --help         this text
USAGE
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --host)  HOST="$2"; shift 2 ;;
        --path)  PATH_REMOTE="$2"; shift 2 ;;
        --ref)   REF="$2"; shift 2 ;;
        --push)  PUSH=1; shift ;;
        --build) BUILD_MODE="$2"; shift 2 ;;
        --pull)  PULL_BASE=1; shift ;;
        --dry-run) DRY=1; shift ;;
        -h|--help) usage; exit 0 ;;
        *) echo "unknown option: $1" >&2; usage >&2; exit 64 ;;
    esac
done

case "$BUILD_MODE" in auto|always|never) ;; *)
    echo "--build must be auto, always or never" >&2; exit 64 ;;
esac

if [[ -z "$HOST" ]]; then
    echo "No target host. Set DEPLOY_SSH_HOST or pass --host user@host." >&2
    exit 64
fi

say()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m !!\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31mFATAL\033[0m %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- local preflight

BRANCH="$(git rev-parse --abbrev-ref HEAD)"

# Only committed-and-pushed work can deploy, so say plainly when the tree you are
# looking at is not the tree that will run.
DIRTY="$(git status --porcelain | head -20)"
[[ -n "$DIRTY" ]] && {
    warn "uncommitted changes — these will NOT be deployed:"
    printf '       %s\n' $(echo "$DIRTY" | awk '{print $NF}') >&2
}

say "fetching origin"
git fetch --quiet origin || die "cannot reach origin"

if [[ -z "$REF" ]]; then
    REF="origin/main"
    AHEAD="$(git rev-list --count origin/main..HEAD)"
    if (( AHEAD > 0 )); then
        if (( PUSH )); then
            say "pushing $AHEAD local commit(s) to origin/$BRANCH"
            (( DRY )) || git push origin "$BRANCH"
            (( DRY )) && warn "--dry-run: not actually pushing"
            git fetch --quiet origin
        else
            die "$AHEAD local commit(s) are not on origin — the host pulls from GitHub,
      so they cannot deploy. Re-run with --push, or push them yourself."
        fi
    fi
fi

TARGET="$(git rev-parse --verify "${REF}^{commit}" 2>/dev/null)" \
    || die "cannot resolve ref: $REF"
say "target $REF = ${TARGET:0:8}  $(git log -1 --format=%s "$TARGET")"

ssh -o BatchMode=yes -o ConnectTimeout=10 "$HOST" true 2>/dev/null \
    || die "cannot ssh to $HOST (needs key-based auth)"

# ---------------------------------------------------------------- remote execution
#
# The remote half runs as one script over a single ssh session, so a dropped
# connection cannot leave the deploy half-applied between two separate ssh calls.
#
# It is spooled to a temp file rather than piped into `bash -s`: with `bash -s` the
# script IS stdin, so the first command that reads stdin — `docker compose exec`
# does, even with -T — swallows the rest and the deploy ends early while reporting
# success.

say "deploying to $HOST:$PATH_REMOTE"
echo

REMOTE_ARGS="$(printf '%q ' "$PATH_REMOTE" "$TARGET" "$BUILD_MODE" "$PULL_BASE" "$DRY")"

ssh -o BatchMode=yes "$HOST" \
    "T=\$(mktemp /tmp/ct-deploy.XXXXXX) && cat >\"\$T\" && \
     bash \"\$T\" $REMOTE_ARGS; rc=\$?; rm -f \"\$T\"; exit \$rc" <<'REMOTE'
set -euo pipefail

REPO="$1"; TARGET="$2"; BUILD_MODE="$3"; PULL_BASE="$4"; DRY="$5"
COMPOSE="docker compose -f docker-compose.prod.yml"

say()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m !!\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31mFATAL\033[0m %s\n' "$*" >&2; exit 1; }
run()  { if [[ "$DRY" == 1 ]]; then echo "       would run: $*"; else "$@"; fi; }

cd "$REPO" 2>/dev/null || die "$REPO does not exist on this host.
      First-time setup is not automated because it needs secrets and an
      interactive Claude login. See README.md 'Deploying to a server'."

[[ -f docker-compose.prod.yml && -d .git ]] || die "$REPO is not the calorytracker repo"
[[ -f .env ]] || die "$REPO/.env is missing — the stack cannot start without POSTGRES_PASSWORD"

CURRENT="$(git rev-parse HEAD)"

# ---- 1. back up the state before touching anything ------------------------------
#
# This is the whole safety net. Code rolls back with --ref; a migration that ate
# data does not, so both backups are taken every time and the last ten kept.
#
# Two stores, not one. Meal photos are files in the `uploads` volume rather than
# rows in Postgres, so a pg_dump on its own restores a database full of `photos`
# rows pointing at files that no longer exist.
if [[ "$DRY" != 1 ]]; then
    STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
    mkdir -p .deploy-backups

    if $COMPOSE ps --status running --services 2>/dev/null | grep -qx db; then
        # --clean so the dump can be restored over a live database.
        if $COMPOSE exec -T db pg_dump -U "${POSTGRES_USER:-ct}" --clean \
                "${POSTGRES_DB:-calorytracker}" 2>/dev/null \
                | gzip > ".deploy-backups/db-$STAMP.sql.gz"; then
            say "backed up database to .deploy-backups/db-$STAMP.sql.gz ($(du -h ".deploy-backups/db-$STAMP.sql.gz" | cut -f1))"
        else
            rm -f ".deploy-backups/db-$STAMP.sql.gz"
            die "pg_dump failed — refusing to deploy without a backup.
      Check: cd $REPO && $COMPOSE logs --tail 30 db"
        fi
        ls -1t .deploy-backups/db-*.sql.gz 2>/dev/null | tail -n +11 | xargs -r rm -f
    else
        warn "database is not running — nothing to back up (first deploy?)"
    fi

    # The volume is read through a throwaway container rather than the API, so
    # this works whether or not the stack is up, and never writes to the volume.
    # docker-compose.prod.yml pins `name: calorytracker`, so the volume compose
    # creates for `uploads` is always this. Overridable for an unusual host.
    UPLOADS_VOLUME="${UPLOADS_VOLUME:-calorytracker_uploads}"

    if docker volume inspect "$UPLOADS_VOLUME" >/dev/null 2>&1; then
        if docker run --rm \
                -v "$UPLOADS_VOLUME:/data:ro" \
                -v "$PWD/.deploy-backups:/backup" \
                alpine:3 tar czf "/backup/uploads-$STAMP.tar.gz" -C /data . 2>/dev/null; then
            say "backed up photos to .deploy-backups/uploads-$STAMP.tar.gz ($(du -h ".deploy-backups/uploads-$STAMP.tar.gz" | cut -f1))"
        else
            rm -f ".deploy-backups/uploads-$STAMP.tar.gz"
            die "photo backup failed — refusing to deploy without one.
      The photos are not in the database dump; losing them cannot be undone.
      Check: docker volume inspect $UPLOADS_VOLUME"
        fi
        ls -1t .deploy-backups/uploads-*.tar.gz 2>/dev/null | tail -n +11 | xargs -r rm -f
    else
        warn "no $UPLOADS_VOLUME volume yet — no photos to back up (first deploy?)"
    fi
fi

# ---- 2. move the checkout -------------------------------------------------------
git fetch --quiet --prune origin || die "git fetch failed on the host"
git rev-parse --verify --quiet "${TARGET}^{commit}" >/dev/null \
    || die "commit ${TARGET:0:8} is not on this host after fetch — is it pushed?"

if [[ "$CURRENT" == "$TARGET" ]]; then
    say "already at ${TARGET:0:8} — no code change"
    CHANGED=""
else
    CHANGED="$(git diff --name-only "$CURRENT" "$TARGET")"
    if git merge-base --is-ancestor "$CURRENT" "$TARGET"; then
        say "fast-forward ${CURRENT:0:8} -> ${TARGET:0:8} ($(echo "$CHANGED" | wc -l | tr -d ' ') files)"
        run git merge --ff-only "$TARGET"
    else
        # Rollback, or a rewritten branch. `reset --keep` moves HEAD but aborts
        # rather than discarding local modifications, unlike `--hard`.
        warn "${TARGET:0:8} is not a descendant of ${CURRENT:0:8} — treating as a rollback"
        run git reset --keep "$TARGET"
    fi

    if echo "$CHANGED" | grep -q '^apps/api/migrations/'; then
        say "this commit adds migrations — they run automatically when the API boots"
    fi
fi

# ---- 3. rebuild what changed ----------------------------------------------------
#
# Both images compile their code in, so the inputs are wide: anything under
# packages/ affects both.
SERVICES=()
case "$BUILD_MODE" in
    always) SERVICES=(api web); say "rebuilding both images (--build always)" ;;
    never)  say "skipping builds (--build never)" ;;
    auto)
        if [[ -n "$CHANGED" ]]; then
            if echo "$CHANGED" | grep -qE '^(apps/api/|packages/|docker/api\.Dockerfile|pnpm-lock\.yaml|docker-compose\.prod\.yml)'; then
                SERVICES+=(api)
            fi
            if echo "$CHANGED" | grep -qE '^(apps/web/|packages/|docker/web\.Dockerfile|pnpm-lock\.yaml|docker-compose\.prod\.yml)'; then
                SERVICES+=(web)
            fi
        fi
        if (( ${#SERVICES[@]} )); then say "rebuilding: ${SERVICES[*]}"
        else say "no image inputs changed"; fi
        ;;
esac

if (( ${#SERVICES[@]} )); then
    BUILD_ARGS=()
    (( PULL_BASE )) && BUILD_ARGS+=(--pull)
    run $COMPOSE build "${BUILD_ARGS[@]}" "${SERVICES[@]}"
fi

# up -d is a no-op for containers whose image and config are unchanged, which is
# what makes re-running this safe. Never `down` first: that would drop the
# claude-home volume's login and leave every chat turn failing to authenticate.
run $COMPOSE up -d --remove-orphans

# ---- 4. verify ------------------------------------------------------------------
if [[ "$DRY" == 1 ]]; then
    echo; say "dry run — nothing was changed"; exit 0
fi

echo
say "verifying"
FAIL=0

for c in calorytracker-db calorytracker-api calorytracker-web; do
    STATE="$(docker inspect -f '{{.State.Status}}' "$c" 2>/dev/null || echo missing)"
    [[ "$STATE" == running ]] || { warn "$c is $STATE"; FAIL=1; }
done

# The API reports which credential source the agent resolved. Give it a few
# seconds: migrations run before the server binds.
HEALTH=""
for _ in $(seq 1 15); do
    HEALTH="$($COMPOSE exec -T web node -e \
        'fetch(process.env.API_INTERNAL_URL+"/health").then(r=>r.text()).then(t=>console.log(t)).catch(()=>process.exit(1))' \
        2>/dev/null || true)"
    [[ -n "$HEALTH" ]] && break
    sleep 2
done

if [[ -n "$HEALTH" ]]; then
    echo "    api         $HEALTH"
    case "$HEALTH" in
        *claude-code-subscription*|*anthropic-api-key*) ;;
        *) warn "the agent has no credentials — chat will 503 until you run:
      cd $REPO && $COMPOSE run --rm api claude auth login"; FAIL=1 ;;
    esac
else
    warn "API did not answer /health"; FAIL=1
fi

if $COMPOSE logs --since 2m api 2>/dev/null | grep -qiE '\bfatal\b|unhandled'; then
    warn "errors in recent API logs:"
    $COMPOSE logs --since 2m api | grep -iE '\bfatal\b|unhandled' | tail -3 >&2
    FAIL=1
fi

echo
if (( FAIL )); then
    warn "deployed ${TARGET:0:8}, but verification found problems (see above)"
else
    say "deployed ${TARGET:0:8} — $(git log -1 --format=%s)"
fi
if [[ "$CURRENT" != "$TARGET" ]]; then
    echo "    roll back with:  bin/deploy.sh --ref ${CURRENT:0:8}"
    if echo "${CHANGED:-}" | grep -q '^apps/api/migrations/'; then
        warn "this deploy ran a migration — rolling the code back does NOT undo it.
      Restore from .deploy-backups/ if the schema change is the problem."
    fi
fi
echo "    logs:            ssh <host> 'cd $REPO && $COMPOSE logs -f api'"

exit $FAIL
REMOTE
