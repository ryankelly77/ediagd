#!/usr/bin/env bash
# =============================================================================
# db:migrate — a production migration that CANNOT run without a verified backup
# =============================================================================
#
# Not a sequence of steps that happen in the right order. The push is physically
# unreachable unless the dump has been written AND read back AND found to contain
# the tables we expect. Same construction as 0128's placement gate and the
# mileage loader: the unsafe state is not representable rather than merely
# avoided.
#
#   1  dump          pg_dump -Fc --no-owner --no-privileges
#   2  VERIFY        pg_restore --list the file just written, and assert its
#                    table of contents names tables that must exist
#   3  push          supabase db push --linked [--yes] <-- only reachable via 2
#   4  confirm       read supabase_migrations.schema_migrations, not the push
#                    output, because a runner that reports what it intended is
#                    the oldest defect in this project
#
# A dump that writes without error and lists nothing is not a backup. That is
# the failure you discover when you need it, which is the worst possible moment,
# so step 2 exists and step 3 is a child of it.
#
# ---------------------------------------------------------------------------
# THE PASSWORD
# ---------------------------------------------------------------------------
# Read from the macOS Keychain inline, into the environment of the single command
# that needs it, and never assigned to a shell variable that outlives the call.
# It is never echoed, logged, written to a file, or included in an error message.
# `set -x` is deliberately never used in this script for the same reason.
#
# ---------------------------------------------------------------------------
# PROVING THE GATE
# ---------------------------------------------------------------------------
#   ./scripts/db-migrate.sh --verify-only <file>
#   ./scripts/db-migrate.sh --guard-only
#
# run step 2 and step 0a alone and touch nothing. Each calls the SAME function
# the real path calls — so a refusal demonstrated there is a refusal
# demonstrated in the migration, not in a copy of it. A gate that has never
# refused is a comment; a gate that has never ACCEPTED is worse, because a
# refusal wears the costume of care. --guard-only exists so step 0a's
# acceptance can be observed without migrating production to see it.
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# THE CONSENT THE CLI ASKS FOR, CARRIED RATHER THAN ROUTED AROUND
# ---------------------------------------------------------------------------
# `supabase db push` refuses a hosted mutation when it cannot prompt — in an
# agent run it exits with HostedMutationConsentRequiredError and changes nothing.
# That refusal is correct and it is the one thing in this script a backup cannot
# substitute for: the dump proves the data survives, not that anybody asked for
# the change.
#
# So the consent is an ARGUMENT, not a default. Without --yes this script stays
# exactly as interactive as it was; with it, the person running it is recording
# that they have already said to apply these migrations to production. It is
# never implied by anything else — not by being on main, not by a clean guard,
# not by an environment variable, because an env var set once in a shell profile
# is a confirmation nobody gives again.
ASSUME_YES=0
for arg in "$@"; do
  [[ "$arg" == "--yes" ]] && ASSUME_YES=1
done

KEYCHAIN_SERVICE="ediagd-prod-db"
DB_HOST="aws-0-us-east-2.pooler.supabase.com"
DB_PORT="5432"
DB_USER="postgres.kpbholbgfccwbzggcvbb"
DB_NAME="postgres"
BACKUP_DIR="${HOME}/ediagd-backups"
KEEP=10

# Tables that MUST appear in a dump's table of contents. Not an exhaustive list —
# a spot-check broad enough that a dump missing any of them is not this database.
# "the TOC is non-empty" would pass on a dump of the wrong server.
REQUIRED_TABLES=(
  app_user membership rooftop content certification module
  quiz_question perf_period advisor_op_metric game_settings
)
MIN_TOC_ENTRIES=200

