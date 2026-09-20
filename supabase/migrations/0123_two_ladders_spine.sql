-- ============================================================================
-- EDIAGD — 0123 The Two Ladders spine
--
-- Phase 3a of PHASE_3_PLAN.md. Storage only: no screen reads any of this yet,
-- and nothing here changes what an advisor sees today. The loop (3b) and the
-- /today card (3c) are what fill it in.
--
-- Four things land, and one thing deliberately does not.
--
--   family_pitch_supply     which service families can actually supply a pitch
--                           slot, and how many films deep. The cycle question
--                           in 3a turns on this, and the card in 3c lists it.
--
--   advisor_focus_family    the locked assignment. One active row per advisor,
--                           history retained, carrying WHY it was chosen so a
--                           manager's override is distinguishable from a
--                           derivation.
--
--   content_progress.source the consumption record already existed and already
--                           spans both formats. It gains one descriptive
--                           column and nothing else — see section 3.
--
--   advisor_track_entry     the morning an advisor entered a craft track, plus
--                           the nullable column that says which film opens it.
--
-- WHAT DOES NOT LAND: anything for the Good News Story. TWO_LADDERS.md marks it
-- PROPOSED, NOT DECIDED and PHASE_3_PLAN.md says not to design schema for it
-- speculatively. There is no story column, table, or flag below.
--
-- ---------------------------------------------------------------------------
-- WHY `service_family` IS SPELLED AS TEXT AGAIN AND NOT AS A FOREIGN KEY
-- ---------------------------------------------------------------------------
-- op_code_family.family, content.service_family, advisor_family_attach.family
-- and coaching_block.family are all free text today, resolved against each
-- other by name. A foreign key here would be the only one, so it would either
-- fail on a family the other four accept or force a migration of all five in a
-- phase whose whole point is to stop guessing. Same posture as coaching_block.
-- ============================================================================


-- ============================================================================
-- 0. THE BENCHMARK IS INVISIBLE TO THE ROLE THAT WILL DERIVE AGAINST IT
-- ============================================================================
/*
 * MEASURED, NOT REASONED. On a full local replay of 0001-0122, before anything
 * below existed:
 *
 *     set local role service_role;
 *     select has_performance_surface();              -> false
 *     select count(*) from family_store_benchmark;   -> 0
 *     select count(*) from advisor_family_attach_all -> 20906
 *
 * 0096 added `and (select has_performance_surface())` to family_store_benchmark
 * so that a TECHNICIAN gets zero rows rather than an error — there is no
 * technician measurement, so there is nothing to compare them against. That is
 * right, and it is kept.
 *
 * But the predicate asks about auth.uid(), and the service role has no JWT and
 * therefore no auth.uid(). So the gate written to exclude technicians also
 * excludes the application's own backend. Every server-side read of the store
 * benchmark under the service key returns zero rows today — silently, because
 * an empty benchmark is indistinguishable from a store with no history.
 *
 * derive_focus_family() below reads that view, runs under the service role, and
 * would have returned null for every advisor forever. The migration would have
 * applied cleanly and `supabase db reset` would have been green, which is the
 * exact failure AGENTS.md documents for recompute_certification_content().
 *
 * ---------------------------------------------------------------------------
 * WHY THIS AND NOT A SECOND BENCHMARK VIEW
 * ---------------------------------------------------------------------------
 * The alternative was to compute the store average inside the function from
 * advisor_family_attach_all. That means restating min_ros_for_coaching() and
 * the departed-advisor exclusion in a second place, and a store average that
 * can disagree with the one on the advisor's own screen is worse than no
 * derivation at all — the pick would be defensible against numbers nobody can
 * see.
 *
 * `bypasses_rls()` is the idiom 0081 already uses in exactly this position, and
 * it is the correct discriminator here: true for service_role and postgres,
 * false for authenticated. Verified on the same replay. A technician's JWT
 * still gets false from both halves, so 0096's behaviour is unchanged for every
 * human caller — and all three application readers of this view
 * (lib/advisor-data.ts, /advisor, /manager) pass a user JWT, so nothing they
 * see changes either.
 */
