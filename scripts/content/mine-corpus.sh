#!/usr/bin/env bash
# Read the production log corpus to find out how people actually write, so the
# marketing copy can be written in their register rather than in ours.
#
#   scripts/content/mine-corpus.sh                    # aggregate report
#   scripts/content/mine-corpus.sh --out              # ...and save it
#   scripts/content/mine-corpus.sh --raw              # your own rows, verbatim
#   scripts/content/mine-corpus.sh --print-sql        # print SQL, connect to nothing
#
# Every line in content/copy/cards.txt was once written in an invented voice.
# This script exists to find the real one. content/copy/corpus.md holds the
# findings from the 2026-09-05 run; read that before re-deriving anything.
#
# ## Which column is the corpus (this was wrong once, do not get it wrong again)
#
# `food_entries.description` is NOT the sentence a person typed. For every
# source but `manual` it is written by the model — see the tool schema in
# apps/api/src/ai/tools.ts, which asks for a "Short human label for the whole
# meal, e.g. \"Chicken, rice and salad\"". Measuring register on that column
# measures the parser, and what it reports back is its own prompt example:
# 4-word labels, zero hedging, a comma and an "and".
#
# The typed corpus is `chat_messages WHERE role = 'user'`. Measured there, the
# same users write a median of 8 words and put a number in 47% of messages.
# The two are so different that reading the wrong one inverts the answer.
#
# So the aggregate report below has two halves, and they are labelled:
#   PEOPLE  chat_messages  — register, length, hedging, vocabulary
#   PARSER  food_entries   — input mix, compounding, confidence, corrections
#
# Exclude the onboarding template ("Hi — I'm new here...") from any word
# frequency. It ships in two apostrophe variants and 12 accounts have sent it,
# which is enough to outrank real food words.
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
#   --raw mode       verbatim rows, and ONLY ever for the owner account in
#                    OWNER_EMAIL below. It is the founder-POV format in
#                    CONTENT_ENGINE.md §5, and it is allowed for exactly one
#                    reason: you are the data subject of your own diary.
#
# --raw used to take any display_name. It does not any more. Naming somebody
# else is now a hard error rather than a judgement call made at 1am, because
# the judgement is always the same and there is no reason to keep asking it.
# Override the owner with CORPUS_OWNER_EMAIL only to run this on a machine
# whose owner is a different person, never to read a second account.
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
RAW=0
# The only account whose sentences this script will ever print.
OWNER_EMAIL="${CORPUS_OWNER_EMAIL:-nikssan123@gmail.com}"
LIMIT=200
SAVE=0
OUTFILE=""
PRINT_ONLY=0

