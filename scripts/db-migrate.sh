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
#   3  push          supabase db push --linked        <-- only reachable via 2
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
#
# runs step 2 alone, against any file, and touches nothing. It calls the SAME
# function the real path calls — so a refusal demonstrated there is a refusal
# demonstrated in the migration, not in a copy of it. A gate that has never
# refused is a comment.
# =============================================================================
set -euo pipefail

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
if ! SUPABASE_DB_PASSWORD="$(security find-generic-password -s "$KEYCHAIN_SERVICE" -w)" \
     npx supabase db push --linked; then
  fail "supabase db push failed. The pre-migration dump is intact at:
             ${DUMP}"
fi

# ---- STEP 4: confirm from the ledger, not the push output ------------------
printf '\n  4. confirm from supabase_migrations.schema_migrations\n'
PGPASSWORD="$(security find-generic-password -s "$KEYCHAIN_SERVICE" -w)" \
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc \
  "select version from supabase_migrations.schema_migrations order by version desc limit 8;" \
  | sed 's/^/     /'

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
