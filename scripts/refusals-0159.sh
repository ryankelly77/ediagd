#!/usr/bin/env bash
# 0159's refusals, proven against deliberately broken inputs.
#
# A refusal is not self-verifying: the acceptance half is already proven (the
# build path applied cleanly on a restored production dump). This proves the
# other half, and each case runs inside a transaction that is ROLLED BACK, so
# the database is unchanged.
set -uo pipefail
P="postgresql://postgres:postgres@127.0.0.1:55322/postgres"
MIG="supabase/migrations/0159_openers_closers_and_the_walk_around.sql"
PASS=0; FAIL=0

# A deliberately broken input, the migration, and the message we require.
# $1 label   $2 breaking SQL   $3 expected substring
expect_refusal() {
  local label="$1" break_sql="$2" want="$3"
  local out
  out=$( { printf 'begin;\n%s\n' "$break_sql"; cat "$MIG"; printf '\nrollback;\n'; } \
         | psql "$P" -v ON_ERROR_STOP=1 2>&1 )
  if grep -qF "$want" <<< "$out"; then
    echo "  ok      $label"
    echo "          -> $(grep -oF -m1 "$want" <<< "$out")"
    PASS=$((PASS+1))
  else
    echo "  FAILED  $label"
    echo "          expected to contain: $want"
    echo "$out" | grep -iE "ERROR|NOTICE" | tail -4 | sed 's/^/          /'
    FAIL=$((FAIL+1))
  fi
}

echo
echo "  0159 — the refusals, each inside a rolled-back transaction"
echo

# 1. A SUBSET OF THE FILMS. One opener retired: 4 of 5 is not a state either
#    production or an empty local presents, so it must refuse rather than
#    half-apply.
expect_refusal "a subset refuses (one opener retired)" \
  "update content set retired_at = now(), retired_reason = 'refusal test'
    where title = 'Name Tag — Opener';" \
  "0159: partial"

# 2. AN OPENER THE LOOP WOULD NOT SERVE. pickItem() filters on
#    mux_playback_id; a pointer at a film with none yields an entry morning
#    with no film and NO ERROR, which is worse than null.
#
#    Note which states are reachable here. content_video_playable is
#    CHECK (format <> 'video' OR mux_playback_id IS NOT NULL OR video_url IS
#    NOT NULL OR retired_at IS NOT NULL) — so a published film cannot simply
#    lose its playback id, but it CAN carry a video_url instead, and that row
#    satisfies the schema while pickItem() still refuses to serve it. That is
#    the reachable case, so that is the one tested.
expect_refusal "an opener served by video_url rather than Mux is refused" \
  "update content set video_url = 'https://example.invalid/x.mp4',
                      mux_playback_id = null, mux_playback_policy = null
    where title = 'Success Cycle — Opener';" \
  "0159: partial"

# 3. AN OPENER THAT IS NO LONGER PUBLISHED. The realistic version of the same
#    exposure: Ryan unpublishes a film in admin after the migration is written.
expect_refusal "an unpublished opener refuses" \
  "update content set status = 'draft' where title = 'Lasting Impressions — Opener';" \
  "0159: partial"

# 4. TWO FILMS WITH THE SAME OPENER TITLE. An opener must be exactly one.
expect_refusal "two films titled the same opener refuse" \
  "insert into content (id, type, format, title, status, collection, placement,
                        mux_playback_id, mux_playback_policy, created_at, updated_at)
   select gen_random_uuid(), type, format, title, status, collection, placement,
          mux_playback_id, mux_playback_policy, now(), now()
     from content where title = 'Four Step Close — Opener';" \
  "an opener must be exactly one"

# 4. AN ENTRY FILM ALREADY RULED. 0159 must not overwrite somebody else's
#    ruling, even with the right film available.
expect_refusal "an existing different entry film is not overwritten" \
  "update certification set entry_film_content_id =
     (select id from content where title = 'Pre-Write' limit 1)
    where name = 'Lasting Impressions';" \
  "refusing to overwrite a ruling"

# 5. THE MENUS HOLD IS ASSERTED, NOT MERELY DECLINED. If somebody attaches the
#    third closer, 0159 fails and says why.
expect_refusal "the Menus hold is enforced" \
  "update content set module_id =
     (select m.id from module m join course co on co.id = m.course_id
       where co.name = 'Menus' and m.name = 'Menu Wrap-Up, Part 1')
    where title = 'Menus — Closer';" \
  "must stay unattached pending Ryan"

# 6. WALK AROUND MODULE 7 IS OWED. A film landing there silently is the thing
#    this assertion exists to catch.
expect_refusal "a film on Walk Around module 7 is caught" \
  "update content set module_id =
     (select m.id from module m join course co on co.id = m.course_id
       where co.name = 'The Walk-Around' and m.name = '7. The Handback'),
          module_order = 1, placement = 'daily_craft'
    where title = '30 Second Walk-Around, Part 9, 42 seconds';" \
  "Mitch owes it"

# 7. A CLOSER ATTACHED SOMEWHERE ELSE.
expect_refusal "a closer attached outside its course refuses" \
  "update content set module_id =
     (select m.id from module m join course co on co.id = m.course_id
       where co.name = 'The Walk-Around' and m.name = '7. The Handback')
    where title = 'Name Tag — Closer';" \
  "is attached to a module outside"

echo
echo "  $PASS passed, $FAIL failed"
echo
[[ $FAIL -eq 0 ]] || exit 1