create or replace function has_performance_surface()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  /* The backend itself. No JWT, no role to check, and it is the caller that
     every other gate in this schema already lets through. */
  select bypasses_rls()
  or coalesce(
    (select is_platform_owner()),
    false
  ) or exists (
    select 1 from membership m
     where m.user_id = (select auth.uid())
       and m.active
       and m.role in ('advisor', 'manager', 'admin')
  )
$$;

comment on function has_performance_surface() is
  'True when the caller holds a role with a performance screen, or is the '
  'backend. Technicians do not: there is no technician measurement by design. '
  'See 0096 for the role rule and 0123 for the bypasses_rls() clause.';


-- ============================================================================
-- 1. WHICH FAMILIES CAN SUPPLY A PITCH
-- ============================================================================
/*
 * THE PITCH SLOT'S SUPPLY GATE IS NOT THE CUE GATE, AND CONFUSING THE TWO IS
 * HOW AN ADVISOR GETS LOCKED ONTO AN EMPTY FAMILY FOR A WEEK.
 *
 * lib/coachable-families.ts gates a family on having `coaching_block_days`
 * published CUES. That is the right gate for the cue ladder in lib/daily.ts and
 * the wrong one here: the Two Ladders pitch slot serves a FILM, and cues and
 * films are stocked completely differently. Measured on 2026-09-18:
 *
 *     families in op_code_family                    19
 *     families with >= 1 published pitch film        7
 *     coachable families with ZERO pitch films      10
 *
 *     Belts & Cooling 12   Fluids 12   HVAC 10   Filters 8
 *     Brake Service    4   Differential 4   Wipers 2
 *
 * Battery has 56 published cues and no film at all. Gating the pitch on cue
 * depth would put it in the rotation and then have nothing to play.
 *
 * ---------------------------------------------------------------------------
 * A WEEK IS THE WRONG CYCLE, AND THIS VIEW IS WHERE THAT BECOMES VISIBLE
 * ---------------------------------------------------------------------------
 * Supply runs 2 to 12 films. A fixed five-morning week repeats Wipers from
 * Wednesday and never finishes Belts & Cooling. So the cycle has to be
 * supply-shaped, and `film_count` is the number that shapes it. The loop is
 * free to cap a long family; it must not stretch a short one.
 *
 * SECURITY INVOKER, AND IT DOES NOT NEED TO BE ANYTHING ELSE. Every table it
 * touches — content, op_code_family, op_code_catalog — is already readable by
 * any signed-in user under its own RLS: op_code_family and op_code_catalog are
 * reference data, and content carries content_entitled_read. An advisor
 * therefore sees supply counted over exactly the films they are entitled to
 * play, which is the honest number for them. Definer rights would report films
 * their rooftop never bought and the card would offer a locked door.
 */
create or replace view family_pitch_supply
with (security_invoker = on) as
select
  f.family,
  count(*)::int                                   as film_count,
  count(distinct c.op_code)::int                  as op_code_count,
  count(distinct c.stage) filter (where c.stage is not null)::int as stage_count,
  sum(c.duration_sec)::int                        as total_sec,
  /* Whether every film in the family is captioned. Mitch's open question 5 is
     about the track films; this is the same question for the pitch shelf, and
     it is a number rather than an audit. */
  bool_and(coalesce(c.captions_ready, false))     as fully_captioned
from content c
join op_code_family f on f.code = c.op_code
where c.type = 'advisor_video'
  and c.status = 'published'
  and c.retired_at is null
  and c.mux_playback_id is not null
  /* coachable = false means map for reporting but never coach — the eleven
     MNU-* bundles and MPI-061. 0066 draws that line; repeating the rule here
     rather than the list means a later ruling lands without touching this. */
  and f.coachable
