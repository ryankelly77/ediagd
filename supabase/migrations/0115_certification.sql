-- ============================================================================
-- EDIAGD — 0115 The certification programme, phase 1
--
-- ASE certifies the technicians in the bay; this certifies the advisors on the
-- drive. Four rungs: Service Certification, Craft Certification, EDIAGD
-- Certified, EDIAGD Master. This migration builds the first three's plumbing
-- and leaves Master defined and unreachable.
--
-- ---------------------------------------------------------------------------
-- THIS IS A THIN LAYER. IT DOES NOT BUILD AN LMS.
-- ---------------------------------------------------------------------------
-- The specification's own §6 says "Certification is a structure value on
-- existing items. Nothing here invents a new content system" — and then its §7
-- data model proposed `lesson`, `lesson_module`, `quiz_question` and
-- `quiz_attempt`, three of which already exist here under other names and one
-- of which (quiz_question) exists under the SAME name, bound to `module`, with
-- its answer key protected by the quiz_question_public security-definer view
-- and text-versioned by 0088/0089.
--
-- Building those would have stood a second quiz system beside a working,
-- security-hardened one — two answer keys, two completion accountings, and a
-- guarantee that they would disagree. Ryan ruled on 13 September: adopt
-- course/module, drop the parallel system. So:
--
--     a certification's lessons        ARE existing `module` rows
--     a lesson's content               IS existing content.module_id
--     a lesson's quiz                  IS existing quiz_question
--     "did they finish it"             IS existing module_completion
--
-- Nothing in this file duplicates any of that. It records which courses make up
-- a certification, and what an advisor has earned.
--
-- ---------------------------------------------------------------------------
-- WHY THERE IS NO content_item TABLE
-- ---------------------------------------------------------------------------
-- The spec asked certifications to reference "the item, not the version, so a
-- re-shoot never breaks a track or un-completes anybody". That property already
-- holds: a re-shoot REPLACES the video behind an existing `content` row and
-- bumps content.version (see the ingest's replacement door). content.id is the
-- item. Adding content_item would have created a second identity for a thing
-- that already has a stable one.
--
-- ---------------------------------------------------------------------------
-- WHAT IS DELIBERATELY EMPTY
-- ---------------------------------------------------------------------------
-- certification_prerequisite ships with no rows. Whether craft tracks require
-- specific service certifications or merely a COUNT of them is Ryan's open
-- ruling, and it is data rather than code — the table is ready for either.
-- ============================================================================

-- ---- 1. The catalogue -------------------------------------------------------

create table if not exists certification (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('service', 'craft')),
  name        text not null,
  slug        text not null unique,
  /**
   * The seal art. Resolved through lib/brand-seal-ink.ts sealHref(), which
   * falls back to a real drawing rather than rendering an empty box, so a typo
   * here is a wrong picture and never a hole in the wall.
   */
  glyph_key   text not null,
  /**
   * SERVICE ONLY. Which op-code family this certifies.
   *
   * Text rather than a foreign key, matching how service_family is carried on
   * `content` and resolved in op_code_family: the families are a TypeScript
   * constant (SERVICE_FAMILIES) that the database mirrors, and a FK would make
   * adding one a migration. Validated by the seed below and by test:certification.
   */
  service_family text,
  /**
   * ACTIVE IS CONTENT-DERIVED, NEVER HAND-SET.
   *
   * A track an advisor can start and can never finish is worse than no track.
   * The seed computes this from whether the certification actually has content
   * behind it, and the same rule is what a future re-seed must re-apply. It is
   * a stored column rather than a view because "was this earnable when they
   * started" is a question the screens ask constantly and a join per row is not
   * worth it.
   */
  active         boolean not null default false,
  /** One of the core eight. All eight held and current = EDIAGD Certified. */
  is_core        boolean not null default false,
  /** One of the next four, which point at Master rather than at Certified. */
  is_master_track boolean not null default false,
  sort           int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  /* Service certifications name a family; craft ones never do. */
  constraint certification_family_shape check (
    (kind = 'service' and service_family is not null)
    or (kind = 'craft' and service_family is null)
  ),
  /* The core eight and the next four are disjoint by construction. */
  constraint certification_rung_shape check (not (is_core and is_master_track))
);

create index if not exists certification_kind_idx on certification (kind, sort);
create index if not exists certification_active_idx on certification (active) where active;

