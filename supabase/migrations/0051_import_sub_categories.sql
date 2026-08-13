-- ============================================================================
-- EDIAGD — 0051 The distinct sub-categories in an import
--
-- seedSubCategoryMaps read every staged row to work out which sub-categories an
-- import contained — 8,464 rows for April, through an API that caps a select at
-- 1,000. It therefore built auto-mapping rules from roughly the first two
-- dealers' worth of rows and silently skipped the rest, leaving sub-categories
-- unmapped that the rule file would have matched.
--
-- Third time this cap has caused a silent wrong answer in this project. The
-- pattern that keeps working: never ship a row set through the API when what
-- you want is a summary of it.
--
-- DISTINCT here is at most the number of sub-categories in the file — 82 in the
-- real one — so it cannot approach any limit however many rooftops or months
-- the import covers.
-- ============================================================================

create or replace function import_sub_categories(_import_id uuid)
returns table (sub_category text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct r.sub_category
    from dms_import_row r
   where r.import_id = _import_id
     and (
       is_platform_owner()
       or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
          = 'service_role'
     )
$$;

revoke all on function import_sub_categories(uuid) from public, anon;
grant execute on function import_sub_categories(uuid) to authenticated;

notify pgrst, 'reload schema';