group by f.family;

comment on view family_pitch_supply is
  'Published pitch films per service family, resolved through op_code_family. '
  'The pitch slot''s supply gate and the cycle-length input — see 0123. '
  'Security invoker: an advisor counts only films they are entitled to play.';

/* PostgREST reaches a view through the ordinary grant, not through RLS. Without
   this the card in 3c gets a 401 that reads like an empty shelf. */
grant select on family_pitch_supply to authenticated;


-- ============================================================================
-- 2. THE LOCKED ASSIGNMENT
-- ============================================================================
create table if not exists advisor_focus_family (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references app_user(id) on delete cascade,
  rooftop_id  uuid not null references rooftop(id)  on delete cascade,

  family      text not null,

  /*
   * DERIVED, MANAGER, OR DEFAULT — AND THE DIFFERENCE HAS TO SURVIVE.
   *
   * A derivation that gets overwritten by a manager and then silently
   * re-derived on the next DMS drop is the failure TWO_LADDERS rule 2 is about:
   * "a mid-week DMS drop would move an advisor off the family their manager
   * mentioned on Monday." The re-derivation has to be able to SEE that a human
   * ruled, and a boolean `overridden` would not say who or why.
   *
   *   derived  ranked out of the DMS by derive_focus_family()
   *   manager  a human ruling, via set_focus_family_override()
   *   default  no DMS history to rank. Every Doggett advisor on 1 October is
   *            in this state — Mitch's open question 4. Nothing below invents
   *            what the default family is; a `default` row can only be written
   *            by naming one explicitly.
   */
  source      text not null check (source in ('derived', 'manager', 'default')),

  /* ---- The evidence, kept so a ranking can be re-read rather than re-run --- */

  /*
   * WHICH PERIOD THE NUMBERS CAME FROM. Without it "Belts & Cooling, missed 118
   * ROs" is a claim with no date on it, and the first question anybody asks of
   * a surprising pick is "against what month".
   */
  period_id   uuid references perf_period(id) on delete set null,

  /*
   * RANKED ON missed_ros, NOT ON opportunity, AND NOT ON ATTACH RATE.
   *
   * TWO_LADDERS rule 1: "A family with two opportunities and zero sold is 0%
   * and worth nothing; two hundred at 40% is where the money is." Both halves
   * of that example are RO COUNTS, so missed ROs is the quantity the rule
   * describes and it is the one every family has.
   *
   * `opportunity` — missed_ros x labor_per_ro — is recorded beside it and used
   * only to break a tie. It cannot be the primary key of the sort because it is
   * null for any family the DMS reports no labor dollars against, and
   * `coalesce(opportunity, missed_ros)` would then compare dollars against RO
   * counts: a family with $4,000 behind it and one with 40 missed ROs are not
   * two points on one scale. rank() in lib/advisor.ts does exactly that
   * coalesce, so ANY family with a dollar figure outranks every family without
   * one regardless of size. See the divergence note on the function below.
   */
  missed_ros  numeric,
  opportunity numeric,

  /*
   * HOW DEEP THE SHELF WAS THE DAY THIS WAS LOCKED.
   *
   * The cycle is supply-shaped (section 1), so the loop needs to know how many
   * films this family owed when the assignment was made. Reading it live would
   * mean an advisor mid-cycle silently gaining three mornings because somebody
   * published, which moves a finish line the card is already counting towards
   * — "Belts & Cooling · 3 of 7" becoming "3 of 10" overnight.
   */
  film_count  int,

  /* ---- The human half ---------------------------------------------------- */
  assigned_by uuid references app_user(id) on delete set null,
  note        text,

  assigned_on date not null default current_date,

  /*
   * RETIRE, NEVER DELETE — the same law as op_code retirement (0072) and
   * lapsed certifications (0115). A finished assignment is how "what were you
   * working in September" stays answerable, and the consumption record it
   * pairs with is permanent, so an assignment that vanished would leave films
   * marked watched for a reason nobody can name.
   */
  ended_on    date,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  /* A derived row without a period is a ranking nobody can check. */
  constraint focus_family_derived_has_period
    check (source <> 'derived' or period_id is not null),
  /* An override with no author is indistinguishable from a derivation that
     forgot to say so, which is the one thing `source` exists to prevent. */
  constraint focus_family_manager_has_author
    check (source <> 'manager' or assigned_by is not null),
  constraint focus_family_dates_ordered
    check (ended_on is null or ended_on >= assigned_on)
);

