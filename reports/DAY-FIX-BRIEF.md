# The day would not save, and Try again does nothing

Ryan, 30 October, on his own phone at 6:00: the item was "30 Second Walk-Around, Part 3, Steps 1 and 2, Are You Here to See Anyone" (Walk Around, 29 of 48), playing the landscape master because its vertical is stale. He tapped Finish the day and got "We couldn't save today just yet. Not finished yet, today's item still to go." Try again does nothing. Then: "these titles are way too long, don't need all of that."

This comes before everything else in flight. Saturday mornings at Beaumont start in a few hours.

## Part 1, read-only, first: why the item leg was refused

The refusal is `day.gate` in `lib/gamification/completeDay.ts` with the item leg outstanding. "Finish the day" is `disabled={gated}` in `DailyFlow.tsx`, so the client believed the watch gate was met and the server did not. Find out which, from production, for Ryan's account today: the watch gate row for that content id (`readGate`, `lib/watch-gate.ts`), whether the gate-met write was refused and why (plausibility, ticket, duration), the coverage the client sent, `content.duration_sec` against the asset's real duration, and what `buildMorning` read for the item leg.

This film was re-cut and swapped by the sync repair on 29 October (`reports/sync-recut.json`: window 14.274 to 133.274, new duration 119.02 s, vertical stale). Treat that as the first suspect, not the answer: check whether anything in the watch path is keyed to the old asset, the old duration, the vertical, or the landscape fallback, and whether a session that resumes at a shifted `position_sec` can ever reach the gate. If it is the swap, it hits every advisor whose item, pitch or Mindset film is one of the 253 swapped films, which is most of tomorrow.

Then count it: since 29 October 07:00 UTC, every completion refused at `day.gate` or `watch.*`, by advisor and film, against the same count for the week before. Report the cause in two sentences before changing anything.

## Part 2, the fix, one PR

- **The cause**, whatever Part 1 finds. Prove it with Ryan's film: watch it through as the test advisor on a phone-width browser and on the landscape fallback, and the day saves.
- **Try again.** It calls `router.refresh()`, but the error lives in client state, so nothing on screen changes; and a `day.gate` refusal can never succeed on a retry anyway. A gate refusal takes the advisor back to the unfinished step with its player and a plain line ("Finish the film to save your day"). Try again stays only for errors a retry can fix, and it clears the error and posts again.
- **Restore the days we cost.** For every advisor the cause refused, where the watch was real, restore that day through the existing admin path so no streak breaks over our bug. If there is no such path, list them and stop on that item; Ryan rules.

PR against main from current main, base checked by hand, `tsc`, `eslint`, `check:nav` clean. Merge commands in the report. This goes out tonight.

## Part 3, after Part 2 is merged: short titles

The item screen shows the track, then a 15-word title that repeats the module, then the module name again with its number. Ryan's ruling: none of that is needed. The screen becomes:

```
WALK AROUND · 29 OF 48
Are You Here to See Anyone?
```

- A `short_title` column on `content` (next free migration number), editable in admin. The full title stays for admin, search and the trim and sync scripts.
- Filled by one script, mechanically: the named part after the last comma when there is one ("Washer Fluid", "Pop the Hood", "The Repair Call"); MPI and Objections films drop the stage prefix ("Coolant Hoses", with MPI SETUP or OBJECTIONS as the eyebrow); menus become "75,000 Mile Menu, Part 4"; a film with no rule that fits keeps its full title and is listed. Mindset quotes are already short and stay.
- Used everywhere an advisor or a manager reads a film name: the morning slots, the library rows, Certs, the Rollcall screen and the 17:30 Slack post. The module-name line under the title goes.

Report a 20-row sample (before and after) and the list of films no rule fit. Second PR, same rules.

## Report

Part 1's cause and counts, the PR number and merge commands, the days restored by name. Then the Part 3 sample. Nothing else.
