-- ============================================================================
-- EDIAGD — LOCAL SEED DATA (not part of the migration sequence)
--
-- Supabase runs this file automatically on `supabase db reset` against the
-- LOCAL database. It is NOT run by `supabase db push`, so none of this can
-- reach production — which is the whole point of moving it out of
-- supabase/migrations/.
--
-- Everything here is test/demo data: the real Doggett CDJR June 2026 export and
-- the accounts we use to exercise the app. Structure (tables, views, policies)
-- stays in migrations.
--
-- SECTION 5 IS DIFFERENT, AND YOU SHOULD KNOW IT BEFORE YOU RUN ANYTHING.
-- It builds 100 demo rooftops, and it is written to be safe to run against the
-- production database on purpose — everything it creates is named '[DEMO] ...'
-- or lives at @ediagd.test, and supabase/demo_teardown.sql removes all of it.
-- Nothing gets there by accident: `supabase db push` does not run this file, so
-- reaching production takes a deliberate
--
--   psql "$DATABASE_URL" -f supabase/seed.sql
--
-- Against the local database it still runs by itself on `supabase db reset`.
--
-- Order matters — foreign keys:
--   org -> rooftop -> app_user -> membership
--   rooftop -> perf_period -> advisor_op_metric (also -> service_line)
-- ============================================================================


-- ---------------------------------------------------------------------------
-- HELPERS — a scratch `demo` schema, dropped at the end of the file
-- ---------------------------------------------------------------------------
-- Functions and working tables this file needs and the application does not.
--
-- NOT pg_temp, and that is deliberate. `supabase db reset` hands the seed to
-- the database in batches that are NOT guaranteed to share one connection, and
-- session-temp objects disappear the moment a statement lands on a different
-- one — it failed on a different missing table each run. A real schema is
-- visible to every connection, so the file works the same under psql, under
-- db reset, and pasted into the SQL editor.
--
-- The last statement in SECTION 5 is `drop schema demo cascade`, so a run that
-- finishes leaves nothing behind. A run that dies halfway leaves the schema,
-- which demo_teardown.sql also drops. Nothing here is exposed through
-- PostgREST — it only serves `public` and `graphql_public`.
--
-- WHY THE DO BLOCK. `supabase db reset` PREPARES every statement in the file
-- before it EXECUTES any of them, so a statement that references something an
-- earlier statement creates fails to parse — the seed died on `demo.orgs does
-- not exist` even though the create was right above it. PL/pgSQL plans each
-- statement when it reaches it, so wrapping the work in DO blocks makes the
-- file behave identically under psql, under db reset, and in the SQL editor.
-- It buys atomicity too: SECTION 5 is one statement, so it either all lands or
-- none of it does.
-- ---------------------------------------------------------------------------

do $helpers$
begin

create schema if not exists demo;

-- A working email/password login, in SQL. GoTrue owns auth.users, but it reads
-- what it finds: a bcrypt hash in encrypted_password plus a row in
-- auth.identities carrying 'sub' is exactly what the API would have written.
-- auth.identities.email is a GENERATED column — deriving it from identity_data
-- is the reason that column must contain the address.
create or replace function demo.seed_auth_user(_id uuid, _email text, _password text)
returns void language sql as $$
  with u as (
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', _id, 'authenticated', 'authenticated',
      _email, crypt(_password, gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      '', '', '', ''
    )
    -- Re-running the seed must not double the accounts. No row out means no
    -- identity written either, which is exactly right.
    on conflict (id) do nothing
    returning id
  )
  insert into auth.identities (id, user_id, provider_id, identity_data, provider,
                               last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), u.id, u.id::text,
         jsonb_build_object('sub', u.id::text, 'email', _email),
         'email', now(), now(), now()
  from u;
$$;

-- Deterministic pseudo-randomness. Same seed string, same value, every run and
-- every machine — md5 doesn't care about row order, planner choices or
-- parallelism, all of which make setseed()+random() unreproducible in practice.
-- The mask clears the sign bit so the result is always in [0, 1).
create or replace function demo.rnd(seed text) returns double precision
language sql immutable as $$
  select (('x' || substr(md5('ediagd-demo-v1|' || seed), 1, 8))::bit(32)::bigint
          & 2147483647) / 2147483648.0;
$$;

/** A stable uuid for a given seed string — the demo's primary keys. */
create or replace function demo.duid(seed text) returns uuid
language sql immutable as $$
  select md5('ediagd-demo-v1|' || seed)::uuid;
$$;

/** Deterministic integer in [lo, hi]. */
create or replace function demo.pick(seed text, lo int, hi int) returns int
language sql immutable as $$
  select lo + floor(demo.rnd(seed) * (hi - lo + 1))::int;
$$;

-- Does this schedule put them on the drive that day? This is the SQL twin of
-- isWorkDay() in lib/gamification/streak.ts, and it has to stay that way: it
-- decides both which days get activity and what was_scheduled records.
create or replace function demo.works_on(
  _d date, _mon bool, _tue bool, _wed bool, _thu bool, _fri bool, _sun bool,
  _sat_mode text, _sat_anchor date
) returns boolean language sql immutable as $$
  select case extract(isodow from _d)::int
    when 1 then _mon
    when 2 then _tue
    when 3 then _wed
    when 4 then _thu
    when 5 then _fri
    when 6 then case _sat_mode
                  when 'every' then true
                  -- Whole weeks apart, either direction — same parity rule as
                  -- worksThisSaturday(), which mods by 14.
                  when 'alternating' then _sat_anchor is not null
                                          and (abs(_d - _sat_anchor) % 14) = 0
                  else false
                end
    else _sun
  end;
$$;

end
$helpers$;


-- ---------------------------------------------------------------------------
-- SECTION 0 — PREREQUISITES  (the rows everything below hangs off)
-- ---------------------------------------------------------------------------
-- These were made by hand in the SQL editor and never captured in git, so
-- `supabase db reset` used to fail on the first foreign key in SECTION 1. They
-- are reproducible now, and two things make that safe:
--
--   * THE WHOLE BLOCK IS GUARDED on the Doggett rooftop not already existing.
--     Run against a database that has the real rows and it does nothing at all
--     — production's org, rooftop, advisors and metrics are never touched.
--   * auth.users CAN be seeded with a plain INSERT. The old note here said it
--     couldn't, which is what stalled this. GoTrue owns the schema, but a row
--     carrying a bcrypt hash in encrypted_password plus a matching
--     auth.identities row IS a working email/password login. SECTION 5 builds
--     its demo accounts the same way.
--
-- The org id below is a LOCAL STAND-IN: production's Doggett org id was never
-- written down, and since the guard stops this ever running there, it doesn't
-- have to match. Everything else uses the real production ids.
--
-- Local login: ryan@pearanalytics.com / demo-password-2026
-- ---------------------------------------------------------------------------