/*
 * ONE ACTIVE ROW PER ADVISOR, ENFORCED RATHER THAN INTENDED.
 *
 * Partial on ended_on is null, so history is unlimited and the present is
 * singular. Without this, a derivation racing an override leaves two live
 * assignments and the loop picks whichever the planner returns first.
 */
create unique index if not exists advisor_focus_family_one_active
  on advisor_focus_family (user_id) where ended_on is null;

create index if not exists advisor_focus_family_user_idx
  on advisor_focus_family (user_id, assigned_on desc);

comment on table advisor_focus_family is
  'The service family an advisor''s pitch slot is locked to. One active row '
  '(ended_on null) per advisor; finished rows are retained. `source` separates '
  'a derivation from a manager ruling. Written by derive_focus_family() and '
  'set_focus_family_override(), never by a client. See 0123.';

alter table advisor_focus_family enable row level security;

/*
 * Read your own; managers and admins read their rooftop's people. Mirrors
 * coaching_block_read (0067) deliberately — the two tables answer the same
 * shape of question about the same person and a coverage screen will show them
 * side by side.
 */
drop policy if exists advisor_focus_family_read on advisor_focus_family;
create policy advisor_focus_family_read on advisor_focus_family
  for select using (
    user_id = (select auth.uid())
    or user_id in (select managed_users())
  );

/*
 * NO USER-FACING INSERT OR UPDATE POLICY, FOR THE REASON 0067 GIVES ABOUT THE
 * BLOCK: an advisor who could write this row would choose the family they are
 * already good at, and the credential behind it would then measure nothing.
 * Admins get a write policy for the same reason the block does — a support
 * path that does not require the service key. Everyone else goes through the
 * two functions below.
 */
drop policy if exists advisor_focus_family_admin_write on advisor_focus_family;
create policy advisor_focus_family_admin_write on advisor_focus_family
  for all
  using (exists (select 1 from membership m
                 where m.user_id = (select auth.uid()) and m.active and m.role = 'admin'))
  with check (exists (select 1 from membership m
                 where m.user_id = (select auth.uid()) and m.active and m.role = 'admin'));


-- ---- 2a. The derivation -----------------------------------------------------
/*
 * Rank this advisor's families by MISSED RO VOLUME and lock the top one that
 * can actually supply a pitch.
 *
 * ---------------------------------------------------------------------------
 * THIS IS NOT eddiesPick(), AND THE DIFFERENCE IS DELIBERATE
 * ---------------------------------------------------------------------------
 * buildServiceFamilies() in lib/advisor.ts sorts on STATUS FIRST — pursue,
 * then close, then on-track — and only ranks by size inside each band. Status
 * is derived from attach RATE against the store average, so a family with two
 * opportunities and none sold sits at the top of the pursue band and outranks
 * a family two hundred ROs deep sitting in `close`. That is precisely the
 * ordering TWO_LADDERS rule 1 rejects.
 *
 * So this does not call it, does not reimplement it, and does not share its
 * sort. It reads the SAME views the TypeScript reads — advisor_family_attach,
 * family_store_benchmark, advisor_family_labor — so the two can never disagree
 * about the underlying numbers, only about the order, which is the one thing
 * they are meant to disagree about.
 *
 * ---------------------------------------------------------------------------
 * SECURITY DEFINER, AND THE VIEWS ARE WHY
 * ---------------------------------------------------------------------------
 * advisor_family_attach and advisor_family_labor are definer views scoped in
 * their own WHERE against auth.uid(). Called from the loop under the SERVICE
 * ROLE there is no auth.uid(), and `bypasses_rls()` is the branch that answers
 * — which is how the service role reads another person's book at all. Called
 * by an advisor over PostgREST, those views would scope to the CALLER, and the
 * function would happily derive a focus family for somebody else out of the
 * caller's own numbers.
 *
 * Hence: definer, and EXECUTE granted to nobody. Not to `authenticated`, not
 * to `anon`. The service role does not need a grant — it bypasses RLS and is a
 * superuser-adjacent role in Supabase — and an admin has the table write policy
 * above. If a screen ever needs to trigger a derivation, it calls a thin
 * wrapper that checks the caller is a manager of the target, the way
 * set_focus_family_override() below does. It does not get a grant on this.
 */
