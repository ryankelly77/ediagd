/* ===========================================================================
   0149 — F3: THE "WHOSE BOOK IS THIS" DISCLOSURE REACHES THE ADVISOR
   ===========================================================================

   app/(app)/advisor/page.tsx:114-125 exists precisely to stop somebody
   reading their numbers over another person's book. It read `dms_advisor`
   directly — and `dms_advisor_read` (0046) grants select to owner, admin and
   manager only, so the disclosure rendered for the two people who could
   already see the roster and FAILED SILENTLY for the only people it protects.
   A plain advisor's RLS refusal was indistinguishable from "no roster row".

   This is the has_performance_surface() shape again — a gate keyed on a role
   that excludes the viewer it exists to protect — on a privacy surface.

   THE FIX F3 NAMES: a security definer function returning ONLY the book-owner
   display name for the caller's own mapped op_code_id. Not a wider
   dms_advisor_read policy: the roster carries linked_user_id, first_seen,
   departure columns — none of which is the advisor's to browse. One name,
   for one row, that the caller's own membership already points at.

     no advisor membership, or no op code   ->  null
     mapped, roster row exists              ->  the display name
     mapped, no roster row                  ->  null (honest: nothing to say)

   The caller (the /advisor page) compares it with the signed-in name and
   renders the disclosure when they differ — for EVERY role now, which is the
   viewer-and-label rule: name the roles that will really see it, and the
   least-privileged one is the one it was built for.
   =========================================================================== */

create or replace function my_book_owner()
  returns text
  language sql
  stable
  security definer
  set search_path = public
as $$
  select d.display_name
    from membership m
    join dms_advisor d
      on d.rooftop_id = m.rooftop_id
     and d.advisor_op_id = m.op_code_id
   where m.user_id = (select auth.uid())
     and m.active
     and m.role = 'advisor'
     and m.op_code_id is not null
   limit 1
$$;

/* authenticated may ask about THEMSELVES — auth.uid() is the only key the
   query has, so there is nothing else it can be asked about. anon gets
   nothing. */
revoke all on function my_book_owner() from public, anon;
grant execute on function my_book_owner() to authenticated;

comment on function my_book_owner is
  'The DMS display name behind the caller''s own mapped op_code_id, for the '
  '"whose book is this" disclosure on /advisor. Definer on purpose: '
  'dms_advisor_read excludes advisors, and the one safeguard against reading '
  'your figures over a colleague''s book must render for the person it '
  'protects. Returns one name for one row and nothing else — F3, 0149.';

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'my_book_owner') then
    raise exception '0149: my_book_owner missing';
  end if;
  if not has_function_privilege('authenticated', 'my_book_owner()', 'execute') then
    raise exception '0149: authenticated cannot execute my_book_owner';
  end if;
  if has_function_privilege('anon', 'my_book_owner()', 'execute') then
    raise exception '0149: anon can execute my_book_owner — too wide';
  end if;
  raise notice '0149: my_book_owner in place; advisor-callable, anon refused';
end
$$;
