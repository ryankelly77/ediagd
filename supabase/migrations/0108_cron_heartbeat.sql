-- ============================================================================
-- EDIAGD — 0108 Was it silent because nothing was due, or because nothing ran?
--
-- Ryan expected a streak saver and did not get one. The answer turned out to be
-- that nobody in the system was eligible — his own streak was 1, and the rule
-- is 2 — but establishing that took five queries, and it could not distinguish
-- the two explanations that matter:
--
--   the cron ran and correctly sent nothing
--   the cron did not run at all
--
-- Those produce IDENTICAL evidence. An empty outbox is the expected state on
-- almost every day, so absence of rows says nothing about whether the job is
-- alive. That is a bad property for the one feature whose normal output is
-- silence: it could stop working in January and nobody would notice until
-- somebody happened to ask.
--
-- So every run leaves a mark, whether or not it did anything.
-- ============================================================================

create table if not exists cron_heartbeat (
  job        text primary key,
  ran_at     timestamptz not null default now(),
  /* Whatever the job wants to say about itself — how many it queued, how many
     it sent. Free-form on purpose: the shape of a run's report should be able
     to change without a migration. */
  detail     jsonb not null default '{}'::jsonb
);

alter table cron_heartbeat enable row level security;

drop policy if exists cron_heartbeat_admin_read on cron_heartbeat;
create policy cron_heartbeat_admin_read on cron_heartbeat
  for select using (is_platform_owner());

grant select on cron_heartbeat to authenticated;

/**
 * Called at the END of a run, so a mark means the job finished rather than
 * merely started. A job that dies halfway leaves the previous timestamp, which
 * is the honest reading: the last time it completed.
 */
create or replace function note_cron_run(_job text, _detail jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into cron_heartbeat (job, ran_at, detail)
  values (_job, now(), coalesce(_detail, '{}'::jsonb))
  on conflict (job) do update set ran_at = now(), detail = excluded.detail;
$$;

revoke all on function note_cron_run(text, jsonb) from public, anon, authenticated;

notify pgrst, 'reload schema';
