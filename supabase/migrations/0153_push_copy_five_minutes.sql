/* ===========================================================================
   0153 — "three minutes" becomes "five minutes" in the push copy
   ===========================================================================

   The product's own measurement puts the morning at about five minutes, so the
   in-app copy was corrected in the screens PR. push_copy() is the other place
   the number is written — three strings reach a lock screen through it — and
   this brings them into step.

   ---------------------------------------------------------------------------
   WHAT CHANGES, EXACTLY THREE STRINGS
   ---------------------------------------------------------------------------
     daily_numbers    body   "Take three minutes…"            -> "Take five minutes…"
     streak_keeper    body   "It's just 3 minutes…"           -> "It's just 5 minutes…"
     streak_last_call title  "Don't forget your 3 minutes…"   -> "Don't forget your 5 minutes…"

   Everything else is restated verbatim from 0152. The function is defined by
   create-or-replace over the WHOLE table, not a patch, because a VALUES list
   cannot be edited in place — so return and start are carried across unchanged,
   including start's body, which still says "three minutes". That line was not
   in scope for this change and is left for a separate decision rather than
   altered by a sweep that was only asked to touch the ritual's stated length.

   KEEP IN STEP WITH TypeScript. lib/notifications/push-copy.ts holds the mirror
   of these strings and is edited in the same PR; `npm run preview:push` asserts
   the two agree, so a drift here fails loudly rather than shipping.

   No data is rewritten. Outbox rows already generated carry the copy that was
   live when they were written; this only changes what the next send says. */

create or replace function push_copy(_kind outbox_kind)
returns table (title text, body text)
language sql
immutable
as $$
  select c.title, c.body from (values
    ('daily_numbers',    'Aloha — yesterday''s numbers are in',
                         'Take five minutes and see where you landed.'),
    ('eddies_pick',      'Eddie''s Pick is ready',
                         '{family} is your biggest opportunity today. Here''s the word track.'),
    ('personal_best',    'That''s a personal best',
                         'Your best month yet. Take the win — you earned it.'),
    ('streak_keeper',    'Keep your Swell going!',
                         'It''s just 5 minutes. Now is a good moment.'),
    ('streak_last_call', 'Don''t forget your 5 minutes at EDIAGD!',
                         'Keep that Swell going to {days_next} days!'),
    ('manager_digest',   'Your team''s week',
                         'A look at how your {n} advisors finished the week.'),
    /* RETURN — names what is waiting, never the miss. {family} is the advisor's
       locked pitch family, the same row the morning's pitch slot reads; it
       falls back to a family-less line when there is no assignment. */
    ('return',           'Your Swell is here when you are',
                         '{family} is up today. About five minutes.'),
    /* START — the first thing EDIAGD ever says to them. What the morning is,
       not that they are behind. Body left as 0152 wrote it; see the header. */
    ('start',            'Welcome to EDIAGD',
                         'Your first morning is three minutes — a mindset video and one idea for the drive.')
  ) as c(kind, title, body)
  where c.kind = _kind::text
$$;
