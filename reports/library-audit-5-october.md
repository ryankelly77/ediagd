# The Lesson Library audit — every course and module

**Population, before the finding.** `course -> module -> content.module_id`, `status = 'published'`, `retired_at is null` — the path the Lesson Library itself walks (`my_course_progress` over `my_module_progress`). Measured on production. *films* counts `advisor_video` only, which is `gating_content_types()` and therefore the only type that can complete a module; *cues* counts every other published type in the module and gates nothing.

**Courses 45 · modules 338.** Modules: **97 have films**, **208 are cue-only**, **33 hold nothing**. Courses: **9 have films**, **33 are cue-only**, **3 hold nothing**.

## By track

| track | courses | with films | cue-only | empty | modules | films | cues |
|---|---|---|---|---|---|---|---|
| Craft | 4 | 4 | 0 | 0 | 45 | 45 | 0 |
| Foundations | 13 | 5 | 7 | 1 | 111 | 52 | 410 |
| Product Knowledge | 16 | 0 | 14 | 2 | 64 | 0 | 286 |
| Service Knowledge | 12 | 0 | 12 | 0 | 118 | 0 | 680 |

## Every course

| track | course | ladder | modules | films | cues | verdict |
|---|---|---|---|---|---|---|
| Craft | Menus | Menus · core | 9 | 9 | 0 | **has films** |
| Craft | Name Tag | Name Tag · core | 11 | 11 | 0 | **has films** |
| Craft | Lasting Impressions | Lasting Impressions · core | 13 | 13 | 0 | **has films** |
| Craft | Phones and Tones | Phones and Tones · Master | 12 | 12 | 0 | **has films** |
| Foundations | Active Delivery | — | 4 | 0 | 28 | cue-only |
| Foundations | Everyday Touchpoints | — | 2 | 0 | 0 | **empty** |
| Foundations | Goals & Goal Setting | — | 4 | 0 | 25 | cue-only |
| Foundations | Language That Sells | Power of Positive Language · core | 7 | 0 | 51 | cue-only |
| Foundations | Mindset & Philosophy | — | 13 | 0 | 103 | cue-only |
| Foundations | Objection Handling | Overcoming Objections · core | 15 | 12 | 29 | **has films** |
| Foundations | Six-Step Advanced Selling | — | 4 | 0 | 32 | cue-only |
| Foundations | Start Here | — | 5 | 0 | 25 | cue-only |
| Foundations | The 4-Step Close | Four Step Close · core | 13 | 11 | 2 | **has films** |
| Foundations | The MOC Warranty Program | Chemical Warranty · Master (inactive) | 6 | 0 | 2 | cue-only |
| Foundations | The Multi-Point Inspection | Setting up the MPI · core | 11 | 10 | 2 | **has films** |
| Foundations | The Success Cycle | Success Cycle · core | 20 | 13 | 55 | **has films** |
| Foundations | The Walk-Around | Walk Around · core | 7 | 6 | 56 | **has films** |
| Product Knowledge | Battery | — | 6 | 0 | 46 | cue-only |
| Product Knowledge | Battery & Elec | — | 2 | 0 | 10 | cue-only |
| Product Knowledge | Belts | — | 3 | 0 | 8 | cue-only |
| Product Knowledge | Belts & Hoses | — | 2 | 0 | 0 | **empty** |
| Product Knowledge | Brakes | — | 8 | 0 | 46 | cue-only |
| Product Knowledge | CAF | — | 2 | 0 | 11 | cue-only |
| Product Knowledge | EAF | — | 2 | 0 | 8 | cue-only |
| Product Knowledge | Engine & Perf | — | 4 | 0 | 0 | **empty** |
| Product Knowledge | Filters | — | 2 | 0 | 16 | cue-only |
| Product Knowledge | Fluid Exchanges | — | 2 | 0 | 16 | cue-only |
| Product Knowledge | Headlights | — | 6 | 0 | 20 | cue-only |
| Product Knowledge | Hoses | — | 7 | 0 | 23 | cue-only |
| Product Knowledge | Plugs | — | 5 | 0 | 30 | cue-only |
| Product Knowledge | Timing Belt | — | 3 | 0 | 8 | cue-only |
| Product Knowledge | Tires | — | 5 | 0 | 33 | cue-only |
| Product Knowledge | Wipers | — | 5 | 0 | 11 | cue-only |
| Service Knowledge | AC HVAC | — | 14 | 0 | 29 | cue-only |
| Service Knowledge | Brake Fluid | — | 11 | 0 | 77 | cue-only |
| Service Knowledge | Coolant | — | 9 | 0 | 60 | cue-only |
| Service Knowledge | Decarb | — | 8 | 0 | 46 | cue-only |
| Service Knowledge | Diff | — | 12 | 0 | 83 | cue-only |
| Service Knowledge | Eng Flush | — | 8 | 0 | 56 | cue-only |
| Service Knowledge | EV Hybrid | — | 12 | 0 | 26 | cue-only |
| Service Knowledge | Fuel Inj | — | 9 | 0 | 62 | cue-only |
| Service Knowledge | PSF | — | 11 | 0 | 75 | cue-only |
| Service Knowledge | Tank Add | — | 7 | 0 | 50 | cue-only |
| Service Knowledge | Throttle | — | 6 | 0 | 37 | cue-only |
| Service Knowledge | Trans | — | 11 | 0 | 79 | cue-only |