create or replace function derive_focus_family(
  _user    uuid,
  _rooftop uuid,
  /* Null means "the most recent period this advisor has numbers for". Passed
     explicitly by the acceptance suite so a test does not depend on which
     month the DMS last landed. */
  _period  uuid default null
)
returns advisor_focus_family
language plpgsql
security definer
set search_path = public
as $$
declare
  _op_id   text;
  _period_id uuid;
  _top     record;
  _existing advisor_focus_family;
  _out     advisor_focus_family;
begin
  /*
   * WHICH BOOK IS THIS PERSON'S. membership.op_code_id is the DMS operator id;
   * dms_advisor.linked_user_id is the intended link and is null for every user
   * in production (0081 says so and it is still true). So this reads the same
   * column my_advisor_op_ids() falls back to, rather than inventing a third
   * path to the same fact.
   */
  select m.op_code_id into _op_id
    from membership m
   where m.user_id = _user
     and m.rooftop_id = _rooftop
     and m.active
     and m.role = 'advisor'
     and m.op_code_id is not null
   limit 1;

  /* No DMS link is not an error and must not be recorded as one. It is Mitch's
     open question 4 — the starting family for an advisor with no history — and
     answering it by picking something here would be inventing the answer. */
  if _op_id is null then
    return null;
  end if;

  _period_id := _period;
  if _period_id is null then
    select a.period_id into _period_id
      from advisor_family_attach a
      join perf_period p on p.id = a.period_id
     where a.advisor_op_id = _op_id
       and a.rooftop_id = _rooftop
     order by p.starts_on desc
     limit 1;
  end if;

  if _period_id is null then
    return null;
  end if;

  /*
   * THE RANKING.
   *
   * gap_pp is clamped at zero: a family the advisor is AHEAD of the store on
   * has no missed ROs, and a negative gap would otherwise sort it to the bottom
   * as though it were a large negative opportunity rather than simply not being
   * one.
   *
   * The join to family_pitch_supply is an INNER join on purpose — a family with
   * no film cannot fill the pitch slot, so it is not a candidate however big
   * its gap is. Ten coachable families are in that state today. They stay
   * visible in the service list and on Eddie's Pick; what they cannot do is
   * become somebody's locked assignment.
   */
  select
      a.family,
      round(greatest(coalesce(b.store_avg_pct, 0) - coalesce(a.attach_rate_pct, 0), 0)
            / 100.0 * a.advisor_ros, 2)                        as missed_ros,
      case when l.labor_per_ro is not null and l.labor_per_ro > 0
           then round(greatest(coalesce(b.store_avg_pct, 0) - coalesce(a.attach_rate_pct, 0), 0)
                      / 100.0 * a.advisor_ros * l.labor_per_ro, 2)
      end                                                      as opportunity,
      s.film_count
    into _top
    from advisor_family_attach a
    join family_store_benchmark b
      on b.family = a.family and b.period_id = a.period_id and b.rooftop_id = a.rooftop_id
    join family_pitch_supply s on s.family = a.family
    left join advisor_family_labor l
      on l.family = a.family and l.period_id = a.period_id
     and l.rooftop_id = a.rooftop_id and l.advisor_op_id = a.advisor_op_id
   where a.advisor_op_id = _op_id
     and a.rooftop_id = _rooftop
     and a.period_id = _period_id
     and a.advisor_ros > 0
   order by missed_ros desc nulls last,
            opportunity desc nulls last,
            /* Family name last, so a dead heat resolves the same way on every
               server and every run rather than on the planner's mood. */
            a.family asc
   limit 1;

  /* Nothing rankable. Honest null, no row, same reasoning as the ladder's
     `none` in lib/daily.ts: a written-down guess is worse than a gap. */
  if _top is null or _top.missed_ros is null or _top.missed_ros <= 0 then
    return null;
  end if;

  select * into _existing
    from advisor_focus_family
   where user_id = _user and ended_on is null
   limit 1;

  if found then
    /*
     * A MANAGER'S RULING OUTRANKS THE NUMBERS AND IS NOT QUIETLY REPLACED.
     * TWO_LADDERS rule 2's whole point. The existing row is returned unchanged
     * so the caller can see WHAT is locked without having to ask twice.
     */
    if _existing.source = 'manager' then
      return _existing;
    end if;

    -- Already on the right family: leave the lock and its dates alone.
    if _existing.family = _top.family then
      return _existing;
    end if;

    /*
     * WITH A WHERE CLAUSE, AND THAT IS NOT DECORATION.
     *
     * Supabase runs pg_safeupdate for the API roles, so a WHERE-less UPDATE in
     * a function applies cleanly in the migration and throws for every caller
     * that reaches it through PostgREST. AGENTS.md documents that exact failure
     * in recompute_certification_content(). `id = _existing.id` is the clause.
     */
    update advisor_focus_family
       set ended_on = current_date,
           updated_at = now()
     where id = _existing.id;
  end if;

  insert into advisor_focus_family
    (user_id, rooftop_id, family, source, period_id, missed_ros, opportunity, film_count)
  values
    (_user, _rooftop, _top.family, 'derived', _period_id,
     _top.missed_ros, _top.opportunity, _top.film_count)
  returning * into _out;

  return _out;
