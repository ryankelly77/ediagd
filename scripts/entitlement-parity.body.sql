-- =============================================================================
-- entitlement parity — THE COMPARISON ITSELF
--
-- No transaction control and no \set: the caller owns both. There are exactly
-- two callers and this file is the ONE definition of the comparison:
--
--   scripts/entitlement-parity.sql       begin / \ir this / rollback.
--                                        What db:migrate and
--                                        check:entitlement-parity run.
--   the 0178 rehearsal                   applies the migration, then a
--                                        deliberate drift, then \ir this, and
--                                        asserts it RAISES.
--
-- The split exists for the second caller. A check that can only be observed
-- passing has no refusal test, and a refusal that has never been demonstrated
-- is a comment. Factoring the transaction out is what let the drift be injected
-- and the raise be seen, against the same text db:migrate executes rather than
-- a copy of it.
--
-- Read scripts/entitlement-parity.sql for WHY any of this exists — the 5x
-- measurement, the two copies, and why it must switch role.
-- =============================================================================

/*
 * `set transaction read only` belongs here and cannot be used: it forbids all
 * DDL, including CREATE TEMPORARY TABLE, and the observed side needs a table
 * that survives the role switches. Tried, refused, and recorded rather than
 * quietly dropped — so the honest statement of the guarantee is narrower:
 *
 *   this transaction ends in ROLLBACK, and the only tables it writes are
 *   TEMPORARY
 *
 * which is a property of the text below rather than something the server is
 * enforcing. Anything added here that writes a real table would persist until
 * the rollback and is the one thing to watch for in review.
 */
create temporary table _parity (
  user_id        uuid    not null,
  content_type   text    not null,
  is_owner       boolean not null,
  is_admin       boolean not null,
  entitled       boolean not null,
  expected_count bigint  not null,
  observed_count bigint,
  primary key (user_id, content_type)
);

-- ---- 1. The expected side, computed as postgres while we still are ----------
insert into _parity (user_id, content_type, is_owner, is_admin, entitled, expected_count)
select v.user_id,
       t.t::text,
       v.is_owner,
       v.is_admin,
       content_entitled_for(v.user_id, t.t) as entitled,
       case
         /* The two ALL policies carry no status filter, so they see every row
            of the type — drafts and retired included. */
         when v.is_owner or v.is_admin then
           (select count(*) from content c where c.type = t.t)
         when content_entitled_for(v.user_id, t.t) then
           (select count(*) from content c
             where c.type = t.t and c.status = 'published')
         else 0
       end as expected_count
  from (
    select m.user_id,
           coalesce((select u.is_platform_owner from app_user u where u.id = m.user_id),
                    false) as is_owner,
           bool_or(m.role = 'admin') as is_admin
      from membership m
     where m.active
     group by m.user_id
    having bool_or(m.role = 'advisor')   -- every advisor on this database
  ) v
  cross join unnest(enum_range(null::content_type)) t(t);

-- ---- 2. The observed side, read as each advisor themselves ------------------
do $$
declare
  _u        uuid;
  _n        int := 0;
begin
  for _u in select distinct user_id from _parity order by user_id loop
    /* The advisor's own session, as PostgREST would present it. `set local`
       so it is unwound with the transaction, and the role is reset before
       touching the temp table again — a reduced role cannot write to it. */
    execute format('set local request.jwt.claims = %L',
                   json_build_object('sub', _u, 'role', 'authenticated')::text);
    execute 'set local role authenticated';

    /*
     * ONE SCAN PER ADVISOR, grouped by type, rather than one per (advisor,
     * type). Six scans each would multiply a ~250 ms policy scan by six for no
     * extra information — and a check slow enough to be skipped is a check
     * nobody runs.
     *
     * A type the advisor can see nothing of simply does not come back from the
     * group by, which is why the update below is driven from _parity and
     * coalesces to 0 rather than from the result.
     */
    create temporary table _seen on commit drop as
      select c.type::text as content_type, count(*) as n from content c group by c.type;

    execute 'reset role';

    update _parity p
       set observed_count = coalesce(s.n, 0)
      from (select content_type, n from _seen) s
     where p.user_id = _u and p.content_type = s.content_type;

    update _parity p
       set observed_count = 0
     where p.user_id = _u and p.observed_count is null;

    drop table _seen;
    _n := _n + 1;
  end loop;

  raise notice 'entitlement parity: % advisors read as themselves', _n;
end $$;

-- ---- 3. The verdict ---------------------------------------------------------
do $$
declare
  _advisors int;
  _pairs    int;
  _unread   int;
  _any_rows bigint;
  _bad      int;
  _detail   text;
begin
  select count(distinct user_id), count(*) into _advisors, _pairs from _parity;
  select count(*) into _unread from _parity where observed_count is null;
  select coalesce(max(observed_count), 0) into _any_rows from _parity;

  /* A check that checked nothing is not a check. */
  if _advisors = 0 then
    raise exception
      'entitlement parity: no advisors on this database, so nothing was '
      'compared. Refusing to report parity it did not measure.';
  end if;

  if _unread > 0 then
    raise exception
      'entitlement parity: % of % pairs were never read — the observed side did '
      'not run for every advisor', _unread, _pairs;
  end if;

  /* ...and neither is a check that would pass on a policy refusing everybody. */
  if _any_rows = 0 then
    raise exception
      'entitlement parity: every advisor reads zero rows of every content type. '
      'That satisfies the comparison and means the policy is refusing the whole '
      'catalog — refusing rather than calling it parity.';
  end if;

  select count(*),
         string_agg(format('%s/%s: policy let through %s, content_entitled_for '
                           'implies %s (entitled=%s, admin=%s, owner=%s)',
                           p.user_id, p.content_type, p.observed_count,
                           p.expected_count, p.entitled, p.is_admin, p.is_owner),
                    E'\n             ')
    into _bad, _detail
    from _parity p
   where p.observed_count <> p.expected_count;

  if _bad > 0 then
    raise exception
      E'entitlement parity: % of % (advisor, content_type) pairs disagree.\n'
       '             The RLS policy on `content` and content_entitled_for have '
       'drifted apart.\n             %', _bad, _pairs, _detail;
  end if;

  raise notice
    'entitlement parity: % advisors x % content types = % pairs, all agree',
    _advisors, _pairs / _advisors, _pairs;
end $$;