do $$
declare
  _org     uuid := '11111111-1111-1111-1111-111111111111';
  _rooftop uuid := '22222222-2222-2222-2222-222222222222';
  _ryan    uuid := '78929620-f92b-416f-80ac-41fcc3a6e3e8';
  _op      text;
  _uid     uuid;
begin
  if exists (select 1 from rooftop where id = _rooftop) then
    raise notice 'SECTION 0 skipped — the Doggett rooftop is already here.';
    return;
  end if;

  insert into org (id, name) values (_org, 'Doggett Automotive');

  insert into rooftop (id, org_id, name, dms_kind, timezone)
  values (_rooftop, _org, 'Doggett CDJR', 'cdk', 'America/Chicago');

  insert into rooftop_product (rooftop_id, product) values (_rooftop, 'advisor_base');

  -- The test login. is_platform_owner is set directly rather than through the
  -- app: 0015's trigger only blocks the change when auth.uid() is non-null, and
  -- in a seed it is null.
  perform demo.seed_auth_user(_ryan, 'ryan@pearanalytics.com', 'demo-password-2026');
  insert into app_user (id, full_name, is_platform_owner) values (_ryan, 'Ryan Kelly', true);
  insert into membership (user_id, rooftop_id, role) values (_ryan, _rooftop, 'manager');

  -- The three placeholder advisors the manager roster expects. op_code_id is
  -- what ties a person to their advisor_op_metric rows in SECTION 1.
  foreach _op in array array['400025', '400049', '400030'] loop
    _uid := md5('ediagd-doggett|' || _op)::uuid;
    perform demo.seed_auth_user(_uid, 'advisor.' || _op || '@ediagd.test', 'demo-password-2026');
    insert into app_user (id, full_name)
    values (_uid, 'Doggett Advisor ' || _op);
    insert into membership (user_id, rooftop_id, role, op_code_id)
    values (_uid, _rooftop, 'advisor', _op);
  end loop;
end $$;


-- ---------------------------------------------------------------------------
-- SECTION 1 — Doggett CDJR June 2026 export  (was 0004_seed_doggett.sql)
-- ---------------------------------------------------------------------------

insert into perf_period (id, rooftop_id, starts_on, ends_on, label, source_file) values
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','2026-06-01','2026-06-30','June 2026','OpCodeAnalysisReport_Doggett_CDJR_202606') on conflict do nothing;

insert into service_line (op_code, category, description, family) values
  ('LOFD','LOF','CHANGE DIESEL ENGINE OIL AND FILTER (SYNTHETIC OIL MAY BE REQUIRED BASED ON GEOGRAPHIC LOCATION) [12QT. 10W30]','Oil Change'),
  ('QL18D','LOF','REPLACE ENGINE OIL AND FILTER [7QT. 5W20]','Oil Change'),
  ('QL20D','LOF','REPLACE SYNTHETIC ENGINE OIL AND FILTER [7QT. 0W20]','Oil Change'),
  ('100','Maintenance','INSTALL ACCESSORIES','Maintenance'),
  ('13D','Maintenance','BRAKE SERVICE INCLUDING *** MOC BRAKE QUIET *** MOPAR V-LINE PADS *** TURN ROTORS ***','Brake Service'),
  ('16D','Maintenance','REAR DIFFERENTIAL SERVICE INCLUDING MOC LIMITED SLIP ADDITIVE','Differential'),
  ('16F','Maintenance','FRONT DIFFERENTIAL SERVICE INCLUDING MOC LIMITED SLIP ADDITIVE','Differential'),
  ('21D','Maintenance','REPLACE AIR FILTER','Filters'),
  ('22D','Maintenance','CABIN AIR FILTER CHANGE','Filters'),
  ('23DD','Maintenance','REPLACE FRONT AND REAR DIESEL FUEL FILTERS','Fuel System'),
  ('25D','Maintenance','*4 WHEEL ALIGNMENT','Alignment'),
  ('26D','Maintenance','TIRE BALANCE & ROTATION','Tires & Rotation'),
  ('28D','Maintenance','ROTATE TIRES','Tires & Rotation'),
  ('36D','Maintenance','8 CYL-NON PLATINUM SPARK PLUG REPLACEMENT','Spark Plugs'),
  ('36H','Maintenance','HEMI SPARK PLUG SERVICE','Spark Plugs'),
  ('38D','Maintenance','6 CYL PLATINUM SPARK PLUG REPLACEMENT','Spark Plugs'),
  ('67AFF5','Maintenance','REPLACE BOTH FUEL FILTERS 6.7 DIESEL','Fuel System'),
  ('6D','Maintenance','MOC FUEL INDUCTION SERVICE','Fuel System'),
  ('AF5','Maintenance','REPLACE AIR FILTER CAR','Filters'),
  ('AFT5','Maintenance','REPLACE TRUCK FILTER','Maintenance'),
  ('ALIGN','Maintenance','FRONT-WHEEL ALIGNMENT','Alignment'),
  ('CF5','Maintenance','REPLACE CABIN FILTER','Maintenance'),
  ('CLF5','Maintenance','MOC COOLANT FLUSH','Fluids'),
  ('DS5','Maintenance','PERFORM DIFFERENTIAL SERVICE FRONT OR REAR','Differential'),
  ('FLAT','Maintenance','*ONE FLAT REPAIR','Maintenance'),
  ('INJ5','Maintenance','MOC FUEL INDUCTION SERVICE','Fuel System'),
  ('MB15','Maintenance','MOUNT BALANCE 1 TIRE','Tires & Rotation'),
  ('MB4','Maintenance','DISMOUNT, MOUNT AND BALANCE 4 TIRES','Tires & Rotation'),
  ('QL47D','Maintenance','1-REPLACE WIPER(S)','Maintenance'),
  ('RWB5','Maintenance','REPLACE REAR WIPER BLADE','Maintenance'),
  ('TCS5','Maintenance','PERFORM TRANSFER CASE SERVICE','Fluids'),
  ('9090','Miscellaneous','MULTI-POINT INSPECTION (ACCORDING TO MAINTENANCE INTERVAL)','Miscellaneous'),
  ('24D','Repair','BRAKE SYSTEM FLUSH','Brake Service'),
  ('STS','Repair','SEE TECH STORY','Repair'),
  ('QL19D','LOF','OIL AND FILTER CHANGE W/ROTATE. 3995','Tires & Rotation'),
  ('15D','Maintenance','MOC BATTERY SERVICE','Maintenance'),
  ('23D','Maintenance','REPLACE DIESEL FUEL FILTER','Fuel System'),
  ('37D','Maintenance','PERFORM 4 CYLINDER PLATINUM SPARK PLUGS','Spark Plugs'),
  ('8D','Maintenance','MOC COOLANT SYSTEM FLUSH','Fluids'),
  ('BATT','Maintenance','REPLACE VEHICLE BATTERY','Maintenance'),
  ('MB1','Maintenance','DISMOUNT, MOUNT AND BALANCE 1 TIRE','Tires & Rotation'),
  ('NWD','Maintenance','NO WORK DONE','Maintenance'),
  ('ROT5','Maintenance','TIRE ROTATION','Tires & Rotation'),
  ('KEY','Miscellaneous','PROGRAM NEW KEY FOB 1KEY UP TO 4 KEYS','Miscellaneous'),
  ('35DOZ','Repair','INDICATOR/WARNING LIGHTS CONCERN','Repair'),
  ('EVAC','Repair','EVACUATE AND RECHARGE AC SYSTEM  NOT INCLUDING FREON','Repair'),
  ('ACEVAP5','Maintenance','AC SERVICE EVAPORATOR CLEANER','Maintenance'),
  ('MB2','Maintenance','DISMOUNT, MOUNT AND BALANCE 2 TIRES','Tires & Rotation'),
  ('10DOZ','Repair','AC/HEATING CONCERN','Repair')
