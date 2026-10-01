/* ===========================================================================
   0154 — FEEDBACK: the More-menu report, straight to the team
   ===========================================================================

   Beaumont's handout tells advisors that if something does not work they open
   More → Feedback and say what happened. This is the table that catches it,
   with enough context attached to act on without a reply.

   ---------------------------------------------------------------------------
   THE ROW IS THE RECORD; THE EMAIL AND THE SLACK POST ARE BEST EFFORT
   ---------------------------------------------------------------------------
   emailed_at and slack_posted_at are stamped only when each notification
   actually goes. Either can be null and the feedback is still captured — which
   is the point: the Resend domain may not be verified on the night this ships,
   and the handout's promise ("tell us and we'll see it") must hold regardless.
   The row and the Slack post keep that promise; the email lands once DNS clears.

   ---------------------------------------------------------------------------
   WHO MAY TOUCH IT
   ---------------------------------------------------------------------------
   An advisor may INSERT their own row (user_id = their auth id) and read NOTHING
   back — not even their own, over PostgREST. There is no select policy for the
   authenticated role, so the only read is an admin's. This is deliberate: the
   advisor writes and forgets; the team reads. The server action builds the
   context server-side and inserts as the signed-in advisor, so the insert-own
   policy is the real control rather than a convenience.

   Admins (and the platform owner) read everything, newest first.
   =========================================================================== */

create table if not exists public.feedback (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.app_user(id),
  rooftop_id      uuid references public.rooftop(id),
  body            text not null,
  /* <user_id>/<row id>.<ext> in the private `feedback` bucket, or null. */
  screenshot_path text,
  /* The provenance list from the brief: email, display name, rooftop name,
     membership role, the `from` route, store-local time, platform, shell
     version/build, user agent, deploy sha. All built server-side, never from
     the form — the advisor only ever sends body and screenshot. */
  context         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  /* Stamped when each best-effort notification actually goes. Null = did not. */
  emailed_at      timestamptz,
  slack_posted_at timestamptz,

  constraint feedback_body_len check (char_length(body) between 1 and 4000)
);

comment on table public.feedback is
  'Advisor feedback from More -> Feedback. Advisor inserts own row and reads '
  'nothing; admins read all. emailed_at/slack_posted_at are best-effort stamps '
  '- the row is the record, the notifications are not guaranteed.';

-- Newest-first is how an admin reads it.
create index if not exists feedback_created_at_idx
  on public.feedback (created_at desc);

-- Backs the per-advisor hourly rate limit: user_id = $1 and created_at >= $2.
create index if not exists feedback_user_created_idx
  on public.feedback (user_id, created_at desc);

alter table public.feedback enable row level security;
alter table public.feedback force row level security;

/* PostgREST exposes what the roles are granted; strip everything, then grant
   back only the insert the advisor needs. Reads never go through anon/
   authenticated at all — admins read through the policy below, which still
   requires the select grant, so authenticated keeps select but every row is
   gated by the admin predicate. */
revoke all on public.feedback from anon, authenticated;
grant insert, select on public.feedback to authenticated;

/* An advisor may write their own row. user_id must be their own auth id, so a
   direct PostgREST insert cannot file feedback as somebody else. */
create policy feedback_insert_own on public.feedback
  for insert to authenticated
  with check (user_id = (select auth.uid()));

/* Admins and the platform owner read all. There is deliberately NO select
   policy for a plain advisor, so an advisor reads zero rows — including their
   own — over PostgREST. */
create policy feedback_admin_read on public.feedback
  for select to authenticated
  using (
    is_platform_owner()
    or exists (
      select 1 from public.membership m
       where m.user_id = (select auth.uid())
         and m.active
         and m.role = 'admin'
    )
  );

/* ---- The screenshot bucket ----------------------------------------------
   Private. An advisor uploads to a path under their own uid; nobody reads it
   back over the API — the signed link in the email is minted by the service
   role, which bypasses these policies. */
insert into storage.buckets (id, name, public)
  values ('feedback', 'feedback', false)
  on conflict (id) do nothing;

/* Insert-own: the first path segment must be the uploader's uid, so an advisor
   cannot drop an object into anyone else's folder. */
create policy feedback_object_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'feedback'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

/* No select/update/delete policy for anon or authenticated: the bucket is read
   by the service role only. */