/**
 * Which courses make up a certification. One or more.
 *
 * A craft certification is one Foundations course today, but the shape is
 * many-to-many on purpose: "Lasting Impressions" may well turn out to be Active
 * Delivery plus Everyday Touchpoints, and discovering that should be an INSERT
 * rather than a migration.
 *
 * SERVICE CERTIFICATIONS HAVE NO ROWS HERE YET. Their content is reachable
 * without a course — content.op_code joins op_code_family to a family, and that
 * resolves 766 of 766 published pitch items — so whether they need courses at
 * all is Ryan's open ruling. The table does not presume the answer.
 */
create table if not exists certification_course (
  certification_id uuid not null references certification(id) on delete cascade,
  course_id        uuid not null references course(id) on delete restrict,
  sort             int not null default 0,
  created_at       timestamptz not null default now(),
  primary key (certification_id, course_id)
);

create index if not exists certification_course_course_idx
  on certification_course (course_id);

/**
 * Ships empty. See the header.
 *
 * on delete restrict on the REQUIRED side: a certification that something else
 * depends on must not vanish and silently make the dependent earnable.
 */
create table if not exists certification_prerequisite (
  certification_id          uuid not null references certification(id) on delete cascade,
  requires_certification_id uuid not null references certification(id) on delete restrict,
  created_at                timestamptz not null default now(),
  primary key (certification_id, requires_certification_id),
  constraint prerequisite_not_self check (certification_id <> requires_certification_id)
);

-- ---- 2. What an advisor has earned ------------------------------------------

/**
 * One row per advisor per certification. Derived state, written on transition.
 *
 * LAPSED IS NEVER REVOKED — design law 3. There is no `revoked` column and no
 * delete path: current_through simply falls into the past, the screens read
 * "renew to stay current" in clay, and the row stays. A certification withdrawn
 * because a year elapsed would be the app telling somebody they un-learned
 * something.
 */
create table if not exists advisor_certification (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references app_user(id) on delete cascade,
  certification_id uuid not null references certification(id) on delete restrict,
  earned_at        timestamptz not null default now(),
  /** earned_at + 1 year. Annual currency, lightweight — design law 2. */
  current_through  date not null,
  /** Set by a refresher. Null means never renewed, not never current. */
  renewed_at       timestamptz,
  source           text not null default 'accrued'
                   check (source in ('accrued', 'refresher')),
  created_at       timestamptz not null default now(),
  unique (user_id, certification_id)
);

create index if not exists advisor_certification_user_idx
  on advisor_certification (user_id);
create index if not exists advisor_certification_current_idx
  on advisor_certification (certification_id, current_through);

/**
 * The two credentials. Computed, never granted by hand — design law 6.
 *
 * There is deliberately no admin write path to this table anywhere in the
 * application: a credential exists because its constituent certifications exist
 * and are current, and an "award" button would make it possible for the
 * credential to be true of somebody the data does not support. The contribution
 * programme (phase 3) is the one place a human attestation enters the system,
 * and it attests to a TASK, never to the credential.
 */
create table if not exists advisor_credential (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references app_user(id) on delete cascade,
  level          text not null check (level in ('certified', 'master')),
  earned_at      timestamptz not null default now(),
  /**
   * Public, verifiable, and NOT a uuid.
   *
   * Printed on a certificate and typed into a verify page by a hiring manager,
   * so it is short and unambiguous: EDG-C-2026-04837. Generated in SQL below so
   * the uniqueness is the database's problem rather than the application's.
   */
  certificate_id text not null unique,
  /** The first cohort to certify, marked permanently. Phase 2 sets it. */
  founding_class boolean not null default false,
  /**
   * The earliest current_through among its constituents — the credential is
   * only as current as its weakest part. Recomputed on every transition.
   */
  current_through date not null,
  created_at     timestamptz not null default now(),
  unique (user_id, level)
);

create index if not exists advisor_credential_user_idx on advisor_credential (user_id);

/**
 * EDG-C-2026-04837 / EDG-M-2027-00081.
 *
 * Five digits of randomness rather than a sequence: a sequential id tells a
 * competitor how many advisors have certified, and tells an advisor they were
 * number 3. Collisions retry — the unique index is the authority, this is only
 * the proposer.
 */
