-- ============================================================================
-- EDIAGD — 0083 The words survive being replaced
--
-- content_version has always been a VIDEO-TAKE table: mux_asset_id,
-- mux_playback_id, vertical_playback_id, source_filename. It has no title, no
-- body, no detail. 0062's comment on content.version — "Which take is live.
-- History lives in content_version" — is true for video and false for text, and
-- both text writers behaved as though it were true for both:
--
--   saveDetail()                  updates title, voice, body in place
--   scripts/import-knowledge.ts   updates title, body, detail in place
--
-- So Mitch pasting a revision over a published cue and pressing Save destroyed
-- the only copy. There is no undo in the UI, no version row, and no audit table
-- to recover from. restore-cues.ts exists because the master workbook did NOT
-- always hold the words either.
--
-- Every other content-loss path in the Scope 3 review is unrecoverable only
-- because this table did not exist. It goes first for that reason.
--
-- ---------------------------------------------------------------------------
-- A TRIGGER, NOT A HABIT
-- ---------------------------------------------------------------------------
-- The obvious fix is "make the two writers save a version first". That is the
-- fix that works until the third writer — and there will be a third, because
-- content is edited by a screen, an importer, a repair script and whatever the
-- LMS needs next. A BEFORE UPDATE trigger cannot be forgotten by code that has
-- not been written yet.
--
-- IS DISTINCT FROM on the three text columns, so publishing, retiring, tagging
-- an op code, linking an artifact or writing a Mux id versions nothing. Only
-- the words.
-- ============================================================================

create table if not exists content_text_version (
  id           uuid primary key default gen_random_uuid(),
  content_id   uuid not null references content(id) on delete cascade,
  /* Per content row, 1-based, oldest first. Assigned by the trigger from the
     count already stored, so the numbers a person reads are stable. */
  seq          int  not null,
  /* The values as they were BEFORE the update that displaced them. */
  title        text,
  body         text,
  detail       text,
  /* Which of the three actually moved — so a reader can tell a body rewrite
     from a title fix without diffing, and so the UI can say which. */
  title_changed  boolean not null default false,
  body_changed   boolean not null default false,
  detail_changed boolean not null default false,
  changed_at   timestamptz not null default now(),
  /* NULL for the importer, the repair scripts and anything else running as the
     service role — auth.uid() is null there, and recording a fabricated author
     would be worse than recording none. */
  changed_by   uuid references app_user(id),
  unique (content_id, seq)
);

create index if not exists content_text_version_content_idx
  on content_text_version(content_id, seq desc);

alter table content_text_version enable row level security;

/* Same power as editing the content itself, matching content_version (0062). */
drop policy if exists content_text_version_admin on content_text_version;
create policy content_text_version_admin on content_text_version
  for all
  using (
    (select is_platform_owner())
    or exists (select 1 from membership m
                where m.user_id = (select auth.uid()) and m.active and m.role = 'admin')
  )
  with check (
    (select is_platform_owner())
    or exists (select 1 from membership m
                where m.user_id = (select auth.uid()) and m.active and m.role = 'admin')
  );

comment on table content_text_version is
  'The previous words. Written by a BEFORE UPDATE trigger on content whenever '
  'title, body or detail actually change, so no writer can skip it. See 0083.';


create or replace function content_keep_previous_text()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _t boolean := new.title  is distinct from old.title;
  _b boolean := new.body   is distinct from old.body;
  _d boolean := new.detail is distinct from old.detail;
begin
  if not (_t or _b or _d) then
    return new;
  end if;

  insert into content_text_version (
    content_id, seq, title, body, detail,
    title_changed, body_changed, detail_changed, changed_by)
  values (
    old.id,
    coalesce((select max(v.seq) from content_text_version v where v.content_id = old.id), 0) + 1,
    old.title, old.body, old.detail,
    _t, _b, _d,
    auth.uid()
  );

  return new;
end $$;

drop trigger if exists content_keeps_its_words on content;
create trigger content_keeps_its_words
  before update on content
  for each row execute function content_keep_previous_text();

comment on function content_keep_previous_text() is
  'SECURITY DEFINER so a write by any role — the admin''s session, the service '
  'role, a script — lands a version row. The trigger is the backstop; a writer '
  'that could bypass it would defeat the point.';
