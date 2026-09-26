/* ===========================================================================
   0133 — TWO VIEWS OF A CUSTOMER'S BUSINESS DATA WERE READABLE BY anon
   ===========================================================================

   Found while diffing a local replay against production. Both run as their owner
   — `security_invoker` is unset, so RLS does not apply — and both carry the
   default `grant all ... to anon` that Supabase applies to everything in
   `public`. Together that means an unauthenticated caller holding only the
   publishable anon key could read them over PostgREST. Confirmed by calling
   them that way:

     dealer_op_code_volume        1,846 rows
       dealer_id, op_code, ros, labor, store_count, description
     dealer_sub_category_volume      86 rows
       dealer_id, sub_category, ros, labor, store_count

   That is repair-order counts and labour dollars per op code and per
   sub-category, attributable to a dealer id. It is the customer's commercial
   data, not ours, and it is row-level rather than aggregate.

   ---------------------------------------------------------------------------
   WHY REVOKE RATHER THAN security_invoker = on
   ---------------------------------------------------------------------------

   Turning these into invoker views would make RLS apply, which sounds like the
   tidier fix. It is the wrong one here: both are read by the mapping screens
   through a definer path precisely so an admin can see across rooftops, and
   flipping them would change what those screens return. The grant is the defect,
   not the security model — `anon` has no business reading either, while
   `authenticated` and `service_role` are how the product reaches them.

   Compare `public_content_stats`, which stays as it is: three integers about the
   size of OUR library, feeding a marketing mockup held outside the repository
   whose pricing section has `data-stat` hooks for films, cues and tracks. An
   aggregate about ourselves granted to anon is a decision; a customer's
   row-level figures granted to anon is not.

   ---------------------------------------------------------------------------
   THE FOUR THAT WERE CHECKED AND LEFT ALONE
   ---------------------------------------------------------------------------

     family_pitch_supply        9 rows  — our own film counts per family
     service_family_cue_count  14 rows  — our own cue counts per family
     public_content_stats       1 row   — three integers about our library
     quiz_question_public      28 rows  — questions and all four options, and
                                          NO `correct` column, so no answer key
                                          leaks. Mitch's question text is public,
                                          which is a product question rather than
                                          a security one, and it is on the list.

   Revoking a grant that no consumer uses cannot break anything; if something
   does break, we learn that safely and the inverse is one `grant select`.
   =========================================================================== */

revoke all on public.dealer_op_code_volume      from anon;
revoke all on public.dealer_sub_category_volume from anon;

do $$
declare
  _left int;
begin
  select count(*) into _left
    from information_schema.role_table_grants
   where grantee = 'anon'
     and table_schema = 'public'
     and table_name in ('dealer_op_code_volume', 'dealer_sub_category_volume');

  if _left <> 0 then
    raise exception '0133: anon still holds % grant(s) on the dealer volume views', _left;
  end if;

  /*
   * AND THE PRODUCT MUST STILL REACH THEM. Revoking the wrong role would be a
   * quieter failure than the disclosure — the mapping screens would return empty
   * and look like "no data" rather than "no permission".
   */
  select count(*) into _left
    from information_schema.role_table_grants
   where grantee in ('authenticated', 'service_role')
     and table_schema = 'public'
     and table_name in ('dealer_op_code_volume', 'dealer_sub_category_volume')
     and privilege_type = 'SELECT';

  if _left < 2 then
    raise exception
      '0133: authenticated/service_role can no longer SELECT the dealer volume views (% grant(s)) — the revoke was too broad',
      _left;
  end if;

  raise notice '0133: anon revoked on both dealer volume views; authenticated and service_role retain SELECT';
end
$$;