create or replace function mint_certificate_id(_level text)
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  _candidate text;
  _tries     int := 0;
begin
  loop
    _candidate := 'EDG-'
      || case when _level = 'master' then 'M' else 'C' end
      || '-' || to_char(now(), 'YYYY')
      || '-' || lpad((floor(random() * 100000))::int::text, 5, '0');
    exit when not exists (
      select 1 from advisor_credential where certificate_id = _candidate
    );
    _tries := _tries + 1;
    if _tries > 20 then
      raise exception 'could not mint a free certificate id after 20 tries';
    end if;
  end loop;
  return _candidate;
end $$;

revoke all on function mint_certificate_id(text) from public, anon, authenticated;

-- ---- 3. RLS -----------------------------------------------------------------

alter table certification              enable row level security;
alter table certification_course       enable row level security;
alter table certification_prerequisite enable row level security;
alter table advisor_certification      enable row level security;
alter table advisor_credential         enable row level security;

/*
 * THE CATALOGUE'S SHAPE IS NOT SECRET — same reasoning 0035 applied to course
 * and module. Anyone signed in may see that a certification exists and what it
 * is called; the CONTENT inside it is still gated by content_entitled_read,
 * which this does not touch. An advisor has to be able to see the track they
 * are working toward.
 */
drop policy if exists certification_read on certification;
create policy certification_read on certification
  for select using ((select auth.uid()) is not null);

drop policy if exists certification_course_read on certification_course;
create policy certification_course_read on certification_course
  for select using ((select auth.uid()) is not null);

drop policy if exists certification_prerequisite_read on certification_prerequisite;
create policy certification_prerequisite_read on certification_prerequisite
  for select using ((select auth.uid()) is not null);

/* Writes are admin-only, matching course_write/module_write in 0035. The
   catalogue is curation, and curation belongs to an admin screen. */
drop policy if exists certification_write on certification;
create policy certification_write on certification
  for all using (
    (select is_platform_owner())
    or exists (select 1 from membership m
                where m.user_id = (select auth.uid()) and m.active and m.role = 'admin')
  ) with check (
    (select is_platform_owner())
    or exists (select 1 from membership m
                where m.user_id = (select auth.uid()) and m.active and m.role = 'admin')
  );

drop policy if exists certification_course_write on certification_course;
create policy certification_course_write on certification_course
  for all using (
    (select is_platform_owner())
    or exists (select 1 from membership m
                where m.user_id = (select auth.uid()) and m.active and m.role = 'admin')
  ) with check (
    (select is_platform_owner())
    or exists (select 1 from membership m
                where m.user_id = (select auth.uid()) and m.active and m.role = 'admin')
  );

drop policy if exists certification_prerequisite_write on certification_prerequisite;
create policy certification_prerequisite_write on certification_prerequisite
  for all using (
    (select is_platform_owner())
    or exists (select 1 from membership m
                where m.user_id = (select auth.uid()) and m.active and m.role = 'admin')
  ) with check (
    (select is_platform_owner())
    or exists (select 1 from membership m
                where m.user_id = (select auth.uid()) and m.active and m.role = 'admin')
  );

/*
 * ---- WHAT SOMEBODY HAS EARNED --------------------------------------------
 *
 * Read your own, and whoever manages you reads yours — DELEGATED to the same
 * helpers swell_team_read uses, so "who can see my numbers" has one answer
 * across the whole product rather than a new one per feature.
 *
 * AN EARLIER DRAFT HAND-ROLLED THE MEMBERSHIP JOIN and claimed it matched
 * swell_team_read. It did not. Diffed against the live policy before this was
 * ever applied, it was missing two things:
 *
 *   is_platform_owner()  — swell_team_read leads with it; the hand-rolled
 *                          version omitted it, so a platform owner who holds
 *                          no admin membership could read a rooftop's swell
 *                          and not its certifications.
 *
 *   the org roles        — managed_rooftops() unions org_rooftops() for
 *                          group_owner / group_manager. The hand-rolled join
 *                          read `membership` alone, so a group owner who can
 *                          see their group's advisors today would have been
 *                          blind to every certification they hold.
 *
 * That is the argument against restating a rule you can call. managed_users()
 * is the rule; this asks it rather than re-deriving it.
 *
 * (On `them.active`: managed_users() does not filter the SUBJECT's membership
 * by active either. That is platform-wide behaviour and deliberately matched
 * here — a deactivated advisor's manager keeps reading their history, which is
 * what retire-never-delete implies. Changing it is a platform decision, not a
 * certification one.)
 *
 * THERE IS NO WRITE POLICY, AND THAT IS THE FEATURE. Not for the advisor, not
 * for a manager, not for an admin. These rows are derived state; the only thing
 * that may write them is the service role, which RLS does not apply to. A
 * credential an admin can insert is a credential a dealer can argue with.
 */
