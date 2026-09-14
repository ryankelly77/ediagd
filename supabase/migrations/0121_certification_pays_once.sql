-- ============================================================================
-- EDIAGD — 0121 Earning a certification pays, exactly once
--
-- game_settings.sand_certification has existed since 0011, defaults to 500, is
-- editable on the admin economy screen, and no code path has ever paid it. An
-- editable number that the engine ignores is the exact failure badge-rewards.ts
-- was written to prevent: the wall promising an amount the engine will not pay.
--
-- ---------------------------------------------------------------------------
-- WHY THE GUARD IS AN INDEX AND NOT A CHECK IN THE CALLER
-- ---------------------------------------------------------------------------
-- The credential is DERIVED STATE. recomputeCredential() runs on every accrual,
-- and accrual runs on every library completion and every passed quiz — so a
-- payment on that path is a double-pay waiting for the second run. The existing
-- protection is real but indirect: advisor_certification is unique on
-- (user_id, certification_id), and the accrual only pays when its INSERT
-- actually inserted.
--
-- That is a guard in the CALLER, and it protects only as long as every future
-- caller reproduces the reasoning. This makes it the database's problem: one
-- ledger entry per advisor_certification row, enforced where the money is
-- written rather than where it is decided. A second attempt is a 23505, the
-- same shape the rest of the economy already uses.
--
-- PARTIAL, so it constrains nothing else. Other reasons legitimately repeat
-- against the same ref — daily_loop, swell_7 and badge all point at the same
-- daily_completion row by design, and a blanket unique index would refuse the
-- second one and break the daily loop.
-- ============================================================================

create unique index if not exists sand_dollar_entry_certification_once
  on sand_dollar_entry (ref_id)
  where reason = 'certification';

comment on index sand_dollar_entry_certification_once is
  'One payment per advisor_certification row. See 0121 — the credential is '
  'derived state and recomputes, so the once-ness lives here, not in the caller.';

-- ---- certification_prerequisite is intentionally unused, permanently ---------

/*
 * 0115 shipped this table empty, pending a ruling on whether craft tracks
 * require specific service certifications or merely a count of them. The ruling
 * is NEITHER: do not gate at all.
 *
 * The question turned out not to be which shape of gate, but whether to have
 * one — and nobody has given a reason to. Mitch said Menu Presentation "builds
 * on the service certifications", which is how he intends to TEACH it, not a
 * demand that the app refuse to let somebody start. Gating adds friction,
 * creates a matrix that goes stale every time content lands, and sits badly
 * beside a design law that says anybody who does the work can earn it.
 *
 * The table stays — retire, never delete — and no code reads it. This comment
 * exists so the next person does not read an empty table as an unfinished one
 * and helpfully fill it in.
 *
 * IF A GATE IS EVER WANTED, the right shape is a required-count column on
 * `certification`, not pairwise rows: it says the thing anybody actually means
 * ("some service grounding first") without enumerating a matrix that has to be
 * maintained. Built when there is a reason, not before.
 */
comment on table certification_prerequisite is
  'INTENTIONALLY EMPTY AND UNREAD. Ruled in phase 2: certifications are not '
  'gated on one another. If a gate is ever wanted the shape is a count column '
  'on certification, not pairwise rows. See 0121.';

notify pgrst, 'reload schema';
