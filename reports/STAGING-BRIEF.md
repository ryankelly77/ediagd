# Preview gets its own database: ediagd-staging

Found 2 November: Vercel Preview shares Production's Supabase URL, anon key and service role key, so every Preview deploy can write to live rooftops. Ryan has created a Supabase project named `ediagd-staging`. This brief points Preview at it. Tracker row t42.

Work only in `~/ediagd-staging` (branch `staging-preview`, cut from origin/main). Never touch `~/ediagd`, `~/ediagd-ingest` or `~/ediagd-manager`; other agents own them.

**Secrets.** No key, password or connection string appears in chat, reports, commits or PR text; name them by variable only. The staging database password is in `~/.ediagd-staging.env` as `SUPABASE_DB_PASSWORD`. Get the project ref, URL and API keys from the Supabase CLI (`supabase projects list`, `supabase projects api-keys --project-ref <ref>`). If the CLI is not logged in, ask Ryan to run `npx supabase login` and wait.

## 1. Replay every migration

Apply 0001 through main's head to ediagd-staging, in order, through `db:migrate` with an explicit staging target. Production stays the default target and its backup and consent gates are unchanged; staging needs neither. Report staging's head equal to main's. A migration that will not replay on a fresh database is a defect: report it and fix it with a documented replay guard only, never by changing what an applied migration does.

## 2. Reference data, no people

Copy from production to staging the catalog every advisor is served: courses, modules, content rows with their Mux ids, quiz questions, certifications, the op code catalog, quotes, game settings. Name the exact tables in the report. Copy no users, rooftops, memberships, progress, completions, events, push tokens, DMS or repair order rows.

## 3. A test store

One org and one rooftop, "EDIAGD Test Store", with a work schedule and a mapped book so the pitch slot fills. One manager and three advisors, created with `provision:roster` against staging, at addresses Ryan controls (`ryan+staging-manager@pearanalytics.com`, `ryan+staging-1@…`, `-2`, `-3`). Password setup through the invite, the same as production.

## 4. Vercel environment

Preview points at staging: `NEXT_PUBLIC_SUPABASE_URL`, the anon key and `SUPABASE_SERVICE_ROLE_KEY`, Preview scope only, Production untouched. Then audit every other variable and make Production-only anything that reaches real people or production systems: the Slack webhooks, APNs keys, Resend, `CRON_SECRET`, any Mux write token the app server uses. Keep Mux playback signing on Preview so films play. Report a table of every variable with its scope before and after.

## 5. Supabase Auth on staging

Site URL and redirect URLs that accept this project's Preview deploys. If the CLI cannot set them, give Ryan the exact values and where they go in the dashboard, and wait.

## 6. Prove it

A Preview deploy of this branch: sign in as a staging advisor, play a morning, save the day, and the completion lands in staging. Production gains no row from it; show the count before and after.

## 7. Keep it in step

From now on a migration merged to main is applied to staging too. Either `db:migrate` does it after production succeeds, or it is a documented step in the merge routine; build the first unless there is a reason not to, and say which.

## Report

Steps 1 to 6 with their numbers, the environment table, the PR number against main (base checked by asserting it, not by printing it), and anything Ryan has to click.
