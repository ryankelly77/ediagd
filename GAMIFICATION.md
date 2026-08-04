# EDIAGD Gamification Spec

The gamification system, as designed. Source of truth for the streak, points, badges, and voice. Derived from Brand Book v2.0 (section 13.1) plus product decisions made during the build. Where a product decision extends or overrides the brand book, it's marked **[decision]**.

Guiding principle, straight from the brand book: **celebrate up, never punish down. The competition is yesterday, never your teammate.** Gold is reserved for real milestones — *if every ping glows gold, none of them do.*

---

## 1. The Swell (streaks)

A **Swell** is a run of consecutive good days. It's the heart of the system — the counter *is* the win.

- **What counts as a day:** **[decision]** completing the **daily loop** — acknowledging the quote-of-the-day *and* engaging the coaching cue/video. Logging in alone does **not** build a Swell. "Did the work," not "showed up."
- **Visual:** a rising sun in Sunrise Gold. Never a flame, never a lightning bolt. This is the one place gold appears daily, because a kept streak is the win.
- **Milestones:** 7-Day, 30-Day, 90-Day, 365-Day ("A Year of Good Days").

### Paddle Back Out (grace days)

Life happens; the ocean doesn't shame anyone for missing a day.

- **[decision]** Earn **1 per month**, accumulate up to a cap (**default 5**, admin-editable).
- **[decision]** **Auto-spent** when a day is missed — the user isn't in the app to tap when they've already missed, so protection has to be automatic (the model Duolingo's Streak Freeze uses).
- A missed day covered by a Paddle Back Out keeps the Swell alive. When one is spent, the message is gentle and welcoming: *"Paddled back out — your Swell's still rolling. Mahalo for coming back."*
- A genuinely broken Swell (no grace left) is **never shown in red, never scolded.** The message is always: *today is a good day to start a new one.*
- **[future]** "Island Time" — a pre-declared vacation pause that suspends the Swell without spending grace days. Phase 2; the accumulating auto-spend covers most cases for alpha.

---

## 2. Sand Dollars (points)

The platform's currency. A **ledger** — every earn and spend is a row, so balances are always auditable and the Swag Shack can spend against real history (never a mutable integer).

**[decision]** All amounts are **admin-editable** via `game_settings` (no code deploy to retune the economy). Defaults:

| Event | Sand Dollars |
|---|---|
| Daily loop complete | +10 |
| 7-Day Swell | +50 |
| 30-Day Swell | +250 |
| 90-Day Swell | +250 |
| Badge earned | +100 |
| Certification | +500 |

Earned, never bought. Spent later at the **Swag Shack** for real EDIAGD gear — *the gear can't be bought, only earned.*

---

## 3. Badges

Built like the master mark: a circle, a dotted inner ring, one motif from the brand's world (sun, wave, palm), flat palette colors. **Never metallic gradients, never cartoon trophies, never red.** The tier is carried by the **ring color** (seafoam → gold).

| Badge | Earned for | Ring |
|---|---|---|
| First Light | First course completed | seafoam |
| 7-Day Swell | One week of good days | seafoam |
| 30-Day Swell | A month of good days | gold |
| 90-Day Swell | A season of good days | gold |
| Big Wave | Certification earned | gold |

Tier names (ring progression): **First Light → Dawn Patrol → Golden Hour → Big Wave.**

---

## 3.5 The daily reset (what makes it "daily")

**[decision]** Daily state is **date-driven, not session-driven** — login and logout are irrelevant. Everything (today's quote, Eddie's Pick, whether the loop is done, the streak) is keyed to a **calendar date**.

- **Whose day:** the **rooftop's timezone** (`rooftop.timezone`, default `America/Chicago`). The whole store shares one "today," which keeps manager/admin "who trained today" views coherent.
- **Boundary:** midnight, rooftop-local. `rooftop_today(rooftop_id)` computes it server-side.
- **"Have I completed today?"** = does a `daily_completion` row exist for `rooftop_today()`? Not "did I log in this session."
- **New-day detection:** the app re-checks the date on **focus and navigation** (not just login), so a user who leaves the app open overnight still gets the fresh day's flow when they next interact. Solves the "leave it open forever" hole — an idle open app completes nothing.
- **Completion is explicit:** a day completes only when the user finishes the loop (writes the completion row). Leaving the app open, or merely logging in, never completes a day or builds a Swell.

---

## 4. The daily loop

The core habit, in order:

1. **Login → Quote of the Day takeover** (once per day, not per login). A mindset/encouragement cue, full-screen, delightful — not a gate. Acknowledge button with personality ("Love it," "That resonates today").
2. **Eddie's Pick** — the isolated weak service.
3. **Coaching cue** — the matched cue for that service × the advisor's tier (zero/low).
4. **Video** — watch the pitch (when videos exist).
5. **Day complete** → **+10 Sand Dollars**, the Swell increments (or a Paddle Back Out is spent), and any milestone badge is checked.

The +10 is for **completing the loop**, once per day — not a point per tap. One meaningful reward for the habit.

---

## 5. Voice — how the game speaks

| We say | We don't say |
|---|---|
| "Day 30. A full month of good days — that's a habit. The whole store can see this Swell. Mahalo for showing up." | "⚠️ STREAK LOST! You've fallen behind your teammates. Reclaim your rank now!" |

- Streaks compete with **yesterday**, not teammates.
- Leaderboards celebrate **teams before individuals.**
- Every badge/milestone notification ends the way everything ends here — with **Mahalo.**
- Gold is reserved for real milestones.

---

## 6. Data model (implemented — `0011_gamification.sql`)

- `daily_completion` — one row per completed daily loop (source of truth for streaks).
- `swell` — per-user streak state: current/longest length, accumulated Paddle Back Out days, monthly-grant tracking.
- `sand_dollar_entry` — the ledger; `sand_dollar_balance` view derives the running total.
- `badge` (catalog, seeded) + `user_badge` (earned).
- `game_settings` — single-row, admin-editable economy config (cap, grant rate, all Sand Dollar amounts).

Streak/grace/points/badge **logic** lives in application code (a server action that reads `game_settings`), not in the schema — the tables hold state, the code applies the rules.

---

## 7. Build sequence

1. ✅ Schema (`0011`)
2. Daily-loop + streak logic (the `completeDay()` server action — grace-day math, points, badge checks)
3. App shell / mobile footer nav (Today · Streak · Badges · Points, role-aware)
4. Gamification views (Swell visualization, badges wall, Sand Dollars balance)
5. Swag Shack (last — the reward layer)

## Open items for Mitch

- Confirm the numbers (Sand Dollar amounts, paddle-out cap) — all now editable, but he should bless the defaults.
- Certifications: what counts as a "course" / "certification" for First Light and Big Wave isn't defined yet.
- Swag Shack catalog + Sand Dollar prices (brand book has a first pass: cap 1,500, tee 2,000, etc.).
