# The 17:30 Rollcall post reads like a note from a manager

Ryan, 26 October, on the post as it stands: "Some of it I don't get. pw? What videos did they watch today? Maybe a status on a track?"

## What is wrong with it

It is the Rollcall table flattened into prose: abbreviations (`pw`), launch-week dates that will never matter again (`pw 12 Oct · onboarded 12 Oct`), counters nobody asked for (`Certs 13, tracks 8, 9 outside the morning`), a "new since last post" list that repeats the line above it, a sentence about device registration that reads as an error, and an internal account (Test Advisor) in a store's roll call. It never says the two things a manager wants: what did each person watch today, and where do they stand on their tracks.

## The post, rewritten

Same cron, same webhook, same env. One message, in this shape, every word plain:

```
EDIAGD Rollcall · Doggett Ford of Beaumont · Monday 26 October

8 on the app · 5 did their morning today · 3 did not · 0 can get reminders yet
6 advisors in the DMS still have no account: <names>

Did their morning
• Valerie Patterson · 10 days running · watched Menus Part 3, Tires on the Drive, 25,000 Mile Menu · Walk Around 5 of 12, Menus 3 of 10 · iPhone
• Austin Abate · 8 days · watched Raising a Problem Well, 30,000 Mile Menu · Walk Around 8 of 12 · iPhone
• Destiny Booker · first morning · watched The Walk-Around Routine, 5,000 Mile Menu · Walk Around 1 of 12 · web
• Konner Upshaw · 4 days · watched … · Walk Around 2 of 12 · iPhone
• Matthew Reck · 6 days · watched … · manager · iPhone

Did not
• Heather Sztaba · last morning Thursday · Walk Around 3 of 12 · iPhone
• Amanda Tiner · last morning 19 October · nothing started · web

Not yet signed in
• (none today)
```

Rules behind each piece:

- **Sections, not a flat list.** Did their morning, Did not, Not yet signed in. Inside a section, the longest run first. Empty sections are omitted, except "Did not" when it is empty, which reads "Everyone did their morning."
- **Days running** is the Swell length the app already shows the advisor (`current_len` from the streak logic), so the post and the phone agree. "first morning" on the day it is 1.
- **Watched today** is the titles of the films that person finished today, morning and library alike: `content_progress` completed today (all three sources) joined to the content title, reference menu films shortened to their menu name ("25,000 Mile Menu"). Up to four titles, then "and N more." Mindset quote films are included; cue decks are not films and are not listed.
- **Track status** is the same numbers the Certs page bars show (`gatingDone` of `gatingModules` per core track, `lib/certifications.ts`), listed for every track the person has started, "earned" once held, "nothing started" when none. A manager row says "manager" instead when the person has no advisor track activity.
- **Device** is one word at the end: iPhone, web, or "no reminders yet" is not a per-person phrase; the store line carries the count of people who can receive pushes. When a person has a device token the word is "iPhone, reminders on."
- **Last morning** on the Did not rows: weekday name within the last six days, else the date.
- **No launch-week facts.** Password set, onboarded, first sign-in dates and the "new since last post" list are gone from Slack; they stay on the Rollcall screen for anyone who wants them.
- **Internal accounts** (Test Advisor, platform owners, anyone flagged `--do-not-delete`) never appear in a store post.
- **The DMS line** names the advisors the DMS measures who have no account, so a manager knows who to ask; it is dropped when the count is zero.
- **No emoji, no abbreviations, no arrows.** Names as the app shows them.

## The Rollcall screen

Gains two columns so the screen and the post agree: Watched today (titles, same rule) and Tracks (same rule). Nothing removed.

## Prove it

Render the post for Beaumont from production data for today and for a day with no completions; paste both. Confirm the title join resolves every film completed in the last seven days at Beaumont (no blank titles), that Test Advisor is absent, and that the Slack message stays under the single-message limit at 20 advisors (truncate "watched" first if it does not). `accept:rollcall` extended for the three rules that can be wrong silently: section placement, days running equal to the phone's Swell, track numbers equal to the Certs page. `tsc`, `eslint`, `check:nav` clean. No migration unless a view is needed for the title join; say so if it is.

## Report

The two rendered posts, the Rollcall screenshot at phone width, and any film whose title could not be resolved. PR against main from current main, base checked by hand.
