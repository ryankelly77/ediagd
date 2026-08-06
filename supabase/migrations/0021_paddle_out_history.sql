-- ============================================================================
-- EDIAGD — 0021 Paddle Back Out history
--
-- Until now the ONLY record of a Paddle Back Out day was the counter itself
-- (swell.paddle_out_available). A purchase left a Sand Dollar row, but the free
-- monthly allowance and the days actually spent saving a Swell left no trace at
-- all — the number simply moved. So there was nothing to show an advisor asking
-- "where did my days come from, and where did they go?".
--
-- This is an AUDIT LOG, not a second source of truth. swell.paddle_out_available
-- stays authoritative — it is what the engine reads and writes when it decides
-- whether a missed day breaks a Swell. Rebuilding the counter by summing this
-- table would invite exactly the balance/ledger drift that 0017's comment warns
-- about, so nothing does that. The UI reads the counter for "how many", and this
-- table only for "what happened".
--
-- Consequence worth knowing: history starts today. Grants and spends that
-- happened before this migration cannot be reconstructed, because nothing
-- recorded them. The history screen compares the sum of these rows against the
-- live counter and says so plainly when they disagree, rather than quietly
-- showing an incomplete story. Purchases ARE backfilled below, since the Sand
-- Dollar ledger recorded those exactly.
--
-- Writes are SERVER-ONLY, same discipline as 0012: no INSERT/UPDATE/DELETE
-- policy exists, so with RLS on, a browser holding the anon key cannot mint
-- itself grace days by writing history rows.
-- ============================================================================

create type paddle_out_kind as enum ('purchased', 'monthly_grant', 'spent');

create table paddle_out_entry (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references app_user(id) on delete cascade,
  -- +1 granted or purchased, negative when spent to cover missed days.
  delta       int not null,
  kind        paddle_out_kind not null,
  -- The completion that granted/spent it, or the Sand Dollar entry that paid.
  ref_id      uuid,
  note        text,
  created_at  timestamptz not null default now()
);
create index on paddle_out_entry(user_id, created_at);

alter table paddle_out_entry enable row level security;

-- Read your own. No write policy by design — see the note above.
create policy paddle_out_self_read on paddle_out_entry
  for select using (user_id = auth.uid());

-- ---- Backfill the purchases we can prove ----------------------------------
-- Every paddle_out_purchase row in the Sand Dollar ledger was one bought day
-- (buyPaddleOut grants exactly one per purchase), so these reconstruct exactly.
-- Guarded on not-exists so re-running this file cannot double-count.
insert into paddle_out_entry (user_id, delta, kind, ref_id, note, created_at)
select e.user_id, 1, 'purchased', e.id, e.note, e.created_at
  from sand_dollar_entry e
 where e.reason = 'paddle_out_purchase'
   and not exists (
     select 1 from paddle_out_entry p where p.ref_id = e.id and p.kind = 'purchased'
   );