on conflict (op_code) do nothing;

insert into advisor_op_metric (period_id, rooftop_id, advisor_op_id, op_code, ros, elr, frhs, frhs_per_ro, labor_sales, labor_per_ro, labor_gp_pct, ro_lines) values
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','35122','LOFD',6.0,69.36,3.0,0.5,208.08,34.68,0.453335,0.394352),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','35122','QL18D',10.0,70.0,3.0,0.3,210.0,21.0,0.375714,0.40168),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','35122','QL20D',40.0,60.0,12.0,0.3,720.0,18.0,0.537917,0.352027),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','35122','100',7.0,194.36,15.0,2.142857,2915.4,416.485714,0.725424,0.297635),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','35122','13D',1.0,150.0,4.0,4.0,600.0,600.0,0.606667,0.256418),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','35122','16D',6.0,162.5,4.8,0.8,780.0,130.0,0.688718,0.418778),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','35122','16F',2.0,162.5,1.6,0.8,260.0,130.0,0.664615,0.420174),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','35122','21D',3.0,175.0,0.3,0.1,52.5,17.5,0.837143,0.361936),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','35122','22D',2.0,140.0,0.5,0.25,70.0,35.0,0.703429,0.356089),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','35122','23DD',3.0,100.0,5.4,1.8,540.0,180.0,0.541667,0.357882),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','35122','25D',1.0,139.95,1.0,1.0,139.95,139.95,0.578421,0.0),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','35122','26D',2.0,87.4375,1.6,0.8,139.9,69.95,0.837026,0.0),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','35122','28D',27.0,98.490741,10.8,0.4,1063.7,39.396296,0.700103,0.0),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','35122','36D',2.0,120.0,6.0,3.0,720.0,360.0,0.5375,0.436056),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','35122','36H',2.0,120.0,6.0,3.0,720.0,360.0,0.545833,0.277108),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','35122','38D',1.0,120.0,3.0,3.0,360.0,360.0,0.5625,0.400631),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','35122','67AFF5',1.0,100.0,1.8,1.8,180.0,180.0,0.715,0.357882),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','35122','6D',3.0,150.0,3.0,1.0,450.0,150.0,0.622222,0.328913),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','35122','AF5',1.0,175.0,0.1,0.1,17.5,17.5,0.7,0.400242),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','35122','AFT5',2.0,175.0,0.2,0.1,35.0,17.5,0.837143,0.339864),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','35122','ALIGN',2.0,149.95,2.0,1.0,299.9,149.95,0.608203,0.0),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','35122','CF5',6.0,100.0,1.5,0.25,150.0,25.0,0.624,0.421522),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','35122','CLF5',1.0,150.0,1.0,1.0,150.0,150.0,0.636667,0.401835),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','35122','DS5',3.0,168.75,2.4,0.8,405.0,135.0,0.732346,0.418778),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','35122','FLAT',1.0,60.0,0.5,0.5,30.0,30.0,0.525,0.0),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','35122','INJ5',1.0,150.0,1.0,1.0,150.0,150.0,0.81,0.415083),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','35122','MB15',3.0,70.0,1.5,0.5,105.0,35.0,0.469048,0.201649),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','35122','MB4',1.0,100.0,1.0,1.0,100.0,100.0,0.715,0.090918),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','35122','QL47D',1.0,109.5,0.1,0.1,10.95,10.95,0.739726,0.842632),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','35122','RWB5',1.0,100.0,0.25,0.25,25.0,25.0,0.41,0.4),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','35122','TCS5',1.0,162.5,0.8,0.8,130.0,130.0,0.664615,0.4),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','35122','100',6.0,191.94,5.0,0.833333,959.7,159.95,0.731687,0.584054),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','35122','9090',1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','35122','100',26.0,196.597398,115.3,4.434615,22667.68,871.833846,0.710478,0.472644),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','35122','24D',1.0,157.142857,0.7,0.7,110.0,110.0,0.818636,0.401379),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','35122','9090',1.0,196.475,2.0,2.0,392.95,392.95,0.689528,0.534884),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','35122','STS',1.0,204.271429,3.5,3.5,714.95,714.95,0.733198,0.583031),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400025','LOFD',4.0,69.36,2.0,0.5,138.72,34.68,0.471958,0.396384),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400025','QL18D',14.0,70.0,4.2,0.3,294.0,21.0,0.508673,0.367969),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400025','QL19D',10.0,27.5,8.0,0.8,220.0,22.0,-0.130909,0.410586),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400025','QL20D',25.0,60.0,7.5,0.3,450.0,18.0,0.465667,0.366513),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400025','100',11.0,184.885714,17.5,1.590909,3235.5,294.136364,0.708824,0.421785),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400025','13D',5.0,159.295,10.0,2.0,1592.95,318.59,0.665401,0.492403),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400025','15D',1.0,100.0,0.3,0.3,30.0,30.0,0.715,0.428235),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400025','16D',7.0,162.5,5.6,0.8,910.0,130.0,0.696703,0.387195),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400025','16F',4.0,162.5,3.2,0.8,520.0,130.0,0.690769,0.361159),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400025','21D',12.0,175.0,1.2,0.1,210.0,17.5,0.778095,0.370259),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400025','22D',8.0,140.0,2.0,0.25,280.0,35.0,0.716857,0.354553),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400025','23D',1.0,162.5,0.8,0.8,130.0,130.0,0.824615,0.357882),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400025','23DD',4.0,100.0,7.2,1.8,720.0,180.0,0.47125,0.357882),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400025','24D',1.0,157.142857,0.7,0.7,110.0,110.0,0.818636,0.401379),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400025','25D',1.0,139.95,1.0,1.0,139.95,139.95,0.56413,0.0),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400025','26D',2.0,81.1875,1.6,0.8,129.9,64.95,0.648961,0.0),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400025','28D',18.0,97.798611,7.2,0.4,704.15,39.119444,0.669105,0.0),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400025','36D',2.0,120.0,6.0,3.0,720.0,360.0,0.5375,0.359677),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400025','36H',2.0,120.0,6.0,3.0,720.0,360.0,0.535417,0.300226),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400025','37D',1.0,130.0,1.0,1.0,130.0,130.0,0.546154,0.4),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400025','38D',2.0,120.0,6.0,3.0,720.0,360.0,0.491667,0.4003),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400025','6D',7.0,150.0,7.0,1.0,1050.0,150.0,0.613333,0.375627),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400025','8D',5.0,160.78,5.0,1.0,803.9,160.78,0.65232,0.306759),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400025','AFT5',2.0,175.0,0.2,0.1,35.0,17.5,0.75,0.249132),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400025','ALIGN',1.0,149.95,1.0,1.0,149.95,149.95,0.809937,0.0),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400025','BATT',3.0,160.475,2.0,0.666667,320.95,106.983333,0.727372,0.380237),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400025','CF5',2.0,100.0,0.5,0.25,50.0,25.0,0.7148,0.350158),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400025','DS5',1.0,168.75,1.6,1.6,270.0,270.0,0.638519,0.418778),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400025','FLAT',1.0,60.0,0.5,0.5,30.0,30.0,-0.016667,0.0),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400025','MB1',1.0,50.0,0.5,0.5,25.0,25.0,0.43,0.200752),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400025','NWD',1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.402844),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400025','QL47D',2.0,109.5,0.2,0.1,21.9,10.95,0.461187,0.143322),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400025','ROT5',1.0,99.875,0.4,0.4,39.95,39.95,0.714643,0.0),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400025','100',7.0,195.291954,8.7,1.242857,1699.04,242.72,0.723962,0.479365),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400025','KEY',6.0,191.9,3.0,0.5,575.7,95.95,0.698628,0.46101),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400025','NWD',1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.437993),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400025','100',26.0,189.945153,78.4,3.015385,14891.7,572.757692,0.695512,0.422976),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400025','24D',1.0,157.142857,0.7,0.7,110.0,110.0,0.624545,0.401379),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400025','35DOZ',2.0,191.95,2.0,1.0,383.9,191.95,0.687419,0.677419),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400025','9090',1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.295455),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400025','EVAC',1.0,220.385714,1.4,1.4,308.54,308.54,0.761781,0.417178),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400049','100',1.0,191.95,0.6,0.6,115.17,115.17,0.851524,0.295591),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400049','LOFD',1.0,69.36,0.5,0.5,34.68,34.68,0.5891,0.400135),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400049','QL18D',5.0,70.0,1.5,0.3,105.0,21.0,0.592857,0.390525),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400049','QL19D',2.0,27.5,1.6,0.8,44.0,22.0,-0.036364,0.35622),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400049','QL20D',10.0,60.0,3.0,0.3,180.0,18.0,0.4275,0.341778),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400049','100',15.0,191.945455,13.2,0.88,2533.68,168.912,0.758711,0.35753),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400049','13D',1.0,150.0,4.0,4.0,600.0,600.0,0.65,0.284055),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400049','15D',1.0,100.0,0.3,0.3,30.0,30.0,0.475,0.428235),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400049','16D',4.0,162.5,3.2,0.8,520.0,130.0,0.734615,0.412292),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400049','16F',4.0,162.5,3.2,0.8,520.0,130.0,0.697692,0.418778),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400049','21D',2.0,175.0,0.2,0.1,35.0,17.5,0.837143,0.335399),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400049','22D',4.0,140.0,1.0,0.25,140.0,35.0,0.746286,0.343969),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400049','23DD',1.0,100.0,1.8,1.8,180.0,180.0,0.715,0.357882),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400049','24D',2.0,157.142857,1.4,0.7,220.0,110.0,0.818636,0.401379),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400049','28D',7.0,99.875,2.8,0.4,279.65,39.95,0.714643,0.0),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400049','36H',1.0,120.0,3.0,3.0,360.0,360.0,0.5625,0.4),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400049','38D',1.0,120.0,3.0,3.0,360.0,360.0,0.545833,0.4003),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400049','6D',4.0,150.0,4.0,1.0,600.0,150.0,0.715833,0.406607),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400049','ACEVAP5',1.0,191.95,1.0,1.0,191.95,191.95,0.716072,0.403548),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400049','AFT5',1.0,175.0,0.1,0.1,17.5,17.5,0.837143,0.324478),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400049','CLF5',1.0,150.0,1.0,1.0,150.0,150.0,0.636667,0.401835),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400049','FLAT',1.0,60.0,0.5,0.5,30.0,30.0,0.525,0.0),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400049','MB1',1.0,500.0,0.05,0.05,25.0,25.0,0.9428,0.203173),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400049','MB2',1.0,100.0,0.5,0.5,50.0,50.0,0.715,0.201357),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400049','STS',1.0,191.9,0.5,0.5,95.95,95.95,0.851485,0.4),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400049','100',3.0,191.95,5.0,1.666667,959.75,319.916667,0.705653,0.267352),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400049','KEY',1.0,191.9,0.5,0.5,95.95,95.95,0.682126,0.0),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400049','STS',1.0,191.95,1.0,1.0,191.95,191.95,0.692628,0.413949),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400049','100',16.0,195.89287,54.7,3.41875,10715.34,669.70875,0.712412,0.443874),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400049','10DOZ',1.0,191.95,1.0,1.0,191.95,191.95,0.692628,0.0),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400049','9090',1.0,0.0,0.0,0.0,0.0,0.0,0.0,0.410828),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400049','STS',15.0,194.229762,50.4,3.36,9789.18,652.612,0.711304,0.423896),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400030','QL18D',1.0,70.0,0.3,0.3,21.0,21.0,0.592857,0.380726),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400030','QL19D',2.0,27.5,1.6,0.8,44.0,22.0,-0.036364,0.347737),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400030','QL20D',1.0,60.0,0.3,0.3,18.0,18.0,0.525,0.324453),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400030','QL19D',2.0,28.453846,1.3,0.65,36.99,18.495,-0.001622,0.199502),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400030','100',2.0,0.0,0.0,0.0,0.0,0.0,0.0,0.087363)
on conflict (period_id, advisor_op_id, op_code) do nothing;