say()  { printf '  %s\n' "$*"; }
fail() { printf '\n  REFUSING — %s\n\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# STEP 2, AS A FUNCTION, SO THE REAL PATH AND THE PROOF SHARE ONE DEFINITION
# ---------------------------------------------------------------------------
verify_dump() {
  local f="$1"

  [[ -e "$f" ]] || fail "no such dump file: $f"
  [[ -f "$f" ]] || fail "not a regular file: $f"
  [[ -r "$f" ]] || fail "dump is not readable (permissions): $f"

  local bytes
  bytes=$(stat -f%z "$f")
  say "dump size: ${bytes} bytes"
  # A real dump of this database is tens of megabytes. 1MB is far below that and
  # far above an empty or header-only file, so it separates the two without
  # pretending to know the exact size.
  (( bytes > 1048576 )) || fail "dump is only ${bytes} bytes — too small to be this database"

  # THE ACTUAL READ-BACK. pg_restore --list parses the archive; a truncated or
  # corrupt custom-format dump fails here rather than at restore time.
  local toc
  if ! toc=$(pg_restore --list "$f" 2>&1); then
    fail "pg_restore --list could not read the dump — it is corrupt or truncated
             $(printf '%s' "$toc" | head -3)"
  fi

  local entries
  entries=$(grep -cvE '^;|^$' <<< "$toc" || true)
  say "table of contents: ${entries} entries"
  (( entries >= MIN_TOC_ENTRIES )) \
    || fail "table of contents has only ${entries} entries (expected >= ${MIN_TOC_ENTRIES}) — this dump is not a backup"

  # AND IT HAS TO BE *THIS* DATABASE. Entry count alone would pass on a dump of
  # something else entirely.
  #
  # HERESTRINGS, NOT PIPES, AND THE REASON IS NOT STYLE.
  # `printf ... | grep -q` under `set -o pipefail` reports FAILURE ON A SUCCESSFUL
  # MATCH: grep -q exits the instant it matches, printf then dies with EPIPE, and
  # pipefail promotes that to the pipeline's status. The first run of this gate
  # refused its own good 24MB dump for exactly that reason and named all ten
  # tables as missing while every one of them was present.
  #
  # It failed in the SAFE direction, which is why it would survive review — a
  # false refusal looks like caution. The same construction in a check that
  # passes on match would have been silently wrong. `<<<` is not a pipeline, so
  # pipefail has nothing to misread.
  local missing=()
  local t
  for t in "${REQUIRED_TABLES[@]}"; do
    grep -qE "TABLE (DATA )?public ${t}([[:space:]]|$)" <<< "$toc" || missing+=("$t")
  done
  if (( ${#missing[@]} > 0 )); then
    fail "dump does not contain expected table(s): ${missing[*]}
             The file parsed, but it is not a backup of this database."
  fi
  say "all ${#REQUIRED_TABLES[@]} required tables present in the TOC"
  return 0
}

# ---------------------------------------------------------------------------
# STEP 0a, AS A FUNCTION, FOR THE SAME REASON verify_dump IS ONE
# ---------------------------------------------------------------------------
# A gate must be proven to ACCEPT a known-good input as well as refuse a bad
# one, or "it refused" is the only evidence and that is compatible with the gate
# being broken. The acceptance half is the one that gets skipped — and here it
# was impossible to run at all, because the only path that reached it went on to
# dump and push production. A gate whose success case can only be observed by
# migrating the live database has no acceptance test.
#
# So the guard is a function, --guard-only calls it and exits, and both halves
# are demonstrable against the real thing rather than a copy of it.
assert_current_main() {
  # One remedy, printed for every refusal this gate makes. The caller does not
  # need to know WHICH of the three conditions failed — the fix is the same
  # line in all three cases, and a longer message invites negotiating with it.
  local remedy='git checkout main && git pull'

  [[ "$(git rev-parse --abbrev-ref HEAD)" == "main" ]] || fail "$remedy"

  # origin/main must be re-read. A stale remote-tracking ref makes "not behind"
  # true by default, which is the silent-pass shape this project keeps paying
  # for: the check would be holding its opinion from whenever somebody last
  # fetched. FETCH_HEAD is used below rather than refs/remotes/origin/main for
  # the same reason — it is what this fetch just observed.
  git fetch --quiet origin main 2>/dev/null || fail "$remedy"

  # Behind means origin/main holds commits this checkout does not. Counting the
  # other direction (ahead) is deliberately NOT a refusal: an unpushed local
  # commit on main is a different problem, and this gate answers one question.
  (( $(git rev-list --count HEAD..FETCH_HEAD) == 0 )) || fail "$remedy"

  say "on main, up to date with origin/main"
  return 0
}

# ---- --guard-only: step 0a alone, touching nothing --------------------------
if [[ "${1:-}" == "--guard-only" ]]; then
  printf '\n  GUARD ONLY — the database is not touched\n'
  assert_current_main
  printf '\n  checkout accepted.\n\n'
  exit 0
fi

# ---- --verify-only: step 2 alone, against any file, touching nothing --------
if [[ "${1:-}" == "--verify-only" ]]; then
  [[ -n "${2:-}" ]] || { echo "usage: $0 --verify-only <file>" >&2; exit 2; }
  printf '\n  VERIFY ONLY — the database is not touched\n'
  say "file: $2"
  verify_dump "$2"
  printf '\n  dump verified.\n\n'
  exit 0
fi

# =============================================================================
# THE REAL PATH
# =============================================================================
printf '\n  db:migrate — prod\n'
say "host: ${DB_HOST}:${DB_PORT}  user: ${DB_USER}"

command -v pg_dump    >/dev/null || fail "pg_dump is not on PATH"
command -v pg_restore >/dev/null || fail "pg_restore is not on PATH"

# ---- version check, stated rather than assumed ------------------------------
CLIENT_VER=$(pg_dump --version | sed -E 's/.* ([0-9]+)\.[0-9]+.*/\1/')
SERVER_VER=$(PGPASSWORD="$(security find-generic-password -s "$KEYCHAIN_SERVICE" -w)" \
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc \
  "select current_setting('server_version_num')::int / 10000" 2>/dev/null) \
  || fail "could not reach the server to read its version"
say "pg_dump $(pg_dump --version | awk '{print $3}')  ->  server major ${SERVER_VER}"
# pg_dump must be >= the server. An OLDER client that appears to work is exactly
# the shape of problem this project keeps finding.
(( CLIENT_VER >= SERVER_VER )) \
  || fail "pg_dump is major ${CLIENT_VER} against a major ${SERVER_VER} server.
             Use a matching client (e.g. /opt/homebrew/opt/postgresql@${SERVER_VER}/bin)
             rather than forcing the dump."

# ---- STEP 0: THE MIGRATION MUST HAVE A PATH INTO main ----------------------
#
# 0129 and 0130 were applied to production and their files never reached `main`.
# Both were committed and pushed — to a branch whose PR had already been merged
# and closed 27 minutes earlier. The push succeeded, the ledger recorded the
# versions, the dump was verified, and the live schema was correct while the
# source of it existed nowhere anybody would look.
#
# EVERY EXISTING CHECK IN THIS SCRIPT PASSED. The gate verified the backup and
# read the ledger back, and neither of those can see version control. That is the
# eleventh rule again — a total computed inside the filter cannot see what the
# filter removed, and the filter here was "things about the database".
#
# So before anything is dumped or pushed, each PENDING migration must be:
#
#   tracked      not a new file nobody has added
#   committed    no uncommitted edits, so the applied text is the recorded text
#   routed       ON main, AND main not behind origin/main
#
# "Routed" is the one that catches what happened. Committed-and-pushed was true
# and insufficient: the branch was a dead end.
#
# ---------------------------------------------------------------------------
# 0a: THE CHECKOUT ITSELF — the standing rule, enforced here rather than asked
# ---------------------------------------------------------------------------
# Routing used to accept "on a branch with an OPEN pull request". That let a
# migration be applied to production BEFORE the PR carrying it was merged, so
# the live schema could lead main by however long the review took — and if the
# PR was then changed or closed, lead it permanently.
#
# The rule is now the stricter one: every PR branches from current main, an
# applied migration is never edited, and its change is the next number. All
# three hold only if production is migrated FROM main, with main up to date.
# So the gate is the checkout, and this is where it is enforced; a rule that
# lives only in a document is a rule somebody has to remember.
#
# This SUPERSEDES the open-PR path rather than sitting alongside it. Being on
# main and not behind origin/main already proves a pending migration's file is
# on main — it is in the tree you are standing in — so the gh lookup that used
# to live below is not a second opinion, it is a weaker version of this one.
printf '\n  0. the checkout is main, and main is current\n'
assert_current_main

printf '\n  0b. every pending migration is tracked and committed\n'

LEDGER=$(PGPASSWORD="$(security find-generic-password -s "$KEYCHAIN_SERVICE" -w)" \
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc \
  "select version from supabase_migrations.schema_migrations;" 2>/dev/null) \
  || fail "could not read supabase_migrations.schema_migrations"

PENDING=()
for f in supabase/migrations/*.sql; do
  v=$(basename "$f" | sed -E 's/^([0-9]+).*/\1/')
  grep -qx "$v" <<< "$LEDGER" || PENDING+=("$f")
done

if (( ${#PENDING[@]} == 0 )); then
  say "no pending migrations — nothing to apply"
  exit 0
fi
say "${#PENDING[@]} pending: $(printf '%s ' "${PENDING[@]##*/}")"

for f in "${PENDING[@]}"; do
  git ls-files --error-unmatch "$f" >/dev/null 2>&1 \
    || fail "$f is not tracked by git. Applying a migration whose file is not in
             version control is how 0129 and 0130 ended up in production with no
             source. Commit it first."
  git diff --quiet HEAD -- "$f" \
    || fail "$f has uncommitted changes. The text applied to production must be
             the text that is recorded. Commit it first."
done

# Routing needs no further test: step 0 established that this checkout IS main
# and is not behind origin/main, so a tracked, committed pending migration is on
# main by construction. The open-PR lookup that used to live here was the weaker
# half of that question and is gone rather than left to agree by coincidence.
say "on main — pending migrations are routed by construction"

# ---- STEP 1: the dump ------------------------------------------------------
mkdir -p "$BACKUP_DIR"
STAMP=$(date -u +%Y-%m-%dT%H-%M-%SZ)
DUMP="${BACKUP_DIR}/prod-${STAMP}.dump"
printf '\n  1. dump\n'
say "-> ${DUMP}"

if ! PGPASSWORD="$(security find-generic-password -s "$KEYCHAIN_SERVICE" -w)" \
     pg_dump --no-owner --no-privileges -Fc \
       -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
       -f "$DUMP" 2>/tmp/ediagd-pgdump.err; then
  # The stderr file may contain a connection string but never the password —
  # PGPASSWORD is not echoed by pg_dump. Still trimmed to three lines.
  head -3 /tmp/ediagd-pgdump.err >&2 || true
  rm -f "$DUMP"
  fail "pg_dump failed — the migration does not run"
fi

# ---- STEP 2: verify by reading it back -------------------------------------
printf '\n  2. verify the dump by reading it back\n'
verify_dump "$DUMP"

# ---- STEP 3: only now, the migration ---------------------------------------
printf '\n  3. migrate\n'
PUSH_ARGS=(db push --linked)
if (( ASSUME_YES )); then
  say "--yes: the operator has already consented to applying these to production"
  PUSH_ARGS+=(--yes)
else
  say "no --yes: the CLI will ask. In a non-interactive run it will refuse and change nothing."
fi
if ! SUPABASE_DB_PASSWORD="$(security find-generic-password -s "$KEYCHAIN_SERVICE" -w)" \
     npx supabase "${PUSH_ARGS[@]}"; then
  fail "supabase db push failed. The pre-migration dump is intact at:
             ${DUMP}"
fi

# ---- STEP 4: confirm from the ledger, not the push output ------------------
printf '\n  4. confirm from supabase_migrations.schema_migrations\n'
PGPASSWORD="$(security find-generic-password -s "$KEYCHAIN_SERVICE" -w)" \
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc \
  "select version from supabase_migrations.schema_migrations order by version desc limit 8;" \
  | sed 's/^/     /'

# ---- STEP 5: THE TWO COPIES OF THE ENTITLEMENT RULE MUST STILL AGREE -------
#
# 0177 put the entitlement predicate in one place and cost 5x on every read of
# `content`; 0178 put the policy back inline and kept the function for the
# card's definer path. Two copies of one rule, and this project's standing rule
# is that a convention closes a case while a construction closes a class — so
# the parity is checked rather than promised.
#
# WHY IT RUNS HERE AND NOT ONLY ON DEMAND. Both copies are database objects.
# Nothing but a migration can change either one. So "after every apply" is not
# a sampling interval, it is the complete set of moments at which they can
# possibly diverge — which is what makes this check exhaustive rather than
# periodic.
#
# WHY IT RUNS AFTER THE PUSH, WHICH IS A REAL LIMITATION AND NOT A DETAIL. The
# new state cannot be measured before it exists, so a drift is caught with the
# migration already applied. This is therefore a tripwire and not a gate: it
# makes the divergence loud within seconds and names the pre-migration backup
# to go back to. Being honest about which of the two it is matters, because a
# tripwire described as a gate is a confident wrong answer about safety.
#
# It reads as `authenticated` with each advisor's own claims, because a policy
# cannot be observed as a role that bypasses it — see the script's header.
printf '\n  5. entitlement parity — the RLS policy against content_entitled_for\n'
PARITY="$(dirname "$0")/entitlement-parity.sql"
[[ -f "$PARITY" ]] || fail "the parity check is missing: ${PARITY}
             This step is not optional and a missing file is not a pass."

# NO PIPELINE HERE, DELIBERATELY. `psql ... | sed` would put the one command
# whose exit status decides this step on the left of a pipe, and the long note
# on verify_dump above records what this script already paid for that: under
# `set -o pipefail` a pipeline's status is not the status of the command you
# care about. Captured first, printed second, tested on psql's own code.
PARITY_OUT=""
PARITY_RC=0
PARITY_OUT="$(PGPASSWORD="$(security find-generic-password -s "$KEYCHAIN_SERVICE" -w)" \
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
       -v ON_ERROR_STOP=1 -q -f "$PARITY" 2>&1)" || PARITY_RC=$?
printf '%s\n' "$PARITY_OUT" | sed 's/^/     /'

if (( PARITY_RC != 0 )); then
  fail "ENTITLEMENT PARITY FAILED — the RLS policy on \`content\` and
             content_entitled_for no longer agree. The migration IS APPLIED;
             this check runs after the push because the new state cannot be
             measured before it exists.

             The pre-migration dump is intact at:
             ${DUMP}"
fi

# ---- retention: keep the last ten, delete nothing else ---------------------
printf '\n  retention\n'
COUNT=$(ls -1t "${BACKUP_DIR}"/prod-*.dump 2>/dev/null | wc -l | tr -d ' ')
say "${COUNT} dump(s) held; keeping the newest ${KEEP}"
if (( COUNT > KEEP )); then
  ls -1t "${BACKUP_DIR}"/prod-*.dump | tail -n +$((KEEP + 1)) | while read -r old; do
    say "removing $(basename "$old")"
    rm -f "$old"
  done
fi

printf '\n  done. backup: %s\n\n' "$DUMP"