usage() {
    sed -n '2,/^set -euo/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//; $d'
    cat <<'USAGE'
Options:
  --raw [WHO]      verbatim rows for the owner account ($OWNER_EMAIL).
                   WHO is optional and is only checked: pass an id, email or
                   display_name and it must resolve to the owner, or the run
                   is refused. There is no way to name a second account.
  --user WHO       deprecated spelling of --raw
  --limit N        rows in --raw mode                     (default: 200)
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
        --raw|--user)
            RAW=1; shift
            [[ $# -gt 0 && "$1" != -* ]] && { WHO="$1"; shift; }
            ;;
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
\echo '#############################################################'
\echo '#  PEOPLE ─ chat_messages. What a person actually typed.     #'
\echo '#############################################################'
\echo ''
\echo '== scale ─ is this a corpus yet, or is it still you and the testers?'
SELECT count(*) FILTER (WHERE role = 'user')      AS typed_msgs,
       count(*) FILTER (WHERE role = 'assistant') AS replies,
       count(DISTINCT user_id) FILTER (WHERE role = 'user') AS accounts,
       min(created_at)::date AS first_day,
       max(created_at)::date AS last_day
FROM chat_messages;

\echo ''
\echo '== templates ─ anything 3+ accounts sent verbatim is onboarding, not a person'
\echo '   (every query below excludes these)'
SELECT count(DISTINCT user_id) AS accounts, count(*) AS msgs, left(content, 60) AS content
FROM chat_messages WHERE role = 'user'
GROUP BY content HAVING count(DISTINCT user_id) >= 3
ORDER BY accounts DESC;

\echo ''
\echo '== length ─ how long a typed message is. Write the cards at median_words.'
WITH real_msgs AS (
  SELECT * FROM chat_messages WHERE role = 'user' AND btrim(content) <> ''
    AND content NOT IN (SELECT content FROM chat_messages WHERE role = 'user'
                        GROUP BY content HAVING count(DISTINCT user_id) >= 3))
SELECT count(*) AS n, count(DISTINCT user_id) AS accounts,
       round(avg(length(content)))                                   AS avg_chars,
       percentile_disc(0.5) WITHIN GROUP (ORDER BY length(content))   AS median_chars,
       percentile_disc(0.9) WITHIN GROUP (ORDER BY length(content))   AS p90_chars,
       percentile_disc(0.5) WITHIN GROUP (
         ORDER BY array_length(regexp_split_to_array(btrim(content), '\s+'), 1)) AS median_words,
       percentile_disc(0.9) WITHIN GROUP (
         ORDER BY array_length(regexp_split_to_array(btrim(content), '\s+'), 1)) AS p90_words
FROM real_msgs;

\echo ''
\echo '== shape ─ do people capitalise, punctuate, or ask it anything?'
WITH real_msgs AS (
  SELECT * FROM chat_messages WHERE role = 'user' AND btrim(content) <> ''
    AND content NOT IN (SELECT content FROM chat_messages WHERE role = 'user'
                        GROUP BY content HAVING count(DISTINCT user_id) >= 3))
SELECT count(*) AS msgs,
       count(*) FILTER (WHERE content ~ '^[a-zа-я]')  AS starts_lowercase,
       count(*) FILTER (WHERE content ~ '[.!?]$')     AS ends_punctuated,
       count(*) FILTER (WHERE content ~ ',')          AS has_comma,
       count(*) FILTER (WHERE content ~ '\?')         AS is_a_question,
       count(*) FILTER (WHERE content ~ '[а-яА-Я]')   AS cyrillic
FROM real_msgs;

\echo ''
\echo '== register ─ do people hedge, or do they weigh? This is the copy answer.'
\echo '   Read the Bulgarian markers: the English ones being 0 is about who'
\echo '   is using the app, not about whether anybody hedges.'
WITH real_msgs AS (
  SELECT * FROM chat_messages WHERE role = 'user'
    AND content NOT IN (SELECT content FROM chat_messages WHERE role = 'user'
                        GROUP BY content HAVING count(DISTINCT user_id) >= 3))
SELECT m.marker,
       count(*) FILTER (WHERE c.content ~* m.pattern)                     AS msgs,
       round(100.0 * count(*) FILTER (WHERE c.content ~* m.pattern)
             / nullif(count(*), 0), 1)                                    AS pct
FROM real_msgs c
CROSS JOIN (VALUES
    ('any number',    '\d'),
    ('bare number',   '\m\d+\M'),
    ('грама (bg)',    '\mграм'),
    ('около (bg)',    '\mоколо\M'),
    ('малко (bg)',    '\mмалко\M'),
    ('лъжица (bg)',   '\mлъжиц'),
    ('парче (bg)',    '\mпарче'),
    ('a weight',      '\m\d+\s*(g|gr|grams?|kg|ml|oz)\M'),
    ('about',         '\mabout\M'),
    ('roughly',       '\mroughly\M'),
    ('some',          '\msome\M'),
    ('a bit',         '\ma bit\M'),
    ('half',          '\mhalf\M'),
    ('couple',        '\mcouple\M'),
    ('maybe',         '\mmaybe\M'),
    ('-ish',          '\m\w+ish\M'),
    ('big / large',   '\m(big|large)\M'),
    ('small',         '\msmall\M')
  ) AS m(marker, pattern)
GROUP BY m.marker, m.pattern
ORDER BY msgs DESC;

\echo ''
\echo '== vocabulary ─ top typed words. Frequencies only; no sentence leaves the host.'
WITH real_msgs AS (
  SELECT * FROM chat_messages WHERE role = 'user'
    AND content NOT IN (SELECT content FROM chat_messages WHERE role = 'user'
                        GROUP BY content HAVING count(DISTINCT user_id) >= 3))
SELECT word, count(*) AS n, count(DISTINCT user_id) AS accounts
FROM (SELECT user_id, lower(btrim(w, '.,;:!?()"''')) AS word
      FROM real_msgs, regexp_split_to_table(content, '\s+') AS w) t
WHERE length(word) >= 3
GROUP BY word ORDER BY n DESC LIMIT 60;

\echo ''
\echo '#############################################################'
\echo '#  PARSER ─ food_entries. What the model made of it.         #'
\echo '#############################################################'
\echo ''
\echo '== scale'
SELECT (SELECT count(*) FROM users)                        AS accounts,
       (SELECT count(*) FROM users WHERE is_setup_complete) AS onboarded,
       (SELECT count(DISTINCT user_id) FROM food_entries)   AS have_logged,
       (SELECT count(*) FROM food_entries)                  AS entries,
       (SELECT count(*) FROM food_items)                    AS items,
       (SELECT min(local_date) FROM food_entries)           AS first_day,
       (SELECT max(local_date) FROM food_entries)           AS last_day;

\echo ''
\echo '== concentration ─ how much of the corpus is a single account (no names)'
SELECT rank, entries, days_logged,
       round(entries::numeric / nullif(days_logged, 0), 1) AS per_day,
       round(100.0 * entries / sum(entries) OVER (), 1)    AS pct_of_corpus
FROM (SELECT row_number() OVER (ORDER BY count(*) DESC) AS rank,
             count(*) AS entries, count(DISTINCT local_date) AS days_logged
      FROM food_entries GROUP BY user_id) t
ORDER BY rank LIMIT 10;

\echo ''
\echo '== input mix ─ which composer people actually reach for'
SELECT source, count(*) AS entries,
       round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS pct
FROM food_entries GROUP BY source ORDER BY entries DESC;

\echo ''
\echo '== label length ─ NOT a register measurement. This is the model tidying up.'
\echo '   Compare against the PEOPLE length above: the gap is what it strips.'
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
\echo '== size ─ the kcal of a real logged meal'
SELECT percentile_disc(0.1) WITHIN GROUP (ORDER BY kcal) AS p10,
       percentile_disc(0.5) WITHIN GROUP (ORDER BY kcal) AS median,
       percentile_disc(0.9) WITHIN GROUP (ORDER BY kcal) AS p90
FROM (SELECT e.id, round(sum(i.kcal)) AS kcal
      FROM food_entries e JOIN food_items i ON i.entry_id = e.id
      GROUP BY e.id) t;

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
\\set owner '$(printf '%s' "$OWNER_EMAIL" | sed "s/'/''/g")'
\\set who '$(printf '%s' "$WHO" | sed "s/'/''/g")'

-- The owner is resolved from OWNER_EMAIL and nothing else. Every query below
-- re-resolves it inline, so there is no argument to this script that widens it
-- to a second account. If WHO was passed it has already been checked in the
-- shell; this is the second lock on the same door.
\\echo ''
\\echo '== the account whose sentences this will print'
SELECT id, display_name, email, created_at::date AS joined,
       (SELECT count(*) FROM chat_messages c
         WHERE c.user_id = u.id AND c.role = 'user')       AS typed_msgs,
       (SELECT count(*) FROM food_entries e
         WHERE e.user_id = u.id)                            AS entries
FROM users u WHERE lower(u.email) = lower(:'owner');


\\echo ''
\\echo '== typed messages, newest first ─ THE corpus. Personal data. Keep it off the repo.'
SELECT c.created_at AT TIME ZONE 'Europe/Sofia' AS typed_at,
       array_length(regexp_split_to_array(btrim(c.content), '\s+'), 1) AS words,
       c.content
FROM chat_messages c
WHERE c.user_id = (SELECT id FROM users WHERE lower(email) = lower(:'owner'))
  AND c.role = 'user'
ORDER BY c.created_at DESC
LIMIT $LIMIT;

\\echo ''
\\echo '== entries, newest first ─ what the parser made of those sentences'
SELECT e.local_date, e.meal, e.source, e.confidence,
       e.description,
       round(sum(i.kcal))      AS kcal,
       round(sum(i.protein_g)) AS protein_g,
       count(i.id)             AS items,
       (e.updated_at > e.created_at + interval '2 seconds') AS was_corrected
FROM food_entries e
LEFT JOIN food_items i ON i.entry_id = e.id
WHERE e.user_id = (SELECT id FROM users WHERE lower(email) = lower(:'owner'))
GROUP BY e.id
ORDER BY e.eaten_at DESC
LIMIT $LIMIT;
\\echo ''
SQL
}

MODE="aggregate"
(( RAW )) && MODE="raw"
SQL_TEXT="$([[ "$MODE" = raw ]] && user_sql || aggregate_sql)"

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

# ---------------------------------------------------------------- owner check
#
# --raw prints somebody's food diary, and the only person that is defensible
# for is the person whose diary it is. WHO is optional and purely a
# confirmation: whatever is passed must resolve to OWNER_EMAIL. It cannot
# widen the query — user_sql() filters on the email regardless — so this check
# exists to fail loudly on `--raw someone-else` rather than silently handing
# back the owner's rows under someone else's name.

if [[ "$MODE" = raw ]]; then
    owner_row="$(printf '%s' \
        "SELECT display_name || ' <' || email || '>' FROM users
          WHERE lower(email) = lower('${OWNER_EMAIL//\'/\'\'}');" \
        | ssh -o BatchMode=yes "$HOST" \
            "docker exec -i '$CONTAINER' psql -U '$PGUSER_IN' -d '$PGDB_IN' -tAq -f -" 2>/dev/null)"

    [[ -n "$owner_row" ]] || die "no account with email $OWNER_EMAIL on this database.
   --raw only ever reads the owner account. Set CORPUS_OWNER_EMAIL if this
   machine belongs to somebody else."

    if [[ -n "$WHO" ]]; then
        match="$(printf '%s' \
            "SELECT 1 FROM users
              WHERE lower(email) = lower('${OWNER_EMAIL//\'/\'\'}')
                AND (id::text = '${WHO//\'/\'\'}'
                     OR lower(email) = lower('${WHO//\'/\'\'}')
                     OR lower(display_name) = lower('${WHO//\'/\'\'}'));" \
            | ssh -o BatchMode=yes "$HOST" \
                "docker exec -i '$CONTAINER' psql -U '$PGUSER_IN' -d '$PGDB_IN' -tAq -f -" 2>/dev/null)"
        [[ "$match" = 1 ]] || die "'$WHO' is not the owner account ($owner_row).
   --raw prints a person's food diary and will only ever do that for the owner.
   Drop the argument to read your own rows; there is no flag that reads theirs."
    fi

    warn "raw mode — printing $owner_row verbatim"
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