-- NOTE: advisor_op_id values ('35122','400025','400049','400030') match
-- membership.op_code_id. Create advisor logins later and set their op_code_id
-- to link a person to their metrics.


-- ---------------------------------------------------------------------------
-- SECTION 2 — Authoritative per-advisor totals  (was the INSERT in 0005)
-- The report's own 'All Categories' rollup: RO counts cannot be summed across
-- op-code lines, so these are the source of truth for total_ros.
-- ---------------------------------------------------------------------------
insert into advisor_period_total_src (period_id, rooftop_id, advisor_op_id, total_ros, blended_elr, total_labor_sales, gp_pct, total_ro_lines) values
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','35122',100.0,165.049222,36583.16,0.689764,null),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400025',109.0,154.977369,32870.7,0.665035,null),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400049',61.0,178.436342,29361.7,0.708685,null),
  ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','400030',8.0,34.282857,119.99,0.168681,null)
on conflict do nothing;


-- ---------------------------------------------------------------------------
-- SECTION 3 — Test advisor membership  (was 0007_seed_test_advisor.sql)
-- Links the test login to Esparza (35122) so /advisor renders real numbers.
-- Depends on the app_user and rooftop rows in SECTION 0.
-- ---------------------------------------------------------------------------
-- link the existing test user to Esparza (35122) as an advisor at the test rooftop
insert into membership (user_id, rooftop_id, role, op_code_id)
values ('78929620-f92b-416f-80ac-41fcc3a6e3e8',
        '22222222-2222-2222-2222-222222222222', 'advisor', '35122')