drop policy if exists advisor_certification_read on advisor_certification;
create policy advisor_certification_read on advisor_certification
  for select using (
    (select is_platform_owner())
    or user_id = (select auth.uid())
    or user_id in (select managed_users()));

drop policy if exists advisor_credential_read on advisor_credential;
create policy advisor_credential_read on advisor_credential
  for select using (
    (select is_platform_owner())
    or user_id = (select auth.uid())
    or user_id in (select managed_users()));

-- ---- 4. Seed: the twelve craft tracks ---------------------------------------

/*
 * MITCH'S ORDER, AND HIS NAMES. The first eight are the core; hold all eight,
 * current, and you are an EDIAGD Certified Advisor. The next four point at
 * Master.
 *
 * SEVEN OF THE TWELVE HAVE A COURSE and seed active. The other five have no
 * content behind them and seed INACTIVE — the row exists so the catalogue is
 * complete and the seal has somewhere to hang, but the track does not render.
 *
 * TWO OF THOSE FIVE ARE CORE — Lasting Impressions and CSI — which means
 * EDIAGD Certified cannot currently be earned by anybody. That is a content
 * fact, not a bug, and it is stated here so the next person reading this file
 * does not go looking for the defect: the credential is two courses away from
 * being real.
 */
insert into certification (kind, name, slug, glyph_key, is_core, is_master_track, sort, active)
values
  ('craft', 'Walk Around',               'craft-walk-around',            'craft_walk_around',         true,  false,  1, false),
  ('craft', 'Setting up the MPI',        'craft-setting-up-the-mpi',     'craft_mpi_setup',           true,  false,  2, false),
  ('craft', 'Four Step Close',           'craft-four-step-close',        'craft_four_step',           true,  false,  3, false),
  ('craft', 'Success Cycle',             'craft-success-cycle',          'craft_success_cycle',       true,  false,  4, false),
  ('craft', 'Overcoming Objections',     'craft-overcoming-objections',  'craft_objections',          true,  false,  5, false),
  ('craft', 'Power of Positive Language','craft-power-of-positive-language','craft_positive_language', true,  false,  6, false),
  ('craft', 'Lasting Impressions',       'craft-lasting-impressions',    'craft_lasting_impressions', true,  false,  7, false),
  ('craft', 'CSI',                       'craft-csi',                    'craft_csi',                 true,  false,  8, false),
  ('craft', 'Menu Presentation',         'craft-menu-presentation',      'craft_menu',                false, true,   9, false),
  ('craft', 'Chemical Warranty',         'craft-chemical-warranty',      'craft_chemical_warranty',   false, true,  10, false),
  ('craft', 'Phones and Tones',          'craft-phones-and-tones',       'craft_phones_tones',        false, true,  11, false),
  /* A Day in the Life is a named placeholder. Mitch: "I need to write this,
     but this is taking the core elements of the library itself." No content,
     seeds inactive, and stays inactive until he delivers it. */
  ('craft', 'A Day in the Life',         'craft-a-day-in-the-life',      'craft_day_in_life',         false, true,  12, false)
on conflict (slug) do nothing;

-- ---- 5. Seed: link the seven craft tracks that have a course ----------------

/* The mapping table leads, so both joins have it in scope. An inner join on
   each side means a renamed course silently links nothing rather than linking
   the wrong thing — and section 7 then leaves that certification inactive,
   which is the visible symptom. */
insert into certification_course (certification_id, course_id, sort)
select c.id, co.id, 0
  from (values
    ('craft-walk-around',               'foundations-the-walk-around'),
    ('craft-setting-up-the-mpi',        'foundations-the-multi-point-inspection'),
    ('craft-four-step-close',           'foundations-the-4-step-close'),
    ('craft-success-cycle',             'foundations-the-success-cycle'),
    ('craft-overcoming-objections',     'foundations-objection-handling'),
    ('craft-power-of-positive-language','foundations-language-that-sells'),
    ('craft-chemical-warranty',         'foundations-the-moc-warranty-program')
  ) as m(cert_slug, course_slug)
  join certification c on c.slug = m.cert_slug
  join course co       on co.slug = m.course_slug
