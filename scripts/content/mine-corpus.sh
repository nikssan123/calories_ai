#!/usr/bin/env bash
# Read the production log corpus to find out how people actually write, so the
# marketing copy can be written in their register rather than in ours.
#
#   scripts/content/mine-corpus.sh                    # aggregate report
#   scripts/content/mine-corpus.sh --out              # ...and save it
#   scripts/content/mine-corpus.sh --user Nikolay     # one account, verbatim
#   scripts/content/mine-corpus.sh --print-sql        # print SQL, connect to nothing
#
# Every line in content/copy/cards.txt is currently written in an invented
# voice. `food_entries.description` holds the real one — the exact sentence a
# person typed, with `source` recording whether they typed it, spoke it,
# photographed it or entered it by hand. That is the best copy reference this
# project has, and nobody has ever read it.
#
# ## What this deliberately cannot do
#
# There is no mode that prints everybody's descriptions. That is the point of
# the script, not a gap in it.
#
# A food diary is health-adjacent personal data, and FRIENDS.md already settled
# the rule at a much smaller blast radius: a friend somebody *personally
# invited* still never sees their calorie numbers, only whether they showed up.
# A marketing audience is a larger room than that friend. So the split here is:
#
#   aggregate mode   counts, distributions, word frequencies. Shapes, never
#                    sentences. Safe to read, safe to quote, safe to paste
#                    into a deck.
#   --user mode      verbatim rows for exactly ONE named account. Use it on
#                    your own. It is the founder-POV format in
#                    CONTENT_ENGINE.md §5, and you are the data subject.
#
# Output defaults under content/out/, which .gitignore already covers, so a
# --user dump cannot be committed by an absent-minded `git add -A`.
#
# ## Safety
#
# The session is opened `SET TRANSACTION READ ONLY` inside psql's
# --single-transaction, so the server itself refuses a write however the SQL
# below is later edited. Nothing in here is destructive, and it should stay
# impossible for it to become destructive by accident.
#
# ## The one number worth looking for
#
# The correction report at the end. `food_entries` keeps created_at and
# updated_at separately, so an entry edited after it was logged is visible, and
# it can be split by `source`. If photo entries turn out to be corrected far
# more often than typed ones, that is a real measurement of the thing the new
# accuracy cards claim — and it came off your own users rather than off a press
# release. If they are corrected at the same rate, the cards are still honest
# and you have learned something more interesting.

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO"

HOST="${DEPLOY_SSH_HOST:-}"
CONTAINER="${DB_CONTAINER:-calorytracker-db}"
PGUSER_IN=""
PGDB_IN=""
WHO=""
LIMIT=200
SAVE=0
OUTFILE=""
PRINT_ONLY=0

usage() {
    sed -n '2,/^set -euo/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//; $d'
    cat <<'USAGE'
Options:
  --user WHO       verbatim rows for one account: a users.id or a display_name
  --limit N        rows in --user mode                    (default: 200)
  --out [FILE]     also write the report to a file
                   (default: content/out/corpus/<mode>-<date>.txt)
  --host USER@HOST ssh target                             (default: $DEPLOY_SSH_HOST)
  --container NAME db container on the host               (default: calorytracker-db)
  --db-user NAME   postgres role     (default: read from the container's env)
  --db NAME        database name     (default: read from the container's env)
  --print-sql      print the SQL and exit; opens no connection
  -h, --help       this text
USAGE
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --user)      WHO="$2"; shift 2 ;;
        --limit)     LIMIT="$2"; shift 2 ;;
        --host)      HOST="$2"; shift 2 ;;
        --container) CONTAINER="$2"; shift 2 ;;
        --db-user)   PGUSER_IN="$2"; shift 2 ;;
        --db)        PGDB_IN="$2"; shift 2 ;;
        --print-sql) PRINT_ONLY=1; shift ;;
        # An optional value, the same shape as deploy.sh's --mobile: a path if
        # one follows, the default filename if the next token is another flag.
        --out)
            SAVE=1; shift
            [[ $# -gt 0 && "$1" != -* ]] && { OUTFILE="$1"; shift; }
            ;;
        -h|--help)   usage; exit 0 ;;
        *) echo "unknown option: $1" >&2; usage >&2; exit 64 ;;
    esac
done

[[ "$LIMIT" =~ ^[0-9]+$ ]] || { echo "--limit must be a number" >&2; exit 64; }

say()  { printf '\033[1;34m==>\033[0m %s\n' "$*" >&2; }
warn() { printf '\033[1;33m !!\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31mFATAL\033[0m %s\n' "$*" >&2; exit 1; }

# ------------------------------------------------------------------ the queries
#
# Quoted heredocs throughout: the SQL is full of backslashes (regex classes) and
# dollars, and none of it is for the shell to interpret.

