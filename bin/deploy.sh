#!/bin/bash
# Deploy the latest committed version to the always-on host.
#
#   bin/deploy.sh                  # deploy origin/main
#   bin/deploy.sh --push           # push local main first, then deploy it
#   bin/deploy.sh --dry-run        # show exactly what would happen, change nothing
#   bin/deploy.sh --ref <sha>      # deploy (or roll back to) a specific commit
#   bin/deploy.sh --build always   # force a rebuild of both images
#   bin/deploy.sh --mobile         # ...and start an EAS Android build after it
#   bin/deploy.sh --mobile-only    # just the EAS build; the host is not touched
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
MOBILE=0
MOBILE_ONLY=0
MOBILE_PROFILE="production"

usage() {
    sed -n '2,/^set -euo/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//; $d'
    cat <<'USAGE'
Options:
  --mobile [PROFILE] after deploying, start an EAS Android build (default: production)
  --mobile-only      start the EAS build and skip the host deploy entirely
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
        # An optional value: `--mobile preview` takes it, `--mobile --push` does
        # not. Anything starting with a dash is the next flag, not a profile.
        --mobile)
            MOBILE=1; shift
            [[ $# -gt 0 && "$1" != -* ]] && { MOBILE_PROFILE="$1"; shift; }
            ;;
        --mobile-only)
            MOBILE=1; MOBILE_ONLY=1; shift
            [[ $# -gt 0 && "$1" != -* ]] && { MOBILE_PROFILE="$1"; shift; }
            ;;
        -h|--help) usage; exit 0 ;;
        *) echo "unknown option: $1" >&2; usage >&2; exit 64 ;;
    esac
done

case "$BUILD_MODE" in auto|always|never) ;; *)
    echo "--build must be auto, always or never" >&2; exit 64 ;;
esac

if [[ -z "$HOST" && $MOBILE_ONLY -eq 0 ]]; then
    echo "No target host. Set DEPLOY_SSH_HOST or pass --host user@host." >&2
    exit 64
fi

