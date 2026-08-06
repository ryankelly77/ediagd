-- ============================================================================
-- EDIAGD — 0024 Reconstruct the before → after count on old purchases
--
-- buyPaddleOut now records "Purchased (1 → 2)", but rows that predate that
-- carry nothing: 0020 cleared the old note, and the bank counts were never
-- captured in the first place. So the Sand Dollars history shows the purchase
-- without saying what it moved the bank to.
--
-- They ARE recoverable now. After 0023 every account's Paddle Back Out history
-- sums exactly to its counter, so a running total over the entries in date
-- order gives the true bank size at each point:
--     before = (running total through this row) - this row's delta
--
-- Guarded three ways: only rows still missing a note, only purchases, and only
-- for accounts whose history reconciles with swell.paddle_out_available — for
-- anyone with unexplained days the running total would be an invention, and the
-- history screen already tells them the story is incomplete.
--
-- Both ledgers get it, since they show the same fact: sand_dollar_entry (the
-- Sand Dollars history) and paddle_out_entry (Every movement), linked by
-- paddle_out_entry.ref_id.
-- ============================================================================

-- ---- 1. The Sand Dollars history ------------------------------------------
with reconciled as (
  select s.user_id
    from swell s
    left join (
      select user_id, sum(delta) as logged
        from paddle_out_entry
       group by user_id
    ) l on l.user_id = s.user_id
   where coalesce(l.logged, 0) = s.paddle_out_available
),
running as (
  select p.id,
         p.ref_id,
         p.user_id,
         p.delta,
         p.kind,
         p.note,
         sum(p.delta) over (
           partition by p.user_id
           order by p.created_at, p.id
           rows between unbounded preceding and current row
         ) as held_after
    from paddle_out_entry p
),
purchases as (
  select r.id,
         r.ref_id,
         'Purchased (' || (r.held_after - r.delta) || ' → ' || r.held_after || ')'
           as new_note
    from running r
   where r.kind = 'purchased'
     and r.user_id in (select user_id from reconciled)
)
update sand_dollar_entry t
   set note = p.new_note
  from purchases p
 where p.ref_id = t.id
   and t.reason = 'paddle_out_purchase'
   and t.note is null;

-- ---- 2. The Paddle Back Out history ---------------------------------------
with reconciled as (
  select s.user_id
    from swell s
    left join (
      select user_id, sum(delta) as logged
        from paddle_out_entry
       group by user_id
    ) l on l.user_id = s.user_id
   where coalesce(l.logged, 0) = s.paddle_out_available
),
running as (
  select p.id,
         p.user_id,
         p.delta,
         p.kind,
         p.note,
         sum(p.delta) over (
           partition by p.user_id
           order by p.created_at, p.id
           rows between unbounded preceding and current row
         ) as held_after
    from paddle_out_entry p
),
purchases as (
  select r.id,
         'Purchased (' || (r.held_after - r.delta) || ' → ' || r.held_after || ')'
           as new_note
    from running r
   where r.kind = 'purchased'
     and r.note is null
     and r.user_id in (select user_id from reconciled)
)
update paddle_out_entry t
   set note = p.new_note
  from purchases p
 where p.id = t.id;