on conflict (user_id, rooftop_id, role) do update set op_code_id = excluded.op_code_id;


-- ---------------------------------------------------------------------------
-- SECTION 4 — Engagement activity for the real rooftop (daily_activity)
-- ---------------------------------------------------------------------------
-- Still nothing: 0009_activity.sql contains no INSERTs, and no real engagement
-- rows exist for Doggett. The demo groups in SECTION 5 carry their own.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- SECTION 5 — DEMO DEALER GROUPS AT SCALE
-- ===========================================================================
-- 100 rooftops across 14 groups, so /admin can be exercised at the size it was
-- designed for instead of the one rooftop we actually have.
--
-- SAFE TO RUN AGAINST PRODUCTION, by construction:
--
--   * EVERY row is marked. Orgs and rooftops are named '[DEMO] ...', every
--     login is 'demo.<name>.<id>@ediagd.test'. (.test is reserved by RFC 2606
--     and can never be a real address, so none of these can be mailed.)
--   * Nothing here touches the Doggett org, rooftop, advisors or metrics. The
--     demo lives in its own orgs and never joins to a real row.
--   * Every insert is keyed on a deterministic id or a natural key with ON
--     CONFLICT DO NOTHING, so running it twice does not double the data.
--   * supabase/demo_teardown.sql removes all of it in one command.
--
-- DETERMINISTIC: every value derives from md5(seed-string) via demo.rnd, so
-- the same rooftops, the same people and the same engagement come back on
-- every run and every machine. Only two things vary: the bcrypt salt on the
-- passwords, and the window, which is anchored to current_date so the demo is
-- always "the last four weeks" rather than a date that rots.
--
-- Login for every demo account: demo-password-2026
-- ===========================================================================


do $demo$
begin

-- ---- 5.1 Groups and rooftops ----------------------------------------------
-- Deliberately lopsided: a 20-store group and three single-store owners
-- exercise very different rollups. The platform-owner view sees all of it; a
-- group admin (5.3) sees only their own group.

create table demo.orgs (idx int primary key, id uuid, name text, stores int);

insert into demo.orgs (idx, id, name, stores)
select v.idx, demo.duid('org:' || v.idx), '[DEMO] ' || v.name, v.stores
from (values
  (1,  'Windward Auto Group',     20),
  (2,  'Harbor Point Motors',     15),
  (3,  'Sunrise Automotive',      14),
  (4,  'Tidewater Dealer Group',  11),
  (5,  'Palm Coast Auto',          9),
  (6,  'Longboard Motors',         8),
  (7,  'Anchor & Oak Automotive',  6),
  (8,  'Driftwood Auto Group',     5),
  (9,  'Reef Line Motors',         4),
  (10, 'Sandbar Automotive',       3),
  (11, 'Two Palms Motors',         2),
  (12, 'Kelp Bay Ford',            1),
  (13, 'Half Moon Chevrolet',      1),
  (14, 'Otter Rock Kia',           1)
) as v(idx, name, stores);   -- 20+15+14+11+9+8+6+5+4+3+2+1+1+1 = 100

