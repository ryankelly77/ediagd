# Manager Meetings: what Mitch's 18 Nov library changes, and what to adjust before ingest

Written 21 Nov 2026 from three files Mitch sent: the Manager Cheat Sheet (213 meetings), the Teleprompter Library (lines only), and the When To Use and Tags workbook. Read with reports/MANAGER-MEETINGS-PLAN.md on the ediagd-manager branch.

Updated 21 Nov 2026, afternoon: Mitch answered the five mapping questions and the Bank Account question in Slack at 1:27 PM. Rulings are recorded under "The op code mapping" and item 6. Next prompt: `claude/manager-meetings-rulings-prompt.md`.

## What the library is

213 meetings in 17 topics. Sixteen are situational (Leading Yourself, Coaching and Accountability, Building and Keeping the Team, Team Culture and Morale, Monthly Rhythm and Numbers, Contests, Phones and the BDC, Language and Word Tracks, Objections and Deferred Work, Menu Attach Rate and Launches, Active Delivery, CSI and Upset Customers, Coverage Is Key, Technicians and the Shop, Standards and Process, Prospecting), 156 meetings between them. The seventeenth is Op Code Boost Meetings: 57 meetings in ten groups (Filters, Fluids, Fuel system, Belts hoses and engine, Brakes, Tires and wheels, Wipers and glass, Electrical and lighting, A/C, EV), each about one service.

Per meeting the workbook gives: Topic, Group (a length band for situational topics, a service group for boosts), Title, Status (15 New, 4 Merged, rest blank), Meeting length (Under 5, 5 to 15, 15+, or "10 minutes" for every boost), Format (Team 168, Solo manager 14, One-on-one 13, Team or one-on-one 8, Technicians 3, six other shapes), Situation tags (24 distinct, comma separated, multi-valued), Academy course (SMA course and week), the Classification line spoken on camera before Aloha ("Manager Meetings/<Topic>/<length>/<Title>"), "When to use it" (spoken on camera, matches the card word for word), and Series or set (Find the Few 4, Workstation Standards 3, Menu 1 to 4, Coaching Investment 2, ONE Word 1).

The cheat sheet gives each meeting a run sheet: When to use it, Bring, Word tracks, Run sheet with timestamps, Inspect it (boosts), Your move. That is the content a manager runs the meeting from.

The README says: no meeting numbers, no MOC references, no op codes on the sheet, Series or set is a browse filter not a play order, show When to use it on the card.

The library is not final at 213. Mitch, 21 Nov: about 100 are filmed with about 115 to go, target end of November, and he will add more manager mindset films after this series is done. Nothing downstream should assert a fixed count.

## What this changes in the plan

1. Supply. The plan assumed no manager film carries an op code until Vol 4 is filmed, so no_supply was the expected state for every rooftop. The 57 boost meetings each teach one catalog service, so once mapped the pick has real supply on day one. Fixture item 1 and the "Vol 4 is not filmed" section need rewriting; the pick's acceptance can run against the real mapping. Every boost code maps to a coachable code, so open question 2 (coachable = false) does not bite this library.

2. Identity. There are no numbers. The identity of a meeting is its Classification line, which is also the slate. Ingest identification should match the spoken line, not a filename or a take number. The 17 Bank Account films used a different slate shape and are not in this library.

3. Browse metadata the schema does not hold. content.service_family carries the topic today and listManagerTopics groups on it. Nothing holds meeting length, format, or situation tags (multi-valued). Series or set fits content.series. When to use it fits content.best_used_for. The run sheet fits content.body as markdown. New columns are a manager meetings migration: meeting_length, meeting_format, situation_tags text[] with a check against the 24 tags. Status New and Merged are not stored; everything is new to the app.

4. Family versus group. Mitch's boost group is a browse label (store it in content.subcategory). The ranking family comes from op_code → op_code_family and is a different partition: Oil Filter and Engine Oil Service rank under Oil Change while Mitch files them under Filters and Fluids; Battery and Bulbs sit under Electrical and lighting while the catalog splits Battery from Lighting. Harmless, but the screen names the family the pick ranked, so a manager may see "Oil Change" on a film filed under Filters. State it; do not reconcile the two.

5. The meeting screen (slice 6) grows. It was film, family, attach rate by advisor. It now also shows the card (When to use it) and the run sheet, because the run sheet is what the manager actually uses. Browse (/meetings) gains filters: topic, length, format, situation tag, series. Academy course is held back; it belongs to a product that does not exist yet.

6. The 17 Bank Account films. Not in the 213. Ruled 21 Nov: Mitch confirms they are still in and are separate from this series. They stay their own topic in browse, placement unchanged, never auto-picked (no op code).

## The op code mapping

57 boost meetings, 52 map cleanly to one catalog code by name. The other five were ruled on 21 Nov (Ryan asked at 11:10 AM, Mitch answered at 1:27 PM):

| Meeting | Ruling |
| --- | --- |
| Engine Cleaning Service | EFL-046 Engine Flush |
| Tank Additive | FSC-017 Fuel System Cleaner |
| Complete Fuel System Service | FSC-017 Fuel System Cleaner (not MNU-005, which is coachable = false) |
| Decarb Service | Folded into FSC-017. No new catalog code. |
| A/C Performance Treatment | ABT-054. Mitch now calls this meeting "AC Performance" to comply with the cease and desist from MOC. |

Consequences:

- FSC-017 now carries at least three boost films (Tank Additive, Complete Fuel System Service, Decarb Service), plus any of the 52 that already map to it. 0168 allows several films per code; ruling B orders them by last served.
- The A/C meeting's title changes, so its Classification line changes. The exact spoken line has to come from Mitch, since ingest matches on it.
- Open, for Ryan: the catalog still labels ABT-054 "Arctic Blast". If that name is one the cease and desist covers, the catalog label needs its own decision, because the meeting screen shows catalog names to managers. Not changed by this ruling.

Draft file: manager_meeting_op_codes_draft.csv (delivered in chat 21 Nov). With the five rows above set, it becomes data/manager_meeting_op_codes.csv on the ediagd-manager branch and seeds manager_meeting_op_code with origin = 'manifest'.

Catalog codes with no boost meeting: DPF-059, SUS-058, ACC-060, MPI-061, UCI-062, OAD-063, HYB-064 and the 13 MNU codes. Families with no supply after mapping: Accessories, Inspections, Maintenance, Suspension. Expected.

## Before ingest, in order

1. Done 21 Nov. The five mappings and the Bank Account question are ruled.
2. Manager meetings agent (prompt: `claude/manager-meetings-rulings-prompt.md`): migration for meeting_length, meeting_format, situation_tags; data/manager_meeting_op_codes.csv; a loader that reads the workbook export and the cheat sheet markdown and writes content rows (draft status, no Mux id) plus manager_meeting_op_code rows, keyed on Classification line. Local replay only. Plan revision 4 folding in the six changes above.
3. Ingest: identify-videos.ts learns the Manager Meetings slate shape and matches each clip to its content row by Classification line. Owner to be assigned; the Ingest agent's run is over.
4. Then the Drop Zone run, through /ingest. With about 100 of the films done and the rest due by end of November, expect this to run in batches.
