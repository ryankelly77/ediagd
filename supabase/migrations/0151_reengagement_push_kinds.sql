/* ===========================================================================
   0151 — TWO NEW PUSH KINDS: return, start
   ===========================================================================

   Ryan's ruling, 1 October: streak protection stays exactly as it is, and a
   second class of push exists beside it for re-engagement — an advisor with no
   streak (new, lapsed, or onboarding-stalled) is never selected by the streak
   logic and so hears nothing. Two new kinds carry that, on the same delivery
   path.

   THE ENUM VALUES LAND IN THEIR OWN MIGRATION, ALONE. A new enum value cannot
   be used in the same transaction that adds it (Postgres refuses "unsafe use
   of new value"), and the Supabase runner applies each file in its own
   transaction. So the values are committed here and first used in 0152 —
   outbox_policy rows, push_copy(), and the generator's two new selections.

   IF IN EITHER — these are idempotent so a replay, or a prod that somehow
   already carries them, is a no-op rather than an error.
   =========================================================================== */

alter type outbox_kind add value if not exists 'return';
alter type outbox_kind add value if not exists 'start';