-- One town per rooftop, so all 100 names are distinct and search has something
-- real to match. A short list would make two stores share a name and quietly
-- weaken the search test.
create table demo.city (n int primary key, name text);
insert into demo.city (n, name)
select row_number() over (), c from unnest(array[
  'Ashland','Bayview','Belmont','Bridgeport','Brookhaven','Cedar Falls','Chandler',
  'Clearwater','Coldwater','Concord','Crestview','Cypress','Danbury','Dover',
  'Eastvale','Edgewater','Elkhart','Fairfield','Fallbrook','Fernwood','Foley',
  'Fremont','Galena','Glenwood','Grandview','Greenfield','Gulfport','Hartwell',
  'Haverford','Highland Park','Hollister','Hopewell','Ironwood','Jasper','Kearney',
  'Kingsport','Lakeland','Larkspur','Laurel','Lexington','Lindale','Longview',
  'Loomis','Maplewood','Marbury','Marlton','Meridian','Millbrook','Montrose',
  'Norwalk','Oakdale','Oakhurst','Ocean Springs','Palmetto','Parkville','Pinehurst',
  'Plainview','Port Arthur','Prescott','Quarry Hill','Redlands','Ridgefield',
  'Riverton','Rockport','Rosemont','Saltillo','Sandpoint','Seabrook','Sedona',
  'Shelby','Sherwood','Silverton','Southlake','Springdale','Stillwater',
  'Stonebridge','Sugar Land','Summerville','Sunbury','Tallgrass','Temple',
  'Thornton','Tidewater','Torrance','Trenton','Tualatin','Union City','Valdosta',
  'Verona','Waconia','Wakefield','Walnut Creek','Waterford','Wellington',
  'Westbrook','Whitefish','Willow Park','Windsor','Winnetka','Yorktown',
  'Zephyr Cove'
]) c;

create table demo.rooftops (
  id uuid primary key, org_id uuid, n int, name text, tz text, archetype text
);

insert into demo.rooftops (id, org_id, n, name, tz, archetype)
with spec as (
  select o.idx, o.id as org_id, s,
         (row_number() over (order by o.idx, s))::int as n
  from demo.orgs o, generate_series(1, o.stores) s
)
select
  demo.duid('rooftop:' || spec.idx || ':' || spec.s),
  spec.org_id,
  spec.n,
  '[DEMO] ' || (array[
    'Ford','Toyota','Chevrolet','Honda','Kia','Subaru','Nissan','Hyundai',
    'Jeep','Mazda','Buick GMC','Ram','Volkswagen','Lincoln','Chrysler'
  ])[1 + (spec.n % 15)] || ' of ' || c.name,
  -- Five zones on purpose: rooftop_today() is what anchors the detail card's
  -- 30-day window, and a single timezone would never exercise it.
  (array['America/New_York','America/Chicago','America/Denver',
         'America/Los_Angeles','Pacific/Honolulu'])[1 + (spec.n % 5)],
  -- The spread the exceptions list exists to surface. 'mixed' is the important
  -- one: a good store with one or two people dragging it down.
  case
    when demo.rnd('arch:' || spec.n) < 0.22 then 'thriving'
    when demo.rnd('arch:' || spec.n) < 0.44 then 'struggling'
    when demo.rnd('arch:' || spec.n) < 0.74 then 'mixed'
    else 'steady'
  end
from spec join demo.city c on c.n = spec.n;

insert into org (id, name) select id, name from demo.orgs
on conflict (id) do nothing;

insert into rooftop (id, org_id, name, dms_kind, timezone)
select r.id, r.org_id, r.name,
       (array['cdk','reynolds','tekion','dealertrack'])[1 + (r.n % 4)], r.tz
from demo.rooftops r
on conflict (id) do nothing;

insert into rooftop_product (rooftop_id, product)
select id, 'advisor_base' from demo.rooftops
on conflict (rooftop_id, product) do nothing;


-- ---- 5.2 People ------------------------------------------------------------
-- 3-8 advisors and 1-2 managers per rooftop, plus one group admin per org who
-- holds an admin membership at every rooftop in their group. That last one is
-- the point: it produces a dealer admin with 20 rooftops in scope, which is the
-- case admin_rooftops() and the whole aggregate-first design were written for.

create table demo.staff as
select
  r.id as rooftop_id,
  r.n,
  x.role,
  x.i,
  demo.duid('person:' || r.n || ':' || x.role || ':' || x.i) as user_id,
  (array[
    'Dana','Marcus','Priya','Jordan','Alicia','Terrell','Nina','Owen','Sofia',
    'Grant','Yusuf','Renee','Caleb','Imani','Diego','Hannah','Miles','Farrah',
    'Victor','Leah','Andre','Simone','Colin','Rosa','Kenji','Tessa','Bryce',
    'Amara','Logan','Noor','Trevor','Camille','Devin','Paloma','Isaac','Greta',
    'Malik','June','Rafael','Sloane'
  ])[1 + (demo.pick('fn:' || r.n || x.role || x.i, 0, 39))] || ' ' ||
  (array[
    'Kiernan','Alvarez','Whitfield','Okonkwo','Barrera','Nakamura','Delaney',
    'Petrov','Sandoval','Fitzgerald','Haddad','Moreau','Castellanos','Brennan',
    'Vasquez','Lindqvist','Ferrell','Osei','Marchetti','Blackwell','Duarte',
    'Kowalski','Ramsey','Ibarra','Thorne','Espinoza','Gallagher','Mwangi',
    'Salinas','Rutherford','Cardoso','Beaumont','Quintero','Ashford','Novak',
    'Trujillo','Hollins','Amara','Sinclair','Vogel'
  ])[1 + (demo.pick('ln:' || r.n || x.role || x.i, 0, 39))] as full_name
from demo.rooftops r
cross join lateral (
  select 'advisor'::member_role as role, i
  from generate_series(1, demo.pick('advisors:' || r.n, 3, 8)) i
  union all
  select 'manager'::member_role, i
  from generate_series(1, demo.pick('managers:' || r.n, 1, 2)) i
) x;

create table demo.groupadmin as
select o.idx, o.id as org_id,
       demo.duid('groupadmin:' || o.idx) as user_id,
       (array['Alex','Robin','Sam','Casey','Morgan','Quinn','Avery'])[1 + (o.idx % 7)]
         || ' ' ||
       (array['Whitlock','Devereaux','Ashby','Carrington','Bellamy','Stroud','Vance'])[1 + (o.idx % 7)]
         as full_name
from demo.orgs o;

-- One roster, so auth.users, app_user and membership can never disagree.
create table demo.person (user_id uuid primary key, full_name text, email text);

insert into demo.person (user_id, full_name, email)
select s.user_id, s.full_name,
       'demo.' || lower(regexp_replace(s.full_name, '[^a-zA-Z]', '', 'g'))
              || '.' || substr(s.user_id::text, 1, 8) || '@ediagd.test'
from (
  select user_id, full_name from demo.staff
  union all
  select user_id, full_name from demo.groupadmin
) s
on conflict (user_id) do nothing;