## Every module

| track | course | module | films | cues | verdict |
|---|---|---|---|---|---|
| Craft | Menus | The Maintenance Menu — the OE Approach | 1 | 0 | has films |
| Craft | Menus | The OE Approach — Severe Conditions | 1 | 0 | has films |
| Craft | Menus | The OE Approach — Lifetime Fluid | 1 | 0 | has films |
| Craft | Menus | The OE Approach — Use the Chart | 1 | 0 | has films |
| Craft | Menus | The Stagger — Why We Spread Them Out | 1 | 0 | has films |
| Craft | Menus | The OE Stagger — The Order and Why | 1 | 0 | has films |
| Craft | Menus | The OE Stagger — Running It | 1 | 0 | has films |
| Craft | Menus | Menu Wrap-Up, Part 1 | 1 | 0 | has films |
| Craft | Menus | Menu Wrap-Up, Part 2 | 1 | 0 | has films |
| Craft | Name Tag | Part 1 | 1 | 0 | has films |
| Craft | Name Tag | Part 2 | 1 | 0 | has films |
| Craft | Name Tag | Part 3 | 1 | 0 | has films |
| Craft | Name Tag | Part 4 | 1 | 0 | has films |
| Craft | Name Tag | Part 5 | 1 | 0 | has films |
| Craft | Name Tag | Part 6 | 1 | 0 | has films |
| Craft | Name Tag | Part 7 | 1 | 0 | has films |
| Craft | Name Tag | Part 8 | 1 | 0 | has films |
| Craft | Name Tag | Part 9 | 1 | 0 | has films |
| Craft | Name Tag | Part 10 | 1 | 0 | has films |
| Craft | Name Tag | Name Tag — Closer | 1 | 0 | has films |
| Craft | Lasting Impressions | Part 1 | 1 | 0 | has films |
| Craft | Lasting Impressions | Part 2 | 1 | 0 | has films |
| Craft | Lasting Impressions | Part 3 | 1 | 0 | has films |
| Craft | Lasting Impressions | Part 4 | 1 | 0 | has films |
| Craft | Lasting Impressions | Part 5 | 1 | 0 | has films |
| Craft | Lasting Impressions | Part 6 | 1 | 0 | has films |
| Craft | Lasting Impressions | Part 7 | 1 | 0 | has films |
| Craft | Lasting Impressions | Part 8 | 1 | 0 | has films |
| Craft | Lasting Impressions | Part 9 | 1 | 0 | has films |
| Craft | Lasting Impressions | Part 10 | 1 | 0 | has films |
| Craft | Lasting Impressions | Part 11 | 1 | 0 | has films |
| Craft | Lasting Impressions | Part 12 | 1 | 0 | has films |
| Craft | Lasting Impressions | Lasting Impressions — Closer | 1 | 0 | has films |
| Craft | Phones and Tones | Part 1 | 1 | 0 | has films |
| Craft | Phones and Tones | Part 2 | 1 | 0 | has films |
| Craft | Phones and Tones | Part 3 | 1 | 0 | has films |
| Craft | Phones and Tones | Part 4 | 1 | 0 | has films |
| Craft | Phones and Tones | Part 5 | 1 | 0 | has films |
| Craft | Phones and Tones | Part 6 | 1 | 0 | has films |
| Craft | Phones and Tones | Part 7 | 1 | 0 | has films |
| Craft | Phones and Tones | Part 8 | 1 | 0 | has films |
| Craft | Phones and Tones | Part 9 | 1 | 0 | has films |
| Craft | Phones and Tones | Part 10 | 1 | 0 | has films |
| Craft | Phones and Tones | Part 11 | 1 | 0 | has films |
| Craft | Phones and Tones | Part 12 | 1 | 0 | has films |
| Foundations | Active Delivery | Knowledge Notes 1 *(needs name)* | 0 | 8 | cue-only |
| Foundations | Active Delivery | Knowledge Notes 2 *(needs name)* | 0 | 8 | cue-only |
| Foundations | Active Delivery | Knowledge Notes 3 *(needs name)* | 0 | 8 | cue-only |
| Foundations | Active Delivery | Knowledge Notes 4 *(needs name)* | 0 | 4 | cue-only |
| Foundations | Everyday Touchpoints | Knowledge Notes 1 *(needs name)* | 0 | 0 | **nothing** |
| Foundations | Everyday Touchpoints | Knowledge Notes 2 *(needs name)* | 0 | 0 | **nothing** |
| Foundations | Goals & Goal Setting | Knowledge Notes 1 *(needs name)* | 0 | 8 | cue-only |
| Foundations | Goals & Goal Setting | Knowledge Notes 2 *(needs name)* | 0 | 8 | cue-only |
| Foundations | Goals & Goal Setting | Knowledge Notes 3 *(needs name)* | 0 | 7 | cue-only |
| Foundations | Goals & Goal Setting | Closing Strategies *(needs name)* | 0 | 2 | cue-only |
| Foundations | Language That Sells | Knowledge Notes 1 *(needs name)* | 0 | 8 | cue-only |
| Foundations | Language That Sells | Knowledge Notes 2 *(needs name)* | 0 | 8 | cue-only |
| Foundations | Language That Sells | Knowledge Notes 3 *(needs name)* | 0 | 8 | cue-only |
| Foundations | Language That Sells | Knowledge Notes 4 *(needs name)* | 0 | 8 | cue-only |
| Foundations | Language That Sells | Knowledge Notes 5 *(needs name)* | 0 | 8 | cue-only |
| Foundations | Language That Sells | Knowledge Notes 6 *(needs name)* | 0 | 5 | cue-only |
| Foundations | Language That Sells | Closing Strategies *(needs name)* | 0 | 6 | cue-only |
| Foundations | Mindset & Philosophy | Knowledge Notes 1 *(needs name)* | 0 | 8 | cue-only |
| Foundations | Mindset & Philosophy | Knowledge Notes 2 *(needs name)* | 0 | 8 | cue-only |
| Foundations | Mindset & Philosophy | Knowledge Notes 3 *(needs name)* | 0 | 8 | cue-only |
| Foundations | Mindset & Philosophy | Knowledge Notes 4 *(needs name)* | 0 | 8 | cue-only |
| Foundations | Mindset & Philosophy | Knowledge Notes 5 *(needs name)* | 0 | 8 | cue-only |
| Foundations | Mindset & Philosophy | Knowledge Notes 6 *(needs name)* | 0 | 8 | cue-only |
| Foundations | Mindset & Philosophy | Knowledge Notes 7 *(needs name)* | 0 | 8 | cue-only |
| Foundations | Mindset & Philosophy | Knowledge Notes 8 *(needs name)* | 0 | 8 | cue-only |
| Foundations | Mindset & Philosophy | Knowledge Notes 9 *(needs name)* | 0 | 8 | cue-only |
| Foundations | Mindset & Philosophy | Knowledge Notes 10 *(needs name)* | 0 | 8 | cue-only |
| Foundations | Mindset & Philosophy | Knowledge Notes 11 *(needs name)* | 0 | 8 | cue-only |
| Foundations | Mindset & Philosophy | Knowledge Notes 12 *(needs name)* | 0 | 7 | cue-only |
| Foundations | Mindset & Philosophy | Closing Strategies *(needs name)* | 0 | 8 | cue-only |
| Foundations | Objection Handling | Knowledge Notes 1 *(needs name)* | 1 | 8 | has films |
| Foundations | Objection Handling | Knowledge Notes 2 *(needs name)* | 1 | 8 | has films |
| Foundations | Objection Handling | Watch the video first | 1 | 0 | has films |
| Foundations | Objection Handling | Send the link before you call | 1 | 0 | has films |
| Foundations | Objection Handling | Hand them something | 1 | 0 | has films |
| Foundations | Objection Handling | We caught it in time | 1 | 0 | has films |
| Foundations | Objection Handling | The redirect and the dentist | 1 | 0 | has films |
| Foundations | Objection Handling | Information overload | 1 | 0 | has films |
| Foundations | Objection Handling | The trade-in | 1 | 0 | has films |
| Foundations | Objection Handling | Read the customer | 1 | 0 | has films |
| Foundations | Objection Handling | After the second no | 1 | 0 | has films |
| Foundations | Objection Handling | The Steer Objection | 1 | 0 | has films |
| Foundations | Objection Handling | Knowledge Notes 3 *(needs name)* | 0 | 8 | cue-only |
| Foundations | Objection Handling | Knowledge Notes 4 *(needs name)* | 0 | 3 | cue-only |
| Foundations | Objection Handling | Closing Strategies *(needs name)* | 0 | 2 | cue-only |
| Foundations | Six-Step Advanced Selling | Knowledge Notes 1 *(needs name)* | 0 | 8 | cue-only |
| Foundations | Six-Step Advanced Selling | Knowledge Notes 2 *(needs name)* | 0 | 8 | cue-only |
| Foundations | Six-Step Advanced Selling | Knowledge Notes 3 *(needs name)* | 0 | 8 | cue-only |
| Foundations | Six-Step Advanced Selling | Knowledge Notes 4 *(needs name)* | 0 | 8 | cue-only |
| Foundations | Start Here | Accountability | 0 | 4 | cue-only |
| Foundations | Start Here | Knowledge Notes 1 *(needs name)* | 0 | 8 | cue-only |
| Foundations | Start Here | Knowledge Notes 2 *(needs name)* | 0 | 1 | cue-only |
| Foundations | Start Here | Closing Strategies 1 *(needs name)* | 0 | 8 | cue-only |
| Foundations | Start Here | Closing Strategies 2 *(needs name)* | 0 | 4 | cue-only |
| Foundations | The 4-Step Close | Ends the Same Way | 1 | 0 | has films |
| Foundations | The 4-Step Close | What They Need | 1 | 0 | has films |
| Foundations | The 4-Step Close | How Much | 1 | 0 | has films |
| Foundations | The 4-Step Close | When | 1 | 0 | has films |
| Foundations | The 4-Step Close | Authorization | 1 | 0 | has films |
| Foundations | The 4-Step Close | Then Stop Talking | 1 | 0 | has films |
| Foundations | The 4-Step Close | Assume the Yes | 1 | 0 | has films |
| Foundations | The 4-Step Close | The Close in Four Places | 1 | 0 | has films |
| Foundations | The 4-Step Close | The Close You Never Have to Make | 1 | 0 | has films |
| Foundations | The 4-Step Close | After the Close | 1 | 0 | has films |
| Foundations | The 4-Step Close | Knowledge Notes 1 *(needs name)* | 0 | 1 | cue-only |
| Foundations | The 4-Step Close | Knowledge Notes 2 *(needs name)* | 0 | 1 | cue-only |
| Foundations | The 4-Step Close | Four Step Close — Closer | 1 | 0 | has films |
| Foundations | The MOC Warranty Program | Knowledge Notes 1 *(needs name)* | 0 | 0 | **nothing** |
| Foundations | The MOC Warranty Program | Knowledge Notes 2 *(needs name)* | 0 | 0 | **nothing** |
| Foundations | The MOC Warranty Program | Closing Strategies 1 *(needs name)* | 0 | 1 | cue-only |
| Foundations | The MOC Warranty Program | Closing Strategies 2 *(needs name)* | 0 | 1 | cue-only |
| Foundations | The MOC Warranty Program | Closing Strategies 3 *(needs name)* | 0 | 0 | **nothing** |
| Foundations | The MOC Warranty Program | Closing Strategies 4 *(needs name)* | 0 | 0 | **nothing** |
| Foundations | The Multi-Point Inspection | The easiest sell you'll ever make | 1 | 0 | has films |
| Foundations | The Multi-Point Inspection | The speech | 1 | 0 | has films |
| Foundations | The Multi-Point Inspection | Certified technician and completing | 1 | 0 | has films |
| Foundations | The Multi-Point Inspection | The 90-second highlight video | 1 | 0 | has films |
| Foundations | The Multi-Point Inspection | Name the favourites | 1 | 0 | has films |
| Foundations | The Multi-Point Inspection | Text it, and speed matters | 1 | 0 | has films |
| Foundations | The Multi-Point Inspection | The green approve button | 1 | 0 | has films |
| Foundations | The Multi-Point Inspection | May I give you a quick call? | 1 | 0 | has films |
| Foundations | The Multi-Point Inspection | Set up your teammate | 1 | 0 | has films |
| Foundations | The Multi-Point Inspection | Knowledge Notes *(needs name)* | 0 | 2 | cue-only |
| Foundations | The Multi-Point Inspection | Setting up the MPI — Closer | 1 | 0 | has films |
| Foundations | The Success Cycle | Not a Rut Team | 1 | 0 | has films |
| Foundations | The Success Cycle | Vocabulary That Sails | 1 | 0 | has films |
| Foundations | The Success Cycle | More Vocabulary | 1 | 0 | has films |
| Foundations | The Success Cycle | Green Yellow Red | 1 | 0 | has films |
| Foundations | The Success Cycle | The 6 Stages | 1 | 0 | has films |
| Foundations | The Success Cycle | More Staging | 1 | 0 | has films |
| Foundations | The Success Cycle | Features and Benefits | 1 | 0 | has films |
| Foundations | The Success Cycle | Anticipate the No | 1 | 0 | has films |
| Foundations | The Success Cycle | More on Overcoming Objections | 1 | 0 | has films |
| Foundations | The Success Cycle | Anatomy of the Speech | 1 | 0 | has films |
| Foundations | The Success Cycle | The Repair Call | 1 | 0 | has films |
| Foundations | The Success Cycle | Your song, Go Sing It | 1 | 0 | has films |
| Foundations | The Success Cycle | Knowledge Notes 1 *(needs name)* | 0 | 8 | cue-only |
| Foundations | The Success Cycle | Knowledge Notes 2 *(needs name)* | 0 | 8 | cue-only |
| Foundations | The Success Cycle | Knowledge Notes 3 *(needs name)* | 0 | 8 | cue-only |
| Foundations | The Success Cycle | Knowledge Notes 4 *(needs name)* | 0 | 8 | cue-only |
| Foundations | The Success Cycle | Knowledge Notes 5 *(needs name)* | 0 | 8 | cue-only |
| Foundations | The Success Cycle | Knowledge Notes 6 *(needs name)* | 0 | 8 | cue-only |
| Foundations | The Success Cycle | Knowledge Notes 7 *(needs name)* | 0 | 7 | cue-only |
| Foundations | The Success Cycle | Success Cycle — Closer | 1 | 0 | has films |
| Foundations | The Walk-Around | 1. The Walk-Around Routine | 1 | 3 | has films |
| Foundations | The Walk-Around | 2. What the Vehicle Tells You | 1 | 10 | has films |
| Foundations | The Walk-Around | 3. Reading the Customer | 1 | 8 | has films |
| Foundations | The Walk-Around | 4. Raising a Problem Well | 1 | 6 | has films |
| Foundations | The Walk-Around | 5. Tires on the Drive | 1 | 10 | has films |
| Foundations | The Walk-Around | 6. Visibility and Wipers | 1 | 8 | has films |
| Foundations | The Walk-Around | 7. The Handback | 0 | 11 | cue-only |
| Product Knowledge | Battery | Knowledge Notes 1 *(needs name)* | 0 | 8 | cue-only |
| Product Knowledge | Battery | Knowledge Notes 2 *(needs name)* | 0 | 7 | cue-only |
| Product Knowledge | Battery | Closing Strategies 1 *(needs name)* | 0 | 8 | cue-only |
| Product Knowledge | Battery | Closing Strategies 2 *(needs name)* | 0 | 8 | cue-only |
| Product Knowledge | Battery | Closing Strategies 3 *(needs name)* | 0 | 8 | cue-only |
| Product Knowledge | Battery | Closing Strategies 4 *(needs name)* | 0 | 7 | cue-only |
| Product Knowledge | Battery & Elec | Knowledge Notes *(needs name)* | 0 | 5 | cue-only |
| Product Knowledge | Battery & Elec | Closing Strategies *(needs name)* | 0 | 5 | cue-only |
| Product Knowledge | Belts | Knowledge Notes *(needs name)* | 0 | 0 | **nothing** |
| Product Knowledge | Belts | Closing Strategies 1 *(needs name)* | 0 | 5 | cue-only |
| Product Knowledge | Belts | Closing Strategies 2 *(needs name)* | 0 | 3 | cue-only |
| Product Knowledge | Belts & Hoses | Knowledge Notes *(needs name)* | 0 | 0 | **nothing** |
| Product Knowledge | Belts & Hoses | Closing Strategies *(needs name)* | 0 | 0 | **nothing** |
| Product Knowledge | Brakes | Brake Fluid Bundle | 0 | 3 | cue-only |
| Product Knowledge | Brakes | Brake Fluid Exchange Warranty | 0 | 3 | cue-only |
| Product Knowledge | Brakes | Knowledge Notes 1 *(needs name)* | 0 | 8 | cue-only |
| Product Knowledge | Brakes | Knowledge Notes 2 *(needs name)* | 0 | 6 | cue-only |
| Product Knowledge | Brakes | Closing Strategies 1 *(needs name)* | 0 | 8 | cue-only |
| Product Knowledge | Brakes | Closing Strategies 2 *(needs name)* | 0 | 8 | cue-only |
| Product Knowledge | Brakes | Closing Strategies 3 *(needs name)* | 0 | 8 | cue-only |
| Product Knowledge | Brakes | Closing Strategies 4 *(needs name)* | 0 | 2 | cue-only |
| Product Knowledge | CAF | Knowledge Notes *(needs name)* | 0 | 3 | cue-only |
| Product Knowledge | CAF | Closing Strategies *(needs name)* | 0 | 8 | cue-only |
| Product Knowledge | EAF | Knowledge Notes *(needs name)* | 0 | 3 | cue-only |
| Product Knowledge | EAF | Closing Strategies *(needs name)* | 0 | 5 | cue-only |
| Product Knowledge | Engine & Perf | Knowledge Notes 1 *(needs name)* | 0 | 0 | **nothing** |
| Product Knowledge | Engine & Perf | Knowledge Notes 2 *(needs name)* | 0 | 0 | **nothing** |
| Product Knowledge | Engine & Perf | Closing Strategies 1 *(needs name)* | 0 | 0 | **nothing** |
| Product Knowledge | Engine & Perf | Closing Strategies 2 *(needs name)* | 0 | 0 | **nothing** |
| Product Knowledge | Filters | Knowledge Notes *(needs name)* | 0 | 8 | cue-only |
| Product Knowledge | Filters | Closing Strategies *(needs name)* | 0 | 8 | cue-only |
| Product Knowledge | Fluid Exchanges | Knowledge Notes *(needs name)* | 0 | 8 | cue-only |
| Product Knowledge | Fluid Exchanges | Closing Strategies *(needs name)* | 0 | 8 | cue-only |
| Product Knowledge | Headlights | Knowledge Notes 1 *(needs name)* | 0 | 0 | **nothing** |
| Product Knowledge | Headlights | Knowledge Notes 2 *(needs name)* | 0 | 0 | **nothing** |
| Product Knowledge | Headlights | Closing Strategies 1 *(needs name)* | 0 | 4 | cue-only |
| Product Knowledge | Headlights | Closing Strategies 2 *(needs name)* | 0 | 5 | cue-only |
| Product Knowledge | Headlights | Closing Strategies 3 *(needs name)* | 0 | 6 | cue-only |
| Product Knowledge | Headlights | Closing Strategies 4 *(needs name)* | 0 | 5 | cue-only |
| Product Knowledge | Hoses | Knowledge Notes 1 *(needs name)* | 0 | 0 | **nothing** |
| Product Knowledge | Hoses | Knowledge Notes 2 *(needs name)* | 0 | 0 | **nothing** |
| Product Knowledge | Hoses | Closing Strategies 1 *(needs name)* | 0 | 4 | cue-only |
| Product Knowledge | Hoses | Closing Strategies 2 *(needs name)* | 0 | 6 | cue-only |
| Product Knowledge | Hoses | Closing Strategies 3 *(needs name)* | 0 | 7 | cue-only |
| Product Knowledge | Hoses | Closing Strategies 4 *(needs name)* | 0 | 6 | cue-only |
| Product Knowledge | Hoses | Closing Strategies 5 *(needs name)* | 0 | 0 | **nothing** |
| Product Knowledge | Plugs | Knowledge Notes 1 *(needs name)* | 0 | 8 | cue-only |
| Product Knowledge | Plugs | Knowledge Notes 2 *(needs name)* | 0 | 2 | cue-only |
| Product Knowledge | Plugs | Closing Strategies 1 *(needs name)* | 0 | 8 | cue-only |
| Product Knowledge | Plugs | Closing Strategies 2 *(needs name)* | 0 | 8 | cue-only |
| Product Knowledge | Plugs | Closing Strategies 3 *(needs name)* | 0 | 4 | cue-only |
| Product Knowledge | Timing Belt | Knowledge Notes *(needs name)* | 0 | 0 | **nothing** |
| Product Knowledge | Timing Belt | Closing Strategies 1 *(needs name)* | 0 | 4 | cue-only |
| Product Knowledge | Timing Belt | Closing Strategies 2 *(needs name)* | 0 | 4 | cue-only |
| Product Knowledge | Tires | Knowledge Notes 1 *(needs name)* | 0 | 8 | cue-only |
| Product Knowledge | Tires | Knowledge Notes 2 *(needs name)* | 0 | 6 | cue-only |
| Product Knowledge | Tires | Closing Strategies 1 *(needs name)* | 0 | 8 | cue-only |
| Product Knowledge | Tires | Closing Strategies 2 *(needs name)* | 0 | 8 | cue-only |
| Product Knowledge | Tires | Closing Strategies 3 *(needs name)* | 0 | 3 | cue-only |
| Product Knowledge | Wipers | Fall Bundle | 0 | 0 | **nothing** |
| Product Knowledge | Wipers | Show the Streak | 0 | 0 | **nothing** |
| Product Knowledge | Wipers | Knowledge Notes *(needs name)* | 0 | 0 | **nothing** |
| Product Knowledge | Wipers | Closing Strategies 1 *(needs name)* | 0 | 8 | cue-only |
| Product Knowledge | Wipers | Closing Strategies 2 *(needs name)* | 0 | 3 | cue-only |
| Service Knowledge | AC HVAC | Beat the Heat | 0 | 0 | **nothing** |
| Service Knowledge | AC HVAC | Arctic Blast | 0 | 0 | **nothing** |
| Service Knowledge | AC HVAC | Knowledge Notes 1 *(needs name)* | 0 | 0 | **nothing** |
| Service Knowledge | AC HVAC | Knowledge Notes 2 *(needs name)* | 0 | 0 | **nothing** |
| Service Knowledge | AC HVAC | Knowledge Notes 3 *(needs name)* | 0 | 0 | **nothing** |
| Service Knowledge | AC HVAC | Knowledge Notes 4 *(needs name)* | 0 | 0 | **nothing** |
| Service Knowledge | AC HVAC | Closing Strategies 1 *(needs name)* | 0 | 4 | cue-only |
| Service Knowledge | AC HVAC | Closing Strategies 2 *(needs name)* | 0 | 4 | cue-only |
| Service Knowledge | AC HVAC | Closing Strategies 3 *(needs name)* | 0 | 4 | cue-only |
| Service Knowledge | AC HVAC | Closing Strategies 4 *(needs name)* | 0 | 4 | cue-only |
| Service Knowledge | AC HVAC | Closing Strategies 5 *(needs name)* | 0 | 5 | cue-only |
| Service Knowledge | AC HVAC | Closing Strategies 6 *(needs name)* | 0 | 4 | cue-only |
| Service Knowledge | AC HVAC | Closing Strategies 7 *(needs name)* | 0 | 3 | cue-only |
| Service Knowledge | AC HVAC | Closing Strategies 8 *(needs name)* | 0 | 1 | cue-only |
| Service Knowledge | Brake Fluid | Brake Fluid Science | 0 | 5 | cue-only |
| Service Knowledge | Brake Fluid | Brake Fluid Warranty | 0 | 7 | cue-only |
| Service Knowledge | Brake Fluid | Knowledge Notes 1 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Brake Fluid | Knowledge Notes 2 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Brake Fluid | Knowledge Notes 3 *(needs name)* | 0 | 3 | cue-only |
| Service Knowledge | Brake Fluid | Closing Strategies 1 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Brake Fluid | Closing Strategies 2 *(needs name)* | 0 | 11 | cue-only |
| Service Knowledge | Brake Fluid | Closing Strategies 3 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Brake Fluid | Closing Strategies 4 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Brake Fluid | Closing Strategies 5 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Brake Fluid | Closing Strategies 6 *(needs name)* | 0 | 3 | cue-only |
| Service Knowledge | Coolant | Coolant Exchanges | 0 | 7 | cue-only |
| Service Knowledge | Coolant | Coolant Exchange Warranty | 0 | 5 | cue-only |
| Service Knowledge | Coolant | Coolant Exchange Word Track | 0 | 6 | cue-only |
| Service Knowledge | Coolant | Knowledge Notes 1 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Coolant | Knowledge Notes 2 *(needs name)* | 0 | 3 | cue-only |
| Service Knowledge | Coolant | Closing Strategies 1 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Coolant | Closing Strategies 2 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Coolant | Closing Strategies 3 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Coolant | Closing Strategies 4 *(needs name)* | 0 | 7 | cue-only |
| Service Knowledge | Decarb | Decarb Service Word Track | 0 | 4 | cue-only |
| Service Knowledge | Decarb | Decarb Product Knowledge | 0 | 3 | cue-only |
| Service Knowledge | Decarb | Knowledge Notes 1 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Decarb | Knowledge Notes 2 *(needs name)* | 0 | 1 | cue-only |
| Service Knowledge | Decarb | Closing Strategies 1 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Decarb | Closing Strategies 2 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Decarb | Closing Strategies 3 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Decarb | Closing Strategies 4 *(needs name)* | 0 | 6 | cue-only |
| Service Knowledge | Diff | Differential/Transfer Case Service Warranty | 0 | 5 | cue-only |
| Service Knowledge | Diff | Gear Oil Product Knowledge | 0 | 6 | cue-only |
| Service Knowledge | Diff | Differential Warranty | 0 | 6 | cue-only |
| Service Knowledge | Diff | Differential Mindset | 0 | 4 | cue-only |
| Service Knowledge | Diff | Knowledge Notes 1 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Diff | Knowledge Notes 2 *(needs name)* | 0 | 5 | cue-only |
| Service Knowledge | Diff | Closing Strategies 1 *(needs name)* | 0 | 7 | cue-only |
| Service Knowledge | Diff | Closing Strategies 2 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Diff | Closing Strategies 3 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Diff | Closing Strategies 4 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Diff | Closing Strategies 5 *(needs name)* | 0 | 12 | cue-only |
| Service Knowledge | Diff | Closing Strategies 6 *(needs name)* | 0 | 6 | cue-only |
| Service Knowledge | Eng Flush | Knowledge Notes 1 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Eng Flush | Knowledge Notes 2 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Eng Flush | Knowledge Notes 3 *(needs name)* | 0 | 7 | cue-only |
| Service Knowledge | Eng Flush | Closing Strategies 1 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Eng Flush | Closing Strategies 2 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Eng Flush | Closing Strategies 3 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Eng Flush | Closing Strategies 4 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Eng Flush | Closing Strategies 5 *(needs name)* | 0 | 1 | cue-only |
| Service Knowledge | EV Hybrid | Knowledge Notes 1 *(needs name)* | 0 | 0 | **nothing** |
| Service Knowledge | EV Hybrid | Knowledge Notes 2 *(needs name)* | 0 | 0 | **nothing** |
| Service Knowledge | EV Hybrid | Knowledge Notes 3 *(needs name)* | 0 | 0 | **nothing** |
| Service Knowledge | EV Hybrid | Knowledge Notes 4 *(needs name)* | 0 | 0 | **nothing** |
| Service Knowledge | EV Hybrid | Knowledge Notes 5 *(needs name)* | 0 | 0 | **nothing** |
| Service Knowledge | EV Hybrid | Closing Strategies 1 *(needs name)* | 0 | 4 | cue-only |
| Service Knowledge | EV Hybrid | Closing Strategies 2 *(needs name)* | 0 | 4 | cue-only |
| Service Knowledge | EV Hybrid | Closing Strategies 3 *(needs name)* | 0 | 4 | cue-only |
| Service Knowledge | EV Hybrid | Closing Strategies 4 *(needs name)* | 0 | 4 | cue-only |
| Service Knowledge | EV Hybrid | Closing Strategies 5 *(needs name)* | 0 | 4 | cue-only |
| Service Knowledge | EV Hybrid | Closing Strategies 6 *(needs name)* | 0 | 5 | cue-only |
| Service Knowledge | EV Hybrid | Closing Strategies 7 *(needs name)* | 0 | 1 | cue-only |
| Service Knowledge | Fuel Inj | Knowledge Notes 1 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Fuel Inj | Knowledge Notes 2 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Fuel Inj | Knowledge Notes 3 *(needs name)* | 0 | 4 | cue-only |
| Service Knowledge | Fuel Inj | Closing Strategies 1 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Fuel Inj | Closing Strategies 2 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Fuel Inj | Closing Strategies 3 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Fuel Inj | Closing Strategies 4 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Fuel Inj | Closing Strategies 5 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Fuel Inj | Closing Strategies 6 *(needs name)* | 0 | 2 | cue-only |
| Service Knowledge | PSF | Power Steering Warranty | 0 | 6 | cue-only |
| Service Knowledge | PSF | Knowledge Notes 1 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | PSF | Knowledge Notes 2 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | PSF | Knowledge Notes 3 *(needs name)* | 0 | 4 | cue-only |
| Service Knowledge | PSF | Closing Strategies 1 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | PSF | Closing Strategies 2 *(needs name)* | 0 | 7 | cue-only |
| Service Knowledge | PSF | Closing Strategies 3 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | PSF | Closing Strategies 4 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | PSF | Closing Strategies 5 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | PSF | Closing Strategies 6 *(needs name)* | 0 | 6 | cue-only |
| Service Knowledge | PSF | Closing Strategies 7 *(needs name)* | 0 | 4 | cue-only |
| Service Knowledge | Tank Add | Knowledge Notes 1 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Tank Add | Knowledge Notes 2 *(needs name)* | 0 | 7 | cue-only |
| Service Knowledge | Tank Add | Closing Strategies 1 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Tank Add | Closing Strategies 2 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Tank Add | Closing Strategies 3 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Tank Add | Closing Strategies 4 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Tank Add | Closing Strategies 5 *(needs name)* | 0 | 3 | cue-only |
| Service Knowledge | Throttle | Knowledge Notes 1 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Throttle | Knowledge Notes 2 *(needs name)* | 0 | 3 | cue-only |
| Service Knowledge | Throttle | Closing Strategies 1 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Throttle | Closing Strategies 2 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Throttle | Closing Strategies 3 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Throttle | Closing Strategies 4 *(needs name)* | 0 | 2 | cue-only |
| Service Knowledge | Trans | Chemical Warranty | 0 | 5 | cue-only |
| Service Knowledge | Trans | Knowledge Notes 1 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Trans | Knowledge Notes 2 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Trans | Knowledge Notes 3 *(needs name)* | 0 | 5 | cue-only |
| Service Knowledge | Trans | Closing Strategies 1 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Trans | Closing Strategies 2 *(needs name)* | 0 | 7 | cue-only |
| Service Knowledge | Trans | Closing Strategies 3 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Trans | Closing Strategies 4 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Trans | Closing Strategies 5 *(needs name)* | 0 | 8 | cue-only |
| Service Knowledge | Trans | Closing Strategies 6 *(needs name)* | 0 | 6 | cue-only |
| Service Knowledge | Trans | Closing Strategies 7 *(needs name)* | 0 | 8 | cue-only |

