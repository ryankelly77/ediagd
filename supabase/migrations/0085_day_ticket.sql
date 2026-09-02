-- ============================================================================
-- EDIAGD — 0085 The watch ticket a completion consumed
--
-- 0070 stores the measured watch percentage. What it cannot say is WHICH
-- measurement produced it, and that is what makes a ticket single-use rather
-- than merely signed.
--
-- Two columns, one per video step, matching the shape 0070 already uses for the
-- percentages. They hold a short hash of the ticket, never the ticket itself: a
-- ticket is a credential, and a credential at rest in a table somebody can read
-- is a credential that can be replayed by whoever reads it. The hash answers
-- the only question asked of it — "has this exact ticket already been spent?"
--
-- NULL IS UNKNOWN, NOT ZERO — the same convention 0070 set for the percentages.
-- Every row written before today reads null: those completions were verified
-- under the old page-render ticket, and pretending otherwise would put a
-- fabricated audit trail under numbers a certification will later be credited
-- from.
-- ============================================================================

alter table daily_completion
  add column if not exists pitch_watch_ticket     text,
  add column if not exists lifestyle_watch_ticket text;

comment on column daily_completion.pitch_watch_ticket is
  'Hash of the watch ticket this completion spent for the pitch video. Null '
  'means unknown — no video, released by the error valve, or written before '
  '0085. See lib/watch-ticket.ts.';
comment on column daily_completion.lifestyle_watch_ticket is
  'Hash of the watch ticket this completion spent for the lifestyle video. '
  'Null means unknown. See lib/watch-ticket.ts.';

/*
 * THE LOOKUP THE SINGLE-USE CHECK MAKES.
 *
 * completeDay asks "has this user already spent this ticket?" before it writes.
 * Partial, because the overwhelming majority of rows are null and a null ticket
 * is not a ticket anybody can replay.
 */
create index if not exists daily_completion_pitch_ticket_idx
  on daily_completion(user_id, pitch_watch_ticket)
  where pitch_watch_ticket is not null;

create index if not exists daily_completion_lifestyle_ticket_idx
  on daily_completion(user_id, lifestyle_watch_ticket)
  where lifestyle_watch_ticket is not null;