-- The auth rows. ~700 bcrypt hashes, which is the slowest part of this file.
perform demo.seed_auth_user(user_id, email, 'demo-password-2026') from demo.person;

insert into app_user (id, full_name)
select user_id, full_name from demo.person
on conflict (id) do nothing;

insert into membership (user_id, rooftop_id, role, op_code_id)
select s.user_id, s.rooftop_id, s.role,
       case when s.role = 'advisor'
            then 'D' || lpad(s.n::text, 3, '0') || lpad(s.i::text, 2, '0')
       end
from demo.staff s
on conflict (user_id, rooftop_id, role) do nothing;

insert into membership (user_id, rooftop_id, role)
select a.user_id, r.id, 'admin'
from demo.groupadmin a join demo.rooftops r on r.org_id = a.org_id
on conflict (user_id, rooftop_id, role) do nothing;


-- ---- 5.3 Schedules ---------------------------------------------------------
-- Four shapes, and ~12% of advisors with NO row at all. That last group is a
-- real state, not an oversight: the streak engine treats a missing schedule as
-- "every day is a work day", the detail card says so out loud, and it needs to
-- be on screen somewhere.

create table demo.advisor as
select
  s.user_id, s.rooftop_id, s.n, r.archetype,
  demo.rnd('sched:' || s.user_id::text)     as sched_roll,
  demo.rnd('onboard:' || s.user_id::text)   as onboard_roll,
  -- The store's character decides the ODDS; the person still rolls their own.
  -- A thriving store has the occasional middling advisor and a struggling one
  -- has a holdout doing everything right — uniform stores would make the
  -- exceptions list trivial and prove nothing.
  case r.archetype
    when 'thriving' then
      case when demo.rnd('tier:' || s.user_id::text) < 0.82 then 'high' else 'mid' end
    when 'struggling' then
      case when demo.rnd('tier:' || s.user_id::text) < 0.78 then 'low' else 'mid' end
    when 'steady' then
      case when demo.rnd('tier:' || s.user_id::text) < 0.30 then 'high'
           when demo.rnd('tier:' || s.user_id::text) < 0.85 then 'mid'
           else 'low' end
    -- 'mixed' is the case the exceptions list exists for: a good store with
    -- one or two people dragging the average down.
    else
      case when demo.rnd('tier:' || s.user_id::text) < 0.26 then 'low' else 'high' end
  end as tier
from demo.staff s
join demo.rooftops r on r.id = s.rooftop_id
where s.role = 'advisor';

insert into work_schedule (
  user_id, works_mon, works_tue, works_wed, works_thu, works_fri, works_sun,
  saturday_mode, saturday_anchor, schedule_set_at
)
select
  a.user_id,
  case when a.sched_roll >= 0.90 then false else true end,   -- Tue-Sun shape drops Monday
  true, true, true, true,
  a.sched_roll >= 0.90,                                       -- the Sunday workers
  case
    when a.sched_roll < 0.55 then 'none'
    when a.sched_roll < 0.75 then 'every'
    when a.sched_roll < 0.90 then 'alternating'
    else 'every'
  end::saturday_mode,
  -- Anchor must be a real Saturday (0025 CHECKs it). date_trunc gives Monday.
  case when a.sched_roll >= 0.75 and a.sched_roll < 0.90
       then (date_trunc('week', current_date)::date + 5) end,
  now()
from demo.advisor a
where a.onboard_roll >= 0.12
on conflict (user_id) do nothing;


-- ---- 5.4 Island Time -------------------------------------------------------
-- Two kinds, because they prove different things: absence INSIDE the window is
-- what makes a low score fair, and absence AHEAD of it is what the card's
-- upcoming line reports.

insert into island_time (id, user_id, start_date, end_date, note)
select demo.duid('island-past:' || a.user_id::text),
       a.user_id,
       current_date - demo.pick('istart:' || a.user_id::text, 6, 22),
       current_date - demo.pick('istart:' || a.user_id::text, 6, 22)
         + demo.pick('ilen:' || a.user_id::text, 2, 5),
       (array['Vacation','Family leave','Out sick','Training'])[
         1 + demo.pick('inote:' || a.user_id::text, 0, 3)]
from demo.advisor a
where demo.rnd('island:' || a.user_id::text) < 0.10
on conflict (id) do nothing;

insert into island_time (id, user_id, start_date, end_date, note)
select demo.duid('island-next:' || a.user_id::text),
       a.user_id,
       current_date + demo.pick('nstart:' || a.user_id::text, 2, 12),
       current_date + demo.pick('nstart:' || a.user_id::text, 2, 12)
         + demo.pick('nlen:' || a.user_id::text, 2, 6),
       'Booked time off'
from demo.advisor a
where demo.rnd('island2:' || a.user_id::text) < 0.06
on conflict (id) do nothing;


-- ---- 5.5 The engagement window ---------------------------------------------
-- Mon-Sat over the trailing four weeks: 24 candidate days, of which each person
-- only works the ones their schedule says. user_engagement counts DISTINCT
-- activity dates per rooftop as its denominator, which is the approximation the
-- detail card exists to correct — a Mon-Fri advisor at a store that opens
-- Saturdays can only ever reach 20/24, and the card is what explains that.

create table demo.day as
select d::date as d
from generate_series(current_date - 27, current_date, interval '1 day') d
where extract(isodow from d::date) <= 6;

-- Per-advisor behaviour. watch never exceeds login and completion never exceeds
-- watch, because you cannot watch a video you never logged in for.
create table demo.rate as
select
  a.user_id, a.rooftop_id,
  r.login_rate,
  r.login_rate * r.watch_mult                                            as watch_rate,
  r.login_rate * r.watch_mult * (0.72 + 0.28 * demo.rnd('c:' || a.user_id::text))
                                                                          as done_rate
from demo.advisor a
cross join lateral (
  select
    case a.tier
      when 'high' then 0.90 + 0.10 * demo.rnd('l:' || a.user_id::text)
      when 'mid'  then 0.60 + 0.28 * demo.rnd('l:' || a.user_id::text)
      else             0.08 + 0.30 * demo.rnd('l:' || a.user_id::text)
    end as login_rate,
    -- Watching is a fraction of logging in, never more: you can't watch a video
    -- on a day you never opened the app. The gap between the two is the whole
    -- "showed up vs did the work" story the detail card tells.
    case a.tier
      when 'high' then 0.88 + 0.12 * demo.rnd('w:' || a.user_id::text)
      when 'mid'  then 0.58 + 0.30 * demo.rnd('w:' || a.user_id::text)
      else             0.25 + 0.35 * demo.rnd('w:' || a.user_id::text)
    end as watch_mult
) r;

