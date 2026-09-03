-- ============================================================================
-- EDIAGD — 0091 The technician track, taxonomy only
--
-- The review's finding 10: a provisioned technician sees an empty app and no
-- error. Every pool the daily loop draws from is advisor-gated, so the screens
-- render, find nothing, and say nothing. This makes the emptiness deliberate
-- and gives Mitch's first tech video somewhere to land.
--
-- TAXONOMY AND ACCESS ONLY. No tech measurement, no tech certification, no
-- pricing. Those are decisions nobody has made yet, and a schema that guesses
-- at them is a schema the real decision has to fight.
--
-- ---------------------------------------------------------------------------
-- A CONTENT TYPE, NOT A COLLECTION RULE
-- ---------------------------------------------------------------------------
-- The brief left this open. The answer is forced by what the entitlement system
-- actually is: content_entitled_read (0034) resolves
--
--     m.role = any (roles_for_content_type(content.type))
--     and rooftop_has_product(m.rooftop_id, product_for_content_type(content.type))
--
-- Both functions take a content_type. `collection` is a SHELF — a display
-- grouping introduced by 0062 — and no policy has ever consulted it. Gating on
-- it would mean a second, parallel access mechanism that the existing one knows
-- nothing about, and the first person to file a tech video under the wrong
-- collection would be publishing advisor content to technicians.
--
-- So: type 'technician_video' carries the entitlement, collection 'Technician
-- Training' carries the shelf. Same division every other content type uses.
--
-- 0034's joe_the_pro ruling is untouched: still advisor + manager, still
-- advisor education rather than technician training. That was the exact
-- question this task could have got wrong.
-- ============================================================================

-- ---- 1. Who may read what --------------------------------------------------

/*
 * QUOTES WERE ADVISOR-ONLY, AND THAT IS A BUG THIS TASK UNCOVERED.
 *
 * The brief said "quotes aren't role-gated today, confirm that's safe". They
 * are gated: 'quote' falls through to the else branch and resolves to
 * {advisor}, which was checked against production rather than read off the
 * page. So a technician-only session reads ZERO quotes, and the "slimmed daily
 * with a Life quote" would have been a slimmed daily with nothing in it — the
 * empty-app finding again, one layer down.
 *
 * Widened to technician. A Life quote is mindset content about turning up and
 * doing the work; there is nothing advisor-specific in it, and a technician
 * being shown one is the whole point of giving them a day at all.
 *
 * MANAGERS ARE DELIBERATELY NOT ADDED. They cannot read quotes today either,
 * and that may well also be wrong — but it is a separate question, nobody asked
 * it, and widening access to a role while nobody is looking is how an
 * entitlement system stops meaning anything.
 */
create or replace function roles_for_content_type(t content_type)
returns member_role[]
language sql
immutable
as $$
  select case t
    when 'manager_video'    then array['manager']::member_role[]
    -- 0034: advisors AND managers. Advisor education, not technician training.
    when 'joe_the_pro'      then array['advisor', 'manager']::member_role[]
    -- 0091: the technician track. Technicians only — an advisor has no reason
    -- to be served torque specs in their three minutes.
    when 'technician_video' then array['technician']::member_role[]
    -- 0091: mindset content is not advisor-specific. See the note above.
    when 'quote'            then array['advisor', 'technician']::member_role[]
    else array['advisor']::member_role[]   -- cue + advisor_video
  end
$$;

-- The primary consumer, kept in step so the two never contradict each other.
create or replace function role_for_content_type(t content_type)
returns member_role language sql immutable as $$
  select case t
    when 'manager_video'    then 'manager'::member_role
    when 'joe_the_pro'      then 'advisor'::member_role
    when 'technician_video' then 'technician'::member_role
    else 'advisor'::member_role
  end
$$;

/*
 * NO NEW PRODUCT KEY, ON PURPOSE.
 *
 * The brief says build no pricing or packaging mechanics, and a product_key is
 * exactly that — it is the SKU a rooftop buys. Inventing 'technician_training'
 * would also break the acceptance on contact: rooftop_has_product() would find
 * no rooftop owning it, so every technician video would be unreadable by every
 * technician, and the failure would look like an empty shelf rather than a
 * missing subscription.
 *
 * So it rides on advisor_base — the product every customer already has — which
 * makes the gate "is this rooftop a customer". That is a PLACEHOLDER and is
 * written down as one. When Mitch decides how the add-on is sold, this one CASE
 * arm changes and nothing else does.
 */
create or replace function product_for_content_type(t content_type)
returns product_key language sql immutable as $$
  select case t
    when 'manager_video' then 'manager_meetings'::product_key
    when 'joe_the_pro'   then 'joe_the_pro'::product_key
    -- 0091 placeholder — see the note above. Not a pricing decision.
    else 'advisor_base'::product_key   -- cue + advisor_video + quote + technician_video
  end
$$;

-- ---- 2. The ingest alias, as a row rather than a branch --------------------

/*
 * TECH -> Technician Training.
 *
 * scripts/ingest-videos.ts has carried its routing table in code since it was
 * written, which was right when six collections were the whole world. A seventh
 * arriving as a code change means Mitch's first tech video cannot be filed
 * until somebody deploys — so the route is a row, and the importer reads
 * confirmed rows and merges them over the built-in table.
 *
 * Confirmed, not proposed: Ryan named this collection in the task. A proposed
 * alias is for a guess awaiting an answer, and this is the answer.
 */
insert into mapping_alias (kind, alias, canonical, confirmed, note) values
  ('collection', 'TECH', 'Technician Training', true,
   'Drop Zone filename prefix. Routes to placement technician_daily and content '
   'type technician_video. See 0091.')
on conflict (kind, alias) do update
  set canonical = excluded.canonical,
      confirmed = excluded.confirmed,
      note      = excluded.note,
      updated_at = now();

comment on function roles_for_content_type(content_type) is
  'Which member roles may consume a content type, given the rooftop owns its '
  'product. The access rule in content_entitled_read. Collection is a shelf and '
  'is deliberately not consulted here — see 0091.';
