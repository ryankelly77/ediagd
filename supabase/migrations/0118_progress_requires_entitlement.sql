-- ============================================================================
-- EDIAGD — 0118 Progress may only be recorded against content you can read
--
-- content_progress_self_insert checked two things: that the row belonged to the
-- caller, and that the rooftop was one of theirs. It never checked that the
-- CONTENT was readable. PostgREST is reachable with any advisor's JWT, so a
-- row could be POSTed for a film their rooftop never bought.
--
-- The application path was never the hole — completeLibraryItem re-reads the
-- item with the caller's own client before the service role writes anything,
-- and no Sand Dollars are minted by a direct insert. What changed is the
-- CONSEQUENCE: 0115 made service certifications accrue by counting
-- content_progress rows, so forged rows now mint a certification, and the
-- learning badges count the same rows.
--
-- The design law — a certification draws only on content the advisor is
-- entitled to — held by convention. This makes it hold by construction, which
-- matters now that a credential is about to carry Mitch's signature and resolve
-- at a public verify URL. A credential that can be POSTed into existence is not
-- a credential.
--
-- ---------------------------------------------------------------------------
-- IT ASKS `content` RATHER THAN RESTATING WHAT `content` WOULD SAY
-- ---------------------------------------------------------------------------
-- The check is `exists (select 1 from content c where c.id = _content_id)`,
-- evaluated as the caller. That is not a shortcut — it is the whole point.
-- RLS on `content` is what defines readable, and `content` carries THREE
-- permissive policies, not one:
--
--     content_entitled_read   published + the caller's role + the rooftop's product
--     content_admin_all       an admin, over everything including drafts
--     content_platform_all    the platform owner, over everything
--
-- Copying content_entitled_read's predicate in here would have captured the
-- first and silently dropped the other two, so an admin previewing a draft and
-- the platform owner would both have lost the ability to record progress —
-- and the copy would then drift from the original the first time either was
-- amended. Two entitlement rules that can disagree is how this class of bug
-- comes back.
-- ============================================================================

/**
 * SECURITY INVOKER, AND THAT IS THE ENTIRE CONTRACT.
 *
 * The default, stated explicitly because a well-meaning `security definer`
 * added later would make this function answer "can the OWNER read it" — which
 * is always yes — and silently restore the hole it was written to close. If
 * this function ever needs definer rights, it is the wrong function.
 */
create or replace function content_is_readable(_content_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (select 1 from content c where c.id = _content_id);
$$;

comment on function content_is_readable(uuid) is
  'True when the CALLER can read this content row under content''s own RLS. '
  'Security invoker on purpose — see 0118.';

-- ---- The insert path --------------------------------------------------------

/*
 * Rebuilt rather than amended: a policy is replaced wholesale, so the two
 * original conditions are restated here verbatim and the third is added. They
 * are, unchanged from 0010:
 *
 *   the row is yours          user_id = auth.uid()
 *   at a rooftop you're on    an active membership for content_progress.rooftop_id
 */
drop policy if exists content_progress_self_insert on content_progress;
create policy content_progress_self_insert on content_progress
  for insert
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from membership m
       where m.user_id = (select auth.uid())
         and m.rooftop_id = content_progress.rooftop_id
         and m.active
    )
    and content_is_readable(content_id)
  );

-- ---- The update path --------------------------------------------------------

/*
 * THE SAME SHAPE, AND IT IS NOT REDUNDANT.
 *
 * record_watch_progress — the RPC the video player calls on every ping — is an
 * INSERT ... ON CONFLICT DO UPDATE, and it is a SECURITY INVOKER function, so
 * RLS applies to it. Postgres checks the INSERT policy for the insert attempt
 * and the UPDATE policy for the conflict path. Closing only the insert would
 * leave the forgery one ON CONFLICT away: write a legitimate row, then update
 * its content_id to something unentitled.
 *
 * USING keeps its original ownership test and does not gain the content check.
 * The WITH CHECK is what decides the resulting row, so an update that moves a
 * row onto unreadable content is refused either way; leaving USING alone means
 * the failure is "you may not put it there" rather than "this row has vanished
 * from under you", which is the better error and the smaller behaviour change.
 */
drop policy if exists content_progress_self_update on content_progress;
create policy content_progress_self_update on content_progress
  for update
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from membership m
       where m.user_id = (select auth.uid())
         and m.rooftop_id = content_progress.rooftop_id
         and m.active
    )
    and content_is_readable(content_id)
  );

/*
 * NOTHING CHANGES FOR THE SERVICE ROLE, which is what the daily loop, the
 * library completion and the certification accrual all write with. It bypasses
 * RLS entirely. This policy governs exactly one caller: a session client
 * talking to PostgREST — the app's video player on the honest path, and the
 * forged POST on the dishonest one.
 */

notify pgrst, 'reload schema';
