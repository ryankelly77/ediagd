# Work log

Contribution hours, recorded as the work happens.

**Rows come from two writers, and the tag tells you which.**

The **EDIAGD daily work log** scheduled task writes one set. Once a day has
finished it estimates that day's repository hours from git and from file
timestamps, and appends through `npm run log -- <date>`. Every row it writes
carries `[reconstructed]`, because an estimate from evidence is what it is.

**Ryan** writes the other set, and those rows carry no tag. They are for work
the repository cannot see (an App Store submission, a call with Mitch that
counts as development, a content pipeline run) or for his own figure on a day
where the estimate is not the one he stands behind.

**Nothing else writes a row.** No git hook, no cron inside this repository, and
no coding agent. The scheduled task lives outside the repo and calls the same
script a person does.

| marker | meaning |
|---|---|
| `[reconstructed]` | written by the daily scheduled task, estimated from git and file timestamps |
| *(no marker)* | typed by Ryan, for work the repository cannot see or his own figure for a day |

Append a row: `npm run log`
Month total: `npm run log:report -- 2026-11`
Backfill a past day: `npm run log -- 2026-11-02`

---

## How the October 2026 block was reconstructed, and what is soft about it

These rows carry `[reconstructed]` because they were **not** logged as the work
happened. They are an after-the-fact estimate and should be read as one.

**What is observed.** The dates are the days this repository received commits
between 1 and 26 October 2026, read from `git log`. The workstream and
description of each day come from that day's commit subjects. Those parts are
checkable against git and will reproduce.

**What is apportioned, and is therefore a judgement rather than a record.** The
hours. The month's total of 94 was supplied; the split across days was not. It
is weighted by each day's commit volume, held between 2 and 10 hours a day so
no day claims an implausible figure, and rounded to the half hour so the column
sums to exactly 94. **No per-day timing evidence exists behind any single
number in the hours column.**

**One discrepancy, left standing rather than smoothed over.** The supplied
figure is *17 active days*. Git shows **16** in that window, and nothing at all
on 1 October. The 94 hours are therefore spread across the 16 days that can be
evidenced, and a day is missing. The likeliest explanation is work on 1 October
that produced no commit — reading, planning, a call — which is exactly the kind
of day a log like this exists to capture and git never will. **If that day was
real, add it with `npm run log` and correct the total.** It has not been
invented here.

---

## 2026-10

**Superseded.** October's figure of record is 125.4 hours, from the [EDIAGD Contribution Record](https://claude.ai/artifact/9VfejBCQZDXaw4bFPgrCYH), not the 94 seeded here; the rows below are kept as they were.

| Date | Hours | Workstream | Description |
|---|---|---|---|
| 2026-10-02 | 5 | Corpus & Site | [reconstructed] Read-only corpus views for the site post engine; transcripts:backfill reads captions from the playback id the app serves |
| 2026-10-03 | 8 | Front Door & Library | [reconstructed] Signed-out preview of a morning; lesson library plays its films; stills:backfill; brand lockup on the hero |
| 2026-10-04 | 10 | Front Door & Library | [reconstructed] Front door films and 70vh cap; public stills bucket; db:migrate refuses off an up-to-date main; lesson library audit |
| 2026-10-05 | 10 | Trim Pipeline | [reconstructed] Measured dead air across 447 films, 254 carrying 65 minutes; trim:apply serial under a lock; 0160 library shows what it has |
| 2026-10-06 | 3.5 | Trim Pipeline | [reconstructed] trim:reconcile — a refusal is not a record; recovered cut missed its vertical |
| 2026-10-07 | 6 | Trim Pipeline | [reconstructed] 252 films cut, 64 minutes gone, zero length mismatches; verify by energy and whisper |
| 2026-10-08 | 7 | Trim Pipeline | [reconstructed] 447 verified on the rendition a phone plays; derive reads the master or refuses |
| 2026-10-09 | 8 | Trim Pipeline | [reconstructed] Last trim batch, 32 cut; one reading across 447 films; progress bar on every Certs track |
| 2026-10-10 | 2.5 | Rollcall | [reconstructed] Rollcall: the six facts, and the column that was never written |
| 2026-10-12 | 5 | Provisioning | [reconstructed] provision:roster for a whole store then invite; welcome push copy aligned to five minutes |
| 2026-10-13 | 5 | Manager Meetings | [reconstructed] Route, grant and entitlement check; Rollcall posts once at end of day |
| 2026-10-14 | 5 | Manager Meetings | [reconstructed] 17 films ingested, trimmed and published; mindset trio re-cut from local masters |
| 2026-10-15 | 2 | Push & Engagement | [reconstructed] Did the push bring them back — joined the three records, and the one that never fires |
| 2026-10-19 | 2 | Rollcall | [reconstructed] Rollcall posts on days the store is open |
| 2026-10-20 | 5 | Manager Screen | [reconstructed] Manager roster drops advisors who have left; Tiner/Pinder rulings recorded |
| 2026-10-26 | 10 | Team Screen & Launch | [reconstructed] Team screen says whether each advisor did today; videos completed today; App Store launch step 1 |

## 2026-11