end;
$$;

comment on function derive_focus_family(uuid, uuid, uuid) is
  'Rank this advisor''s families by MISSED RO VOLUME among those with a '
  'published pitch film, and lock the top one. Never overrides a manager '
  'ruling. Returns null rather than guessing when there is no DMS link, no '
  'period, or no ranked family. Definer with NO grants — see 0123.';

/* Stated rather than assumed: a definer function is executable by PUBLIC unless
   this is said, which would hand every advisor the hole the header describes. */
revoke all on function derive_focus_family(uuid, uuid, uuid) from public;
revoke all on function derive_focus_family(uuid, uuid, uuid) from anon, authenticated;


-- ---- 2b. The manager's ruling -----------------------------------------------
/*
 * Set an advisor's focus family by hand.
 *
 * THIS ONE IS REACHABLE BY A SIGNED-IN MANAGER, so it checks the caller rather
 * than trusting them. Definer because it writes a table with no user-facing
 * insert policy; the authorisation it performs is the reason it is allowed to.
 *
 * managed_users() is the same helper coaching_block_read and daily_activity
 * already scope by, so "my rooftop's people" means one thing across the schema.
 * A manager at another store gets an exception, not an empty result — an
 * override that silently does nothing is worse than one that refuses, because
 * the manager walks away believing they set it.
 */
create or replace function set_focus_family_override(
  _user    uuid,
  _rooftop uuid,
  _family  text,
  _note    text default null
)
returns advisor_focus_family
language plpgsql
security definer
set search_path = public
as $$
declare
  _me   uuid := (select auth.uid());
  _out  advisor_focus_family;
  _supply int;