insert into daily_activity (user_id, rooftop_id, activity_date, logged_in, videos_watched)
select
  t.user_id, t.rooftop_id, t.d, true,
  case when demo.rnd('watch:' || t.user_id::text || ':' || t.d) < t.watch_rate
       then 1 else 0 end
from (
  select
    rt.user_id, rt.rooftop_id, dd.d, rt.watch_rate,
    -- No schedule on file means every day is a work day, matching isWorkDay().
    coalesce(demo.works_on(dd.d, w.works_mon, w.works_tue, w.works_wed,
                              w.works_thu, w.works_fri, w.works_sun,
                              w.saturday_mode::text, w.saturday_anchor), true) as worked,
    exists (select 1 from island_time it
             where it.user_id = rt.user_id and dd.d between it.start_date and it.end_date) as away,
    demo.rnd('login:' || rt.user_id::text || ':' || dd.d) as roll,
    rt.login_rate
  from demo.rate rt
  cross join demo.day dd
  left join work_schedule w on w.user_id = rt.user_id
) t
where not t.away
  -- A day off is not a dead day: people do dip in. That is what produces
  -- was_scheduled = false rows further down.
  and (case when t.worked then t.roll < t.login_rate
            else t.roll < 0.05 end)
on conflict (user_id, activity_date) do nothing;

-- Every rooftop must have a row on every candidate day, or user_engagement's
-- denominator shrinks to whatever its advisors happened to do and a dead store
-- reads as 100%. One logged_in = false row per rooftop-day fixes the
-- denominator without inventing activity: the strip ignores rows that are not
-- logged_in, and the engagement view counts the DATE, not the login.
insert into daily_activity (user_id, rooftop_id, activity_date, logged_in, videos_watched)
select distinct on (a.rooftop_id, dd.d) a.user_id, a.rooftop_id, dd.d, false, 0
from demo.advisor a
cross join demo.day dd
order by a.rooftop_id, dd.d, a.user_id
on conflict (user_id, activity_date) do nothing;


-- ---- 5.6 Completions, streaks, ledger --------------------------------------
-- daily_completion is "did the work", a stricter thing than logged_in.
-- was_scheduled is stamped from the schedule as of now, exactly as completeDay
-- would have written it; null where there is no schedule, which is the
-- genuinely-unknown case 0025 documents.

insert into daily_completion (user_id, rooftop_id, completion_date, was_scheduled)
select
  da.user_id, da.rooftop_id, da.activity_date,
  case when w.user_id is null then null
       else demo.works_on(da.activity_date, w.works_mon, w.works_tue, w.works_wed,
                             w.works_thu, w.works_fri, w.works_sun,
                             w.saturday_mode::text, w.saturday_anchor) end
from daily_activity da
join demo.rate rt on rt.user_id = da.user_id
left join work_schedule w on w.user_id = da.user_id
where da.logged_in
  and demo.rnd('done:' || da.user_id::text || ':' || da.activity_date) < rt.done_rate
on conflict (user_id, completion_date) do nothing;

-- Swell lengths follow the store's character, so a thriving rooftop's people
-- have something worth protecting and a struggling one's do not. Some sit at
-- the paddle-out cap of 5.
--
-- UPSERT, not insert: 0023's app_user_initial_paddle_out trigger already made a
-- swell row the moment the app_user row landed, so DO NOTHING would silently
-- leave all 536 advisors on 0/0/1. The update only ever touches demo advisors —
-- the select never leaves demo.advisor.
insert into swell (user_id, current_len, longest_len, last_completed_on,
                   paddle_out_available, paddle_out_last_granted)
select
  a.user_id,
  c.cur,
  c.cur + demo.pick('longest:' || a.user_id::text, 0, 60),
  (select max(dc.completion_date) from daily_completion dc where dc.user_id = a.user_id),
  demo.pick('po:' || a.user_id::text, 0, 5),
  current_date - demo.pick('pog:' || a.user_id::text, 0, 30)
from demo.advisor a
cross join lateral (
  -- Keyed off the person's tier, not the store's, so the streak agrees with the
  -- activity above it: nobody has a 120-day Swell and a blank month of dots.
  select case a.tier
    when 'high' then demo.pick('cur:' || a.user_id::text, 30, 130)
    when 'mid'  then demo.pick('cur:' || a.user_id::text, 4, 29)
    else             demo.pick('cur:' || a.user_id::text, 0, 3)
  end as cur
) c
on conflict (user_id) do update set
  current_len            = excluded.current_len,
  longest_len            = excluded.longest_len,
  last_completed_on      = excluded.last_completed_on,
  paddle_out_available   = excluded.paddle_out_available,
  paddle_out_last_granted = excluded.paddle_out_last_granted,
  updated_at             = now();

-- The ledger the balance view reads. One earn per completion, the way
-- completeDay writes it.
insert into sand_dollar_entry (id, user_id, amount, reason, created_at, note)
select
  demo.duid('sand:' || dc.user_id::text || ':' || dc.completion_date),
  dc.user_id, 10, 'daily_loop',
  dc.completion_date + time '17:30',
  'Demo seed'
from daily_completion dc
join demo.advisor a on a.user_id = dc.user_id
on conflict (id) do nothing;


-- ---- 5.7 Clean up the scratch ----------------------------------------------
-- The demo ROWS stay; the machinery that built them goes. Everything from here
-- on is queryable from the ordinary tables, so nothing needs this schema again.

-- 0028's rollup was computed when that migration ran, which on a fresh database
-- was BEFORE any of this existed. Without this the whole screen would read
-- "engagement hasn't been worked out yet" until the overnight job.
perform refresh_engagement_rollup();

raise notice 'SECTION 5: % demo rooftops, % people, % activity rows, % completions.',
  (select count(*) from rooftop where name like '[DEMO]%'),
  (select count(*) from app_user u join auth.users au on au.id = u.id
    where au.email like 'demo.%@ediagd.test'),
  (select count(*) from daily_activity da join rooftop r on r.id = da.rooftop_id
    where r.name like '[DEMO]%'),
  (select count(*) from daily_completion dc join rooftop r on r.id = dc.rooftop_id
    where r.name like '[DEMO]%');

drop schema demo cascade;

end
$demo$;