| Date | Hours | Workstream | Description |
|---|---|---|---|
| 2026-11-01 | 1 | Captions & Sync | [reconstructed] Captions scan and restore script, daily flow names every outstanding leg; merged PR #79 day-gate evidence and retry |
| 2026-11-01 | 1.6 | Marketing Site | [reconstructed] ediagd-site: show week popup that takes itself off the site, pricing as one starting price instead of three tier cards, cancelling the popup is a session no; Vegas promo script; site PRs #10 and #11 |
| 2026-11-02 | 4 | Fixes & Repair Tools | [reconstructed] Quiz 404 fix, db:migrate consent, short film titles, watch ticket to store-day end, restore:day, replace:video, sync gate; PRs #80 to #88 |
| 2026-11-02 | 5.6 | Trim & Ingest | [reconstructed] One cutter (trim:apply from the disk master), November ingest with 0173 Power of Positive Language 13 lessons, run records, branch rules, pitch picker ranking; PR #89 |
| 2026-11-02 | 0.5 | Marketing Site | [reconstructed] ediagd-site: lead form and lead API changes with README notes, 9:30 to 9:58 am, not yet committed |
| 2026-11-03 | 1.8 | Ingest | [reconstructed] Merged PR #91 November ingest, finished the 30 October ingest with corrections, migration number taken at PR time |
| 2026-11-03 | 0.7 | Agent Coordination | [reconstructed] Who-owns-what rules for the coding agents: checkouts, migrations, file ownership, PR base |
| 2026-11-04 | 0.4 | Work Log | [reconstructed] Wired up npm run log and log:report, committed the work log scripts |
| 2026-11-05 | 3.1 | Fixes & Repair Tools | [reconstructed] Watch ticks that never saved: server gate matched to the player, service shelf now reports refused completions, migration 0174 restores nine lost completions, watched-rule test fixed; measured 27 clipped live films for a re-cut brief; PR #95 merged 6 November |
| 2026-11-06 | 2.9 | Fixes & Repair Tools | [reconstructed] Restored completions get their watch event (migration 0175) and the eight lessons that were never paid get paid (0176), both rehearsed against production in a rolled back transaction; PRs #95 and #96 |
| 2026-11-06 | 1.5 | Entitlement & Access | [reconstructed] The focus card counts only what the shelf can show an unentitled advisor (migration 0177), then started an entitlement parity check that runs after every migration apply; PR #97 |
| 2026-11-07 | 2.4 | Entitlement & Access | [reconstructed] Migration 0178 puts the content policy back inline after 0177 measured 5x slower on every read, keeps the definer function for the card, and adds an entitlement parity check that db:migrate runs after every push; PR #98 |
| 2026-11-07 | 0.6 | Rollcall | [reconstructed] Wrote the rollcall redesign brief for a compact Slack post, from the 6 November Beaumont post and the rollcall code |
| 2026-11-08 | 3 | Rollcall | [reconstructed] Compact rollcall post that says who did their morning and how far each advisor is, with message scenarios, a preview script and expanded acceptance checks; PR #99 |
| 2026-11-08 | 1 | Manager Screen | Managers see the EDIAGD Certified meter on the rollcall screen, with migration 0179 so managers can read their advisors completions; PR #100 merged, 0179 applied |
| 2026-11-08 | 3.6 | Rollcall | Rest of the continuous compact rollcall session, 4:12 to 10:47 pm per Ryan, on top of the 3 hour reconstructed row; PR #99 |
| 2026-11-09 | 1.7 | Manager Meetings | [reconstructed] Merged the manager meter, then re-grounded the Manager Meetings plan on main in the ediagd-manager worktree: migration 0180, the shape of 0179, the cost of 0178, the dedup key; merged main into the branch; PR #100 |
| 2026-11-09 | 1.7 | Story Review | [reconstructed] Started the good news story review queue in the ediagd-goodnews worktree: migration 0180 story review, changes to the good news story migration and lib/story.ts; from file times 7:09 to 8:51 pm, not yet committed |
| 2026-11-10 | 0.8 | Story Review | [reconstructed] Finished the good news story review queue in the ediagd-goodnews worktree: review queue, Slack notice, kickback banner, a banner that survives the advisor page early returns, and review_story kept to the platform owner; PR #103 |
| 2026-11-10 | 4.7 | Fixes & Repair Tools | [reconstructed] Valerie can watch the opener, open the quiz and be counted, the manager team diagnostic runs the right file, the roster building label put back, then traced Valerie's menus to find the module deck reading content_progress without naming its user; PRs #104, #105 and #107 |
| 2026-11-10 | 1.2 | Manager Meetings | [reconstructed] ediagd-manager worktree: merged main into the branch and started the Preview deploy write guard and the op code catalog read, from file times 2:40 to 2:58 pm, committed 11 November |
| 2026-11-10 | 1.3 | Rollcall | [reconstructed] The celebration opened below its own top and could not scroll up, fixed on its own branch (PR #106 merged 11 November), then wrote the brief to keep test accounts out of the rollcall |
| 2026-11-11 | 1.5 | Fixes & Repair Tools | [reconstructed] The loop screenshot fixture wipe stopped swallowing its refusals so the rebuild no longer crashes, and a watch ping now files under the same rooftop as its completion with a rooftop choice check; merged the celebration scroll fix; PRs #106, #108 and #109 |
| 2026-11-11 | 0.9 | Manager Meetings | [reconstructed] ediagd-manager worktree: committed the Preview deploy write guard and the op code catalog read with its acceptance script, a finding that a for all policy is a write policy, then merged main and renumbered the catalog migration to 0182 after PR #109 took 0181 |
| 2026-11-11 | 0.7 | Corpus & Site | [reconstructed] Second read-only scrub of the film transcripts for MOC, Mock and Arctic Blast, same six films as October, written to reports/moc-in-the-films.md; from file times 4:38 to 5:19 pm, not committed |