aggregate_sql() {
cat <<'SQL'
SET TRANSACTION READ ONLY;
\pset pager off
\pset null '·'

\echo ''
\echo '== scale ─ is this a corpus yet, or is it still you and the seed data?'
SELECT (SELECT count(*) FROM users)                        AS accounts,
       (SELECT count(*) FROM users WHERE is_setup_complete) AS onboarded,
       (SELECT count(DISTINCT user_id) FROM food_entries)   AS have_logged,
       (SELECT count(*) FROM food_entries)                  AS entries,
       (SELECT count(*) FROM food_items)                    AS items,
       (SELECT min(local_date) FROM food_entries)           AS first_day,
       (SELECT max(local_date) FROM food_entries)           AS last_day;

\echo ''
\echo '== concentration ─ how much of the corpus is a single account (no names)'
SELECT rank, entries,
       round(100.0 * entries / sum(entries) OVER (), 1) AS pct_of_corpus
FROM (SELECT row_number() OVER (ORDER BY count(*) DESC) AS rank,
             count(*) AS entries
      FROM food_entries GROUP BY user_id) t
ORDER BY rank LIMIT 10;

\echo ''
\echo '== input mix ─ which composer people actually reach for'
SELECT source, count(*) AS entries,
       round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS pct
FROM food_entries GROUP BY source ORDER BY entries DESC;

\echo ''
\echo '== length ─ how long a real entry is. Write the cards at median_words.'
SELECT source, count(*) AS n,
       round(avg(length(description)))                                  AS avg_chars,
       percentile_disc(0.5) WITHIN GROUP (ORDER BY length(description))  AS median_chars,
       percentile_disc(0.9) WITHIN GROUP (ORDER BY length(description))  AS p90_chars,
       percentile_disc(0.5) WITHIN GROUP (
         ORDER BY array_length(regexp_split_to_array(btrim(description), '\s+'), 1)
       )                                                                 AS median_words
FROM food_entries
WHERE btrim(description) <> ''
GROUP BY source ORDER BY n DESC;

\echo ''
\echo '== compound ─ items parsed out of one sentence'
SELECT n_items, count(*) AS entries
FROM (SELECT e.id, count(i.id) AS n_items
      FROM food_entries e LEFT JOIN food_items i ON i.entry_id = e.id
      GROUP BY e.id) t
GROUP BY n_items ORDER BY n_items;

\echo ''
\echo '== register ─ do people hedge, or do they weigh? This is the copy answer.'
SELECT m.marker,
       count(*) FILTER (WHERE e.description ~* m.pattern)                  AS entries,
       round(100.0 * count(*) FILTER (WHERE e.description ~* m.pattern)
             / nullif(count(*), 0), 1)                                     AS pct
FROM food_entries e
CROSS JOIN (VALUES
    ('about',       '\mabout\M'),
    ('roughly',     '\mroughly\M'),
    ('some',        '\msome\M'),
    ('a bit of',    '\ma bit\M'),
    ('half',        '\mhalf\M'),
    ('a couple',    '\mcouple\M'),
    ('maybe',       '\mmaybe\M'),
    ('-ish',        '\m\w+ish\M'),
    ('big / large', '\m(big|large)\M'),
    ('small',       '\msmall\M'),
    ('a weight',    '\m\d+\s*(g|kg|ml|oz)\M'),
    ('any number',  '\d')
  ) AS m(marker, pattern)
GROUP BY m.marker, m.pattern
ORDER BY entries DESC;

\echo ''
\echo '== vocabulary ─ top words. Frequencies only; no sentence leaves the host.'
SELECT word, count(*) AS n, count(DISTINCT user_id) AS accounts
FROM (SELECT e.user_id,
             lower(btrim(w, '.,;:!?()"''')) AS word
      FROM food_entries e,
           regexp_split_to_table(e.description, '\s+') AS w) t
WHERE length(word) >= 3
GROUP BY word
ORDER BY n DESC
LIMIT 60;

\echo ''
\echo '== confidence ─ what the parser thought of its own answer'
SELECT source, confidence, count(*) AS entries
FROM food_entries GROUP BY source, confidence ORDER BY source, confidence;

\echo ''
\echo '== corrections ─ the number the accuracy cards are standing on'
\echo '   (2s window because created_at and updated_at are both set on insert)'
SELECT count(*)                                                            AS entries,
       count(*) FILTER (WHERE updated_at > created_at + interval '2 seconds') AS corrected,
       round(100.0 * count(*) FILTER (WHERE updated_at > created_at + interval '2 seconds')
             / nullif(count(*), 0), 1)                                      AS pct,
       percentile_disc(0.5) WITHIN GROUP (ORDER BY updated_at - created_at)
         FILTER (WHERE updated_at > created_at + interval '2 seconds')       AS median_time_to_fix
FROM food_entries;

\echo ''
\echo '== corrections by source ─ is a photo fixed more often than a sentence?'
SELECT source, count(*) AS entries,
       count(*) FILTER (WHERE updated_at > created_at + interval '2 seconds') AS corrected,
       round(100.0 * count(*) FILTER (WHERE updated_at > created_at + interval '2 seconds')
             / nullif(count(*), 0), 1)                                      AS pct
FROM food_entries GROUP BY source ORDER BY entries DESC;
\echo ''
SQL
}