on conflict do nothing;

-- ---- 6. Seed: eighteen service certifications -------------------------------

/*
 * ONE PER FAMILY IN SERVICE_FAMILIES, less Miscellaneous and Accessories.
 *
 * Neither has cues behind it, and the DMS mapping notes state Accessories is
 * deliberately never coached. "Certified in Miscellaneous" is not a credential
 * anybody would want to hold. That is the §10 ruling and it leaves eighteen.
 */
insert into certification (kind, name, slug, glyph_key, service_family, sort, active)
values
  ('service', 'Oil Change',        'service-oil-change',        'service_oil',         'Oil Change',       101, false),
  ('service', 'Filters',           'service-filters',           'service_filters',     'Filters',          102, false),
  ('service', 'Tires & Rotation',  'service-tires-rotation',    'service_tires',       'Tires & Rotation', 103, false),
  ('service', 'Alignment',         'service-alignment',         'service_alignment',   'Alignment',        104, false),
  ('service', 'Brake Service',     'service-brake-service',     'service_brakes',      'Brake Service',    105, false),
  ('service', 'Battery',           'service-battery',           'service_battery',     'Battery',          106, false),
  ('service', 'Fluids',            'service-fluids',            'service_fluids',      'Fluids',           107, false),
  ('service', 'Fuel System',       'service-fuel-system',       'service_fuel',        'Fuel System',      108, false),
  ('service', 'Spark Plugs',       'service-spark-plugs',       'service_spark',       'Spark Plugs',      109, false),
  ('service', 'Differential',      'service-differential',      'service_differential','Differential',     110, false),
  ('service', 'Maintenance',       'service-maintenance',       'service_maintenance', 'Maintenance',      111, false),
  ('service', 'Repair',            'service-repair',            'service_repair',      'Repair',           112, false),
  ('service', 'HVAC',              'service-hvac',              'service_hvac',        'HVAC',             113, false),
  ('service', 'Belts & Cooling',   'service-belts-cooling',     'service_belts',       'Belts & Cooling',  114, false),
  ('service', 'Wipers',            'service-wipers',            'service_wipers',      'Wipers',           115, false),
  ('service', 'Lighting',          'service-lighting',          'service_lighting',    'Lighting',         116, false),
  ('service', 'Suspension',        'service-suspension',        'service_suspension',  'Suspension',       117, false),
  ('service', 'Inspections',       'service-inspections',       'service_inspections', 'Inspections',      118, false)
on conflict (slug) do nothing;

-- ---- 7. Derive `active` from content, for both kinds ------------------------

/*
 * THE RULE, APPLIED RATHER THAN TYPED.
 *
 * An earlier draft of this task carried a hand-written list of "the six
 * families with no cues". Four of those six have had content land since it was
 * written — HVAC has 85 cues, Belts & Cooling 439 — so the list was already
 * wrong when it arrived. The rule was always "content-derived, not hand-set",
 * so this computes it and the list is gone.
 *
 * CRAFT is active when it has at least one course carrying a published cue. A
 * course row with no content is a name, not a track.
 *
 * SERVICE is active when its family has at least one published cue, counted the
 * way the rest of the application counts them: directly on content.service_family
 * OR through content.op_code -> op_code_family.family, which is the human-ruled
 * translation table and resolves every published pitch item.
 */
update certification c
   set active = exists (
         select 1
           from certification_course cc
           join content ct on ct.module_id in (
                 select m.id from module m where m.course_id = cc.course_id)
          where cc.certification_id = c.id
            and ct.status = 'published'
       ),
       updated_at = now()
 where c.kind = 'craft';

update certification c
   set active = exists (
         select 1 from content ct
          where ct.status = 'published'
            and (
              ct.service_family = c.service_family
              or exists (
                select 1 from op_code_family f
                 where f.retired_at is null
                   and upper(btrim(f.code)) = upper(btrim(ct.op_code))
                   and f.family = c.service_family)
            )
       ),
       updated_at = now()
 where c.kind = 'service';

notify pgrst, 'reload schema';