say()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m !!\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31mFATAL\033[0m %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- mobile release
#
# The phone is a different axis from the host and deliberately stays opt-in: a
# server deploy is the common case and does not need a 20-minute build behind it.
# `--mobile` bolts one on after a successful deploy; `--mobile-only` is the
# release that is purely a client change.
#
# **It builds HEAD, not origin, which is the opposite of every other rule in
# this script.** EAS uploads a `git archive` of the current commit, so an
# unpushed commit *does* ship — the "only pushed work can deploy" guarantee at
# the top of this file covers the host and nothing else. Uncommitted changes are
# excluded, which is the trap worth knowing: an edit you can see in the editor
# will not be in the build, and a commit nobody else has will be.
#
# No `eas submit` here, on purpose. A build is an artifact and costs a queue
# slot; a submission is a release to real installs and wants a human deciding
# the day it happens.
mobile_build() {
    local dir="$REPO/apps/mobile"
    [[ -f "$dir/eas.json" ]] || die "no apps/mobile/eas.json — nothing to build"

    node -e '
      const profiles = require(process.argv[1]).build ?? {};
      if (!profiles[process.argv[2]]) {
        console.error(`no "${process.argv[2]}" profile in eas.json — have: ${Object.keys(profiles).join(", ")}`);
        process.exit(1);
      }
    ' "$dir/eas.json" "$MOBILE_PROFILE" || exit 64

    local head; head="$(git rev-parse --short HEAD)"
    local unpushed; unpushed="$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)"
    say "EAS build: android/$MOBILE_PROFILE from $head ($(git log -1 --format=%s))"
    (( unpushed > 0 )) && warn "$unpushed commit(s) on HEAD are not on origin and WILL be in this build"

    if (( DRY )); then
        echo "       would run: (cd apps/mobile && npx eas-cli build --platform android \\"
        echo "                     --profile $MOBILE_PROFILE --non-interactive --no-wait)"
        return 0
    fi

    # --no-wait so this returns with a build URL rather than holding the
    # terminal for the queue. --non-interactive so a missing credential fails
    # loudly instead of opening a prompt nobody is watching.
    #
    # Teed rather than captured: eas prints the queue position, the fingerprint
    # and the credential summary as it goes, and swallowing all of that to reach
    # one line would trade a live view of a slow command for a tidier ending.
    # The log is only re-read to pull the URL back out, because that one line is
    # the whole point of the run and it lands several screens above the prompt.
    local log; log="$(mktemp)"
    ( cd "$dir" && npx eas-cli build --platform android \
        --profile "$MOBILE_PROFILE" --non-interactive --no-wait ) 2>&1 | tee "$log"
    local status=${PIPESTATUS[0]}

    local url
    url="$(grep -oE 'https://expo\.dev/[^ ]*builds/[0-9a-f-]+' "$log" | head -1 || true)"
    rm -f "$log"

    (( status == 0 )) || die "eas build failed"

    echo
    if [[ -n "$url" ]]; then
        say "build queued: $url"
    else
        # A URL that did not match is not a failed build — eas has changed that
        # line before. Say where to look rather than implying nothing started.
        say "build queued — watch it at https://expo.dev/accounts/$(npx eas-cli whoami 2>/dev/null | head -1)/builds"
    fi
}

if (( MOBILE_ONLY )); then
    mobile_build
    exit 0
fi

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
#
# With S3_* configured that becomes three, and only two of them are backed up
# here: new photos go to the bucket, which has its own durability and is not
# something a deploy script should be tarring up on every push. The volume is
# still archived because everything written before the switch is still in it,
# and a `photos` row with a `file_path` has nowhere else to look.
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

# `db` and `web` are one container each and still carry a `container_name`.
# `api` deliberately does not — it is scaled, and Docker will not give two
# containers one name — so it is found by service instead.
for c in calorytracker-db calorytracker-web; do
    STATE="$(docker inspect -f '{{.State.Status}}' "$c" 2>/dev/null || echo missing)"
    [[ "$STATE" == running ]] || { warn "$c is $STATE"; FAIL=1; }
done

API_IDS=()
while read -r id; do
    [[ -n "$id" ]] && API_IDS+=("$id")
done < <($COMPOSE ps -q api 2>/dev/null || true)

if (( ${#API_IDS[@]} == 0 )); then
    warn "no api container is running"; FAIL=1
else
    say "api replicas: ${#API_IDS[@]}"
fi

# Every replica is asked, on its own loopback, rather than one request through
# the `api` alias: that alias round-robins, so a single probe can come back
# healthy while the other replica is crash-looping on boot and taking half the
# traffic with it. This is the check that would have caught the migration race.
#
# The API reports which credential source the agent resolved. Give each a few
# seconds — migrations run before the server binds, and with two replicas one of
# them waits on the other's migration lock before it even gets that far.
NO_CREDS=0
for id in "${API_IDS[@]}"; do
    NAME="$(docker inspect -f '{{.Name}}' "$id" 2>/dev/null | sed 's|^/||')"
    NAME="${NAME:-${id:0:12}}"

    HEALTH=""
    for _ in $(seq 1 15); do
        HEALTH="$(docker exec "$id" node -e \
            'fetch("http://127.0.0.1:4000/health").then(r=>r.text()).then(t=>console.log(t)).catch(()=>process.exit(1))' \
            2>/dev/null || true)"
        [[ -n "$HEALTH" ]] && break
        sleep 2
    done

    if [[ -n "$HEALTH" ]]; then
        printf '    %-22s %s\n' "$NAME" "$HEALTH"
        case "$HEALTH" in
            *claude-code-subscription*|*anthropic-api-key*) ;;
            *) NO_CREDS=1; FAIL=1 ;;
        esac
    else
        warn "$NAME did not answer /health"; FAIL=1
    fi
done

if (( NO_CREDS )); then
    warn "the agent has no credentials — chat will 503 until you run:
      cd $REPO && $COMPOSE run --rm api claude auth login"
fi

# By service, so this covers every replica at once.
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

# The phone, after the host and only if the host succeeded.
#
# `set -e` is doing the gating: the ssh above exits non-zero when the remote
# verification found problems, so a deploy that came up unhealthy never reaches
# this line. Building a client against an API that just failed its own health
# check is the wrong order to find that out in.
if (( MOBILE )); then
    echo
    mobile_build
fi