begin
  if _me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  if _user not in (select managed_users()) then
    raise exception 'not your advisor' using errcode = '42501';
  end if;

  /*
   * A FAMILY WITH NO FILM CANNOT BE PITCHED, WHOEVER ASKS.
   *
   * The derivation refuses one by inner-joining supply away; a human typing the
   * name has to hit the same wall or the override becomes the way to reach the
   * empty shelf the gate exists to prevent.
   *
   * THIS COUNT IS NOT ENTITLEMENT-SCOPED, and saying so is the point. This
   * function is SECURITY DEFINER, so the security-invoker view inside it runs
   * as the function's owner and sees every published film, not the manager's.
   * That is the behaviour wanted — "does a film exist for this family" is a
   * question about the library, and a manager should not be blocked from
   * assigning by their own reading rights. The gate that decides whether the
   * ADVISOR may play it is content_entitled_read at playback, which is
   * untouched. The authorisation that does matter here — is this your advisor
   * — runs off auth.uid() above and is the caller's, definer or not.
   */
  select film_count into _supply from family_pitch_supply where family = _family;
  if _supply is null or _supply = 0 then
    raise exception 'no published pitch film for family %', _family
      using errcode = '23514';
  end if;

  update advisor_focus_family
     set ended_on = current_date,
         updated_at = now()
   where user_id = _user
     and ended_on is null;

  insert into advisor_focus_family
    (user_id, rooftop_id, family, source, assigned_by, note, film_count)
  values
    (_user, _rooftop, _family, 'manager', _me, _note, _supply)
  returning * into _out;

  return _out;
end;
$$;

comment on function set_focus_family_override(uuid, uuid, text, text) is
  'A manager locks an advisor onto a family by hand. Refuses a caller who does '
  'not manage the advisor, and a family with no published pitch film. Written '
  'as source=''manager'', which derive_focus_family() will not overwrite.';

revoke all on function set_focus_family_override(uuid, uuid, text, text) from public;
grant execute on function set_focus_family_override(uuid, uuid, text, text) to authenticated;


-- ============================================================================
-- 3. THE CONSUMPTION RECORD — ONE COLUMN, AND HERE IS WHY IT IS ONLY ONE
-- ============================================================================
/*
 * PHASE_3_PLAN.md says "extend whatever exists rather than adding a second
 * one". What exists is content_progress, and it already does more of this job
 * than the plan assumes. Read live on 2026-09-18:
 *
 *     50 rows, 48 distinct content rows, across 2 users
 *     by type:        cue 30, advisor_video 20
 *     30 of them sit inside a module; 2 carry an op code
 *
 * So it is ALREADY FORMAT-AGNOSTIC — the same table records a text cue and a
 * film — which is exactly what TWO_LADDERS asks of slot 3, and the unique
 * (user_id, content_id) is already "never see it twice". The loop and the card
 * sharing it needs no new structure at all.
 *
 * It is also already guarded: 0118 added content_is_readable() to both the
 * insert and the update policy, so a row cannot be POSTed against content the
 * caller cannot read. That hole is closed and is not reopened here.
 *
 * What it genuinely cannot answer is WHICH SURFACE produced a row. Once the
 * card lets an advisor watch ahead, "did the card do anything" and "how often
 * does the loop find its next film already watched" are both questions about
 * provenance, and neither is recoverable afterwards from a watched_pct. That
 * is one column.
 *
 * NULLABLE, WITH NO DEFAULT AND NO BACKFILL. The 50 existing rows were written
 * before anything recorded this, and stamping them 'library' would be asserting
 * a fact nobody checked — the same failure as a ledger recording what a script
 * intended. Null means "written before this column existed", which is true.
 */
alter table content_progress
  add column if not exists source text;

alter table content_progress drop constraint if exists content_progress_source_valid;
alter table content_progress add constraint content_progress_source_valid
  check (source is null or source in ('loop', 'card', 'library', 'quiz'));

