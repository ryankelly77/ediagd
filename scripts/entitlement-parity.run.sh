#!/usr/bin/env bash
# =============================================================================
# check:entitlement-parity — run the parity check on its own
# =============================================================================
# db:migrate runs scripts/entitlement-parity.sql after every apply, which is the
# complete set of moments the two copies can diverge. This wrapper exists so the
# same check can be run by hand against production without migrating anything —
# a gate whose success case can only be observed by migrating the live database
# has no acceptance test, which is the lesson db-migrate.sh's --guard-only and
# --verify-only were added for.
#
# ONE DEFINITION: this runs the same .sql file db:migrate runs. It is a
# different way to invoke the check, never a second copy of it.
set -euo pipefail

KEYCHAIN_SERVICE="ediagd-prod-db"
DB_HOST="aws-0-us-east-2.pooler.supabase.com"
DB_PORT="5432"
DB_USER="postgres.kpbholbgfccwbzggcvbb"
DB_NAME="postgres"

HERE="$(cd "$(dirname "$0")" && pwd)"
SQL="${HERE}/entitlement-parity.sql"
[[ -f "$SQL" ]] || { printf '\n  REFUSING — missing %s\n\n' "$SQL" >&2; exit 1; }

printf '\n  entitlement parity — prod, read-only\n'
printf '  %s\n\n' "$SQL"

# No pipeline around psql: its exit status is the whole result. See the note in
# db-migrate.sh step 5.
OUT=""
RC=0
OUT="$(PGPASSWORD="$(security find-generic-password -s "$KEYCHAIN_SERVICE" -w)" \
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
       -v ON_ERROR_STOP=1 -q -f "$SQL" 2>&1)" || RC=$?
printf '%s\n' "$OUT" | sed 's/^/     /'

if (( RC != 0 )); then
  printf '\n  PARITY FAILED — the policy and content_entitled_for disagree.\n\n' >&2
  exit 1
fi
printf '\n  parity holds.\n\n'