## Duplicate cue rows inside one module — measured two ways

`content.module_id` is a single FK, so a cue cannot be *attached* twice. A cue appearing twice in a deck is two **rows** sharing a `module_id`. Which rows count as the same cue depends entirely on the key, and the two keys do not agree:

| key | duplicated groups | surplus rows |
|---|---|---|
| (`module_id`, `title`) | 229 | **295** |
| (`module_id`, `title`, `body`) | 11 | **23** |

**The title-only key says 295 surplus rows. Adding the text says 23.** The difference is 272 rows that share a title with a sibling and teach something different — Start Here's module 1 holds four rows titled "Accountability" with bodies of 168, 227, 196 and 191 characters. A dedupe on title would delete them and report a cleanup. The title is the derived label; the body is what was observed.

The rows below are byte-identical in both title and body.

| track | course | module | cues | surplus |
|---|---|---|---|---|
| Foundations | The Walk-Around | 7. The Handback | 11 | **7** |
| Foundations | The Walk-Around | 2. What the Vehicle Tells You | 10 | **4** |
| Foundations | The Walk-Around | 6. Visibility and Wipers | 8 | **4** |
| Foundations | The Walk-Around | 3. Reading the Customer | 8 | **3** |
| Service Knowledge | Brake Fluid | Closing Strategies 2 | 11 | **3** |
| Foundations | The Walk-Around | 5. Tires on the Drive | 10 | **2** |

## The second route, so the two can be reconciled

Films attached to a module by `content.module_id`: **97**. Published unretired Craft films with no module: **44** (see `npm run report:hopper`, which rules on each — 6 of them are a track's entry film, so its 44 = hopper's 23 routed + 15 unrouted + 6 entry films, and that reconciliation is the proof). 

The OTHER path, `service_family_content`: **1673 distinct published rows across 14 families** (1683 distinct rows if drafts are included — the view's `family_tag` arm has no status filter, so its raw count is not a count of anything an advisor can reach). These are different populations by different routes and neither one is "the library".