user_sql() {
cat <<SQL
SET TRANSACTION READ ONLY;
\\pset pager off
\\pset null '·'
\\set who '$(printf '%s' "$WHO" | sed "s/'/''/g")'

\\echo ''
\\echo '== resolving the account'
SELECT id, display_name, created_at::date AS joined,
       (SELECT count(*) FROM food_entries e WHERE e.user_id = u.id) AS entries
FROM users u
WHERE u.id::text = :'who' OR lower(u.display_name) = lower(:'who');

\\echo ''
\\echo '== entries, newest first ─ this is personal data. Keep it off the repo.'
SELECT e.local_date, e.meal, e.source, e.confidence,
       e.description,
       round(sum(i.kcal))      AS kcal,
       round(sum(i.protein_g)) AS protein_g,
       count(i.id)             AS items,
       (e.updated_at > e.created_at + interval '2 seconds') AS was_corrected
FROM food_entries e
LEFT JOIN food_items i ON i.entry_id = e.id
WHERE e.user_id = (SELECT id FROM users
                   WHERE id::text = :'who' OR lower(display_name) = lower(:'who')
                   LIMIT 1)
GROUP BY e.id
ORDER BY e.eaten_at DESC
LIMIT $LIMIT;
\\echo ''
SQL
}

MODE="aggregate"
[[ -n "$WHO" ]] && MODE="user"
SQL_TEXT="$([[ "$MODE" = user ]] && user_sql || aggregate_sql)"

if (( PRINT_ONLY )); then
    printf '%s\n' "$SQL_TEXT"
    exit 0
fi

# ------------------------------------------------------------------- connection

[[ -n "$HOST" ]] || die "No target host. Set DEPLOY_SSH_HOST or pass --host user@host.
Prod Postgres is on the compose-internal network with no published ports, so
there is no route to it that does not go through the box."

ssh -o BatchMode=yes -o ConnectTimeout=10 "$HOST" true 2>/dev/null \
    || die "cannot ssh to $HOST (needs key-based auth)"

# Ask the container what its own credentials are rather than assuming the
# compose defaults. A host whose .env sets POSTGRES_USER to anything else would
# otherwise fail here with a role-does-not-exist that reads like a bug.
if [[ -z "$PGUSER_IN" || -z "$PGDB_IN" ]]; then
    detected="$(ssh -o BatchMode=yes "$HOST" \
        "docker exec '$CONTAINER' printenv POSTGRES_USER POSTGRES_DB" 2>/dev/null || true)"
    [[ -n "$detected" ]] || die "container '$CONTAINER' is not running on $HOST
   check: ssh $HOST 'docker ps --filter name=$CONTAINER'"
    PGUSER_IN="${PGUSER_IN:-$(sed -n 1p <<<"$detected")}"
    PGDB_IN="${PGDB_IN:-$(sed -n 2p <<<"$detected")}"
fi

say "$MODE report — $HOST → $CONTAINER ($PGUSER_IN@$PGDB_IN)"

if (( SAVE )); then
    if [[ -z "$OUTFILE" ]]; then
        OUTFILE="content/out/corpus/${MODE}-$(date +%Y%m%d-%H%M%S).txt"
    fi
    mkdir -p "$(dirname "$OUTFILE")"
fi

# --single-transaction wraps the whole script in one BEGIN, so the READ ONLY on
# its first line governs every statement after it. ON_ERROR_STOP means a typo in
# one query fails the run instead of quietly skipping a section.
report() {
    printf '%s\n' "$SQL_TEXT" | ssh -o BatchMode=yes "$HOST" \
        "docker exec -i '$CONTAINER' psql -U '$PGUSER_IN' -d '$PGDB_IN' \
             -v ON_ERROR_STOP=1 --single-transaction -f -"
}

if (( SAVE )); then
    report | tee "$OUTFILE"
    say "saved to $OUTFILE"
    [[ "$MODE" = user ]] && warn "that file contains one person's food diary — content/out/ is gitignored, keep it there"
else
    report
fi