comment on column content_progress.source is
  'Which surface recorded this consumption: loop | card | library | quiz. '
  'Null on rows written before 0123. Descriptive only — no selection reads it.';


-- ============================================================================
-- 4. TRACK ENTRY
-- ============================================================================
/*
 * WHAT ALREADY EXISTS, HAVING LOOKED RATHER THAN ASSUMED:
 *
 *   module_completion   (user_id, module_id) — 0 rows in production
 *   my_module_progress  a view deriving per-module items_done / quiz_passed
 *   advisor_certification (user_id, certification_id) — 0 rows, and it records
 *                       the EXIT, not the entry
 *   quiz_attempt        11 rows, per module
 *
 * None of them records that an advisor ENTERED a track. Entry could be inferred
 * — "no content_progress row against any item in any module of this course" —
 * and that inference breaks the moment the plan's own rule bites: the entry
 * morning serves the FILM and no item at all, so an advisor who has entered and
 * watched the film is indistinguishable from one who has never arrived. The
 * loop would show them the film again the next morning, forever.
 *
 * Hence a row. It is written once, on the morning the film is served.
 */
create table if not exists advisor_track_entry (
  user_id          uuid not null references app_user(id) on delete cascade,
  certification_id uuid not null references certification(id) on delete cascade,
  rooftop_id       uuid references rooftop(id) on delete set null,

  entered_on       date not null default current_date,

  /*
   * THE FILM THAT OPENED IT, NULLABLE ON PURPOSE.
   *
   * Which film opens which track is Mitch's open question 1 and is unanswered.
   * Worse, the library cannot answer it either: there are SIX films on the
   * Craft shelf against EIGHT core tracks, none of them named for a core track,
   * and two of the six — Pre-Write and Selling speech — are already wired as
   * rung-2 stage fallbacks for the pitch lookup (mapping_alias kind =
   * 'stage_fallback'). See the 3a report.
   *
   * So a track can be entered before anybody has decided what opens it, and
   * this column records the film when there is one rather than blocking entry
   * until there is.
   */
  film_content_id  uuid references content(id) on delete set null,

  created_at       timestamptz not null default now(),

  /* ONE ENTRY PER TRACK PER PERSON. A track is entered once; re-entry is not a
     thing the ladder models, and the primary key is what makes serving the
     entry film twice impossible rather than merely unlikely. */
  primary key (user_id, certification_id)
);

comment on table advisor_track_entry is
  'The morning an advisor entered a craft track. Written once, by the loop, '
  'when the entry film is served. advisor_certification records the exit; this '
  'records the arrival. See 0123.';

alter table advisor_track_entry enable row level security;

drop policy if exists advisor_track_entry_read on advisor_track_entry;
create policy advisor_track_entry_read on advisor_track_entry
  for select using (
    user_id = (select auth.uid())
    or user_id in (select managed_users())
  );

/*
 * No write policy, matching module_completion (0035): the service role writes
 * here and the primary key is the serve-once guard. An advisor who could insert
 * their own entry row would skip the film the gate exists to make mandatory.
 */

/*
 * WHICH FILM OPENS WHICH TRACK — THE COLUMN, EMPTY.
 *
 * Mitch's ruling is data, not a migration, so the column lands now and stays
 * null until he rules. Nothing reads it yet; 3b is what does.
 *
 * It is on `certification` rather than a join table because a track has exactly
 * one entry film by construction — TWO_LADDERS: "Eight core tracks, eight
 * films, one apiece." A join table would model a second one and invite it.
 */
alter table certification
  add column if not exists entry_film_content_id uuid references content(id) on delete set null;

comment on column certification.entry_film_content_id is
  'The film served on the morning an advisor enters this track. Null until '
  'Mitch rules which film opens which track — six Craft films exist against '
  'eight core tracks. See 0123 and TWO_LADDERS.md open question 1.';


notify pgrst, 'reload schema';
