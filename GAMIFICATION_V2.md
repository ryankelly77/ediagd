# EDIAGD Gamification — v2 Expansion Ideas

Ideas for growing the gamification system beyond the v1 daily loop (which is built and working). These are **proposals for Mitch to react to**, not committed scope. Several are inspired by Duolingo's engagement mechanics — but deliberately filtered through the EDIAGD brand rule: **celebrate up, never punish down; compete with yesterday, not your teammate.** Where an idea borrows from Duolingo, we keep the warmth and drop the competitive anxiety.

Status legend: **[ready]** fits what's built, low effort · **[later]** good, needs more foundation · **[needs Mitch]** a product/curriculum/brand call only Mitch can make.

---

## 1. Complete more lessons for more points — streak stays daily **[ready]**

Today the daily loop is one cue. But 1,245 published cues exist. Let advisors keep going if they want to:

- **The Swell (streak) still counts DAILY completion** — show up, do the loop, the day counts. Unchanged.
- **Sand Dollars accrue per lesson** — an advisor on a roll can complete more cues in their weak service and earn more. The floor stays 3 minutes; the ceiling opens.
- Maps cleanly onto what exists: streak = `daily_completion`, points = `sand_dollar_entry`. This is Duolingo's "streak = you showed up, XP = how much you did" split.

**The distinction to preserve:** more lessons earn more *points*, never more *streak*. A day is a day.

---

## 2. Browse lessons by service category **[ready]**

A learner-facing library, organized exactly like the CMS already is:

- Service tiles with counts — Brake Service (120), Fluids (292), Battery (56), Fuel System (195)…
- Drill into a service, work through its cues (zero-tier and low-tier).
- An advisor can grind their weak service, or explore any service they choose.

Mostly a re-skin of data we already have (content is tagged by service + tier). The advisor-facing counterpart to Mitch's admin CMS.

---

## 3. Buy Paddle Back Out days with Sand Dollars **[ready]**

Right now you earn 1 Paddle Back Out (grace day) per month, cap 5. Add: **spend Sand Dollars to buy one** (still capped at 5 held).

- Makes Sand Dollars useful before the Swag Shack exists (a points-sink).
- Gives advisors agency over protecting their Swell.
- On-brand: it's insurance for "life happens," not a way to cheat the streak.

---

## 4. Double-point days **[ready]**

Bonus Sand Dollar multipliers on certain days — Saturdays, holidays, a "store push" day an admin sets.

- A multiplier read from `game_settings` (already admin-editable), applied at mint time.
- **Preserve the rule:** multiplies *Sand Dollars earned*, never *streak days*. A 2× Saturday gives more points; a day is still one day for the Swell.

---

## 5. Team camaraderie — the RIGHT kind **[needs Mitch]**

Duolingo has social features (leaderboards, hearting others' progress). Some of this is great for EDIAGD; some directly contradicts the brand. **This needs Mitch's explicit call.**

**Fits the brand (warmth, team-first):**
- A **store's collective Swell** — the whole team's shared streak, celebrated together ("the whole store can see this Swell").
- **Teammate encouragement** — cheer/acknowledge a colleague's milestone (a "Mahalo" or "🌊" on someone hitting Day 30).
- **Team-level standing** — celebrating *stores*, not ranking *individuals*.

**Contradicts the brand (individual competition):**
- **Individual ranked leaderboards** (you're #4, about to be demoted) — this is the exact anxiety-inducing energy EDIAGD positions *against*. The brand book is explicit: *"the competition is yesterday, never your teammate. Leaderboards celebrate teams before individuals."*
- Demotion pressure, "you've fallen behind your teammates" messaging.

**Recommendation:** borrow Duolingo's *encouragement*, not its *ranking*. Team camaraderie yes; individual scoreboards no. But Mitch should decide where the line sits — he knows whether a little individual competition motivates advisors or just stresses them.

---

## 6. The lesson journey / curriculum path **[later] [needs Mitch]**

Duolingo's signature winding path of lessons, where each unlocks the next.

- Beautiful, but it implies **structured, sequenced curriculum** — lesson order, prerequisites, what unlocks what.
- EDIAGD's content today is a **flat pool of cues per service**, not an ordered path.
- Building a journey map requires first defining the **pedagogy**: what order should an advisor learn Brake Service cues in? Which are foundational vs advanced?
- **That's Mitch's curriculum design, not an engineering task.** Once the sequence exists, the map is buildable. Until then, "browse by service and complete freely" (#2) is the alpha-ready version.

---

## Open questions for Mitch

1. **Leaderboards:** any individual competition at all, or strictly team-celebration? (Brand book says team-first — confirm.)
2. **Curriculum:** is there a *right order* to the cues within a service, or are they a flat pool? (Determines whether a journey map is even meaningful.)
3. **Certifications:** still undefined — what earns First Light / Big Wave? (Also open from v1 spec.)
4. **Double-point timing:** which days? (Saturdays? Holidays? Admin-set "push" days?)
5. **Sand Dollar economy balance:** if advisors can grind lessons for points AND buy grace days AND shop the Swag Shack, the numbers need to balance so nothing's trivially farmable or impossibly expensive.

---

## Build sequence (proposed)

1. ✅ v1 daily loop (done)
2. Footer nav + basic Streak / Points / Badges views (see what we have)
3. **[ready]** items: browse-by-service lessons, complete-more-for-points, buy grace with Sand Dollars, double-point days
4. **[needs Mitch]** team camaraderie (the right kind), once he rules on leaderboards
5. **[later]** journey map, once curriculum sequence is defined
6. Swag Shack (the ultimate points-sink)
