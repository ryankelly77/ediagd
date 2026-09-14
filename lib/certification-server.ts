/* ============================================================================
   EDIAGD — accruing certifications and computing the credential
   SERVER ONLY, and SERVICE ROLE ONLY. Takes a client; every caller must hand it
   createServiceClient().

   ---------------------------------------------------------------------------
   WHY THE CLIENT MUST BE THE SERVICE ROLE, STATED LOUDLY
   ---------------------------------------------------------------------------
   0115 gives advisor_certification and advisor_credential NO write policy at
   all — not for the advisor, not for a manager, not for an admin. That is the
   design: these rows are derived state, and a credential an admin can insert is
   a credential a dealer can argue with.

   The consequence is that a session client cannot write them, and RLS refuses
   silently rather than loudly: the insert returns an error the caller is free
   to ignore, and nobody ever certifies. `assertServiceRole` below turns that
   into a thrown error at the first write instead of a mystery six months on.

   ---------------------------------------------------------------------------
   WHAT IS DERIVED HERE AND WHAT IS NOT
   ---------------------------------------------------------------------------
   The DECISIONS live in lib/certification.ts, which is pure and tested without
   a database. This file does the fetching and the writing and nothing else —
   it never re-implements "is this earned" or "is this credential current". In
   particular it calls computeCredential() with the catalogue's core count, so
   the completeness guard that refuses a partial input is on the real path and
   not only in the suite.
============================================================================ */

import {
  certificationEarned,
  computeCredential,
  currentThrough,
  type CertificationHolding,
  type ModuleProgress,
} from "@/lib/certification";
import type { IsoDate } from "@/lib/gamification/streak";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

export type AccrualResult = {
  /** Certification slugs earned by this completion. Usually empty. */
  earned: string[];
  /** Set when this completion also produced the credential, for the celebration. */
  credential: { level: "certified" | "master"; certificateId: string } | null;
};

const NOTHING: AccrualResult = { earned: [], credential: null };

/* ---------------------------------------------------------------------------
   TODAY
--------------------------------------------------------------------------- */

async function todayFor(service: Client, rooftopId: string): Promise<IsoDate> {
  const { data } = await service.rpc("rooftop_today", { _rooftop: rooftopId });
  if (typeof data === "string" && data.length >= 10) return data.slice(0, 10) as IsoDate;
  return new Date().toISOString().slice(0, 10) as IsoDate;
}

/* ---------------------------------------------------------------------------
   THE ACCRUAL
--------------------------------------------------------------------------- */

/**
 * Called after an advisor finishes a library item. Decides whether that
 * completion finished a certification, and if so whether it finished the
 * credential.
 *
 * TARGETED, NOT A SWEEP. Only the certifications that the completed item could
 * possibly have advanced are checked — the craft tracks carrying the item's
 * module, and the one service track for the item's family. A sweep over all
 * thirty would run four-table joins on every cue completion in a 2,500-item
 * library for an event that fires a handful of times per advisor per year.
 *
 * INACTIVE TRACKS DO NOT ACCRUE. A track below the content bar is not earnable,
 * so it is not earned. This is the only place the bar is enforced against
 * earning, and it is deliberately a filter on what gets CHECKED rather than a
 * revocation of anything already held — see 0116's header.
 */
export async function accrueFromCompletion(
  service: Client,
  userId: string,
  rooftopId: string,
  contentId: string
): Promise<AccrualResult> {
  const { data: item } = await service
    .from("content")
    .select("id, module_id, service_family, op_code")
    .eq("id", contentId)
    .maybeSingle();
  if (!item) return NOTHING;

  const today = await todayFor(service, rooftopId);
  const earned: string[] = [];

  /* ---- craft: did this finish every module of a certification's courses? -- */
  if (item.module_id) {
    const slugs = await accrueCraft(service, userId, item.module_id as string, today);
    earned.push(...slugs);
  }

  /* ---- service: did this finish everything published in the family? ------- */
  const family = await familyOf(service, item);
  if (family) {
    const slug = await accrueService(service, userId, family, today);
    if (slug) earned.push(slug);
  }

  if (earned.length === 0) return NOTHING;

  const credential = await recomputeCredential(service, userId, today);
  return { earned, credential };
}

/**
 * The quiz entry point.
 *
 * Passing a module quiz can be the act that completes a module, and therefore
 * the act that completes the last module of a craft certification. That path
 * has a module id and no content id, so it gets its own door rather than a
 * contrived lookup — and without this door, a course whose final requirement is
 * its quiz would never certify anybody.
 *
 * Craft only, by construction: service certifications have no module, so there
 * is nothing here for them. That is Ruling 2's deviation, visible in the code
 * rather than smoothed over.
 */
export async function accrueFromModule(
  service: Client,
  userId: string,
  rooftopId: string,
  moduleId: string
): Promise<AccrualResult> {
  const today = await todayFor(service, rooftopId);
  const earned = await accrueCraft(service, userId, moduleId, today);
  if (earned.length === 0) return NOTHING;

  const credential = await recomputeCredential(service, userId, today);
  return { earned, credential };
}

/**
 * The item's service family: carried directly, or resolved through the
 * human-ruled op-code translation table. Same resolution 0115/0116 use in SQL.
 */
async function familyOf(
  service: Client,
  item: { service_family: string | null; op_code: string | null }
): Promise<string | null> {
  if (item.service_family) return item.service_family;
  if (!item.op_code) return null;

  const { data } = await service
    .from("op_code_family")
    .select("family")
    .is("retired_at", null)
    .ilike("code", item.op_code.trim())
    .limit(1)
    .maybeSingle();

  return (data?.family as string | undefined) ?? null;
}

/* ---------------------------------------------------------------------------
   CRAFT
--------------------------------------------------------------------------- */

async function accrueCraft(
  service: Client,
  userId: string,
  moduleId: string,
  today: IsoDate
): Promise<string[]> {
  /* Which course does the finished module belong to, and which active craft
     certifications carry that course? */
  const { data: mod } = await service
    .from("module")
    .select("course_id")
    .eq("id", moduleId)
    .maybeSingle();
  if (!mod?.course_id) return [];

  const { data: links } = await service
    .from("certification_course")
    .select("certification_id")
    .eq("course_id", mod.course_id);

  const certIds = ((links ?? []) as { certification_id: string }[]).map(
    (l) => l.certification_id
  );
  if (certIds.length === 0) return [];

  const { data: certs } = await service
    .from("certification")
    .select("id, slug")
    .in("id", certIds)
    .eq("active", true);

  const earned: string[] = [];
  for (const cert of (certs ?? []) as { id: string; slug: string }[]) {
    if (await craftComplete(service, userId, cert.id)) {
      if (await grantCertification(service, userId, cert.id, today)) {
        earned.push(cert.slug);
      }
    }
  }
  return earned;
}

/**
 * Every module of every course the certification carries, complete.
 *
 * COMPLETION IS READ FROM module_completion, not recomputed. That table is what
 * the LMS writes when a module's requirements are met — every published item
 * done, and where a published quiz exists, that quiz passed. Re-deriving the
 * rule here would stand a second completion accounting beside a working one,
 * which is the exact thing phase 1's ruling 1 refused to build.
 */
async function craftComplete(
  service: Client,
  userId: string,
  certificationId: string
): Promise<boolean> {
  const { data: links } = await service
    .from("certification_course")
    .select("course_id")
    .eq("certification_id", certificationId);

  const courseIds = ((links ?? []) as { course_id: string }[]).map((l) => l.course_id);
  if (courseIds.length === 0) return false;

  const { data: mods } = await service
    .from("module")
    .select("id")
    .in("course_id", courseIds);

  const moduleIds = ((mods ?? []) as { id: string }[]).map((m) => m.id);
  /* A certification whose courses have no modules is not earned. certificationEarned
     refuses an empty list for exactly this reason; the check is here too so the
     query below is never a `.in()` against nothing. */
  if (moduleIds.length === 0) return false;

  const { data: done } = await service
    .from("module_completion")
    .select("module_id")
    .eq("user_id", userId)
    .in("module_id", moduleIds);

  const doneIds = new Set(((done ?? []) as { module_id: string }[]).map((d) => d.module_id));

  const progress: ModuleProgress[] = moduleIds.map((id) => ({
    moduleId: id,
    /* module_completion existing IS "content done and quiz satisfied" — the LMS
       already applied both halves of its rule before writing the row. */
    contentComplete: doneIds.has(id),
    quizPassed: null,
  }));

  return certificationEarned(progress);
}

/* ---------------------------------------------------------------------------
   SERVICE
--------------------------------------------------------------------------- */

/**
 * SHIPPING WITHOUT THE QUIZ CLAUSE, KNOWINGLY.
 *
 * Mitch's rule for a Service Certification is "all clues seen, all videos
 * watched, all tests passed". Ruling 2 of phase 1b: service certifications have
 * no course, therefore no module, therefore no quiz, and we ship the first two
 * clauses rather than build a second quiz system to satisfy the third. When
 * service quizzes exist the carrier is one course per service certification,
 * inside the single existing quiz system — at which point this function is
 * replaced by the craft path above rather than extended.
 */
async function accrueService(
  service: Client,
  userId: string,
  family: string,
  today: IsoDate
): Promise<string | null> {
  const { data: cert } = await service
    .from("certification")
    .select("id, slug")
    .eq("kind", "service")
    .eq("service_family", family)
    .eq("active", true)
    .maybeSingle();
  if (!cert) return null;

  /* Every published item that counts for the family — the same two-way
     resolution the catalogue uses. Ids only; this is a set-difference, not a
     content read. */
  const { data: direct } = await service
    .from("content")
    .select("id")
    .eq("status", "published")
    .eq("service_family", family);

  const { data: codes } = await service
    .from("op_code_family")
    .select("code")
    .is("retired_at", null)
    .eq("family", family);

  const opCodes = ((codes ?? []) as { code: string }[]).map((c) => c.code);
  let viaOp: { id: string }[] = [];
  if (opCodes.length > 0) {
    const { data } = await service
      .from("content")
      .select("id")
      .eq("status", "published")
      .in("op_code", opCodes);
    viaOp = (data ?? []) as { id: string }[];
  }

  const needed = new Set<string>([
    ...((direct ?? []) as { id: string }[]).map((r) => r.id),
    ...viaOp.map((r) => r.id),
  ]);
  /* An empty family is never a certification. Same law as the empty module list:
     every() over nothing is true, and that would certify an advisor for a track
     with no content at all. */
  if (needed.size === 0) return null;

  const { data: done } = await service
    .from("content_progress")
    .select("content_id")
    .eq("user_id", userId)
    .not("completed_at", "is", null)
    .in("content_id", [...needed]);

  const doneIds = new Set(
    ((done ?? []) as { content_id: string }[]).map((d) => d.content_id)
  );
  for (const id of needed) if (!doneIds.has(id)) return null;

  return (await grantCertification(service, userId, cert.id, today)) ? cert.slug : null;
}

/* ---------------------------------------------------------------------------
   WRITING IT DOWN
--------------------------------------------------------------------------- */

/**
 * Insert the holding. Returns false when they already held it.
 *
 * THE UNIQUE INDEX IS THE GUARD, not a preceding select — the same discipline
 * completeLibraryItem uses for content_progress. unique (user_id,
 * certification_id) means a second accrual is a 23505 and not a second earn
 * date, so this is safe to call after every completion.
 */
async function grantCertification(
  service: Client,
  userId: string,
  certificationId: string,
  today: IsoDate
): Promise<boolean> {
  const { data, error } = await service
    .from("advisor_certification")
    .insert({
      user_id: userId,
      certification_id: certificationId,
      earned_at: new Date().toISOString(),
      current_through: currentThrough(today),
      source: "accrued",
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return false; // already held; nothing changed
    assertServiceRole(error, "advisor_certification");
    return false;
  }

  /* The row that was just created IS the evidence the money points at. */
  if (data?.id) await payForCertification(service, userId, data.id as string);
  return true;
}

/**
 * game_settings.sand_certification, paid once per certification, ever.
 *
 * ---------------------------------------------------------------------------
 * THE AMOUNT IS READ, NEVER PASSED
 * ---------------------------------------------------------------------------
 * Same discipline as completeLibraryItem: no caller names a figure, because a
 * caller that could name one could mint currency that buys real swag. It comes
 * from the row the admin screen edits, so the number on the screen and the
 * number paid cannot disagree.
 *
 * ---------------------------------------------------------------------------
 * IDEMPOTENT BY INDEX, NOT BY CARE
 * ---------------------------------------------------------------------------
 * A credential is derived state and recomputes on every accrual, so a payment
 * on this path is a double-pay waiting for the second run. Two things stop it,
 * and only the second one is load-bearing:
 *
 *   the caller   this runs only when the advisor_certification INSERT actually
 *                inserted, so a re-run reaches a 23505 and returns before here
 *   0121         a partial unique index on (ref_id) where reason='certification'
 *
 * The first depends on every future caller reproducing the reasoning. The
 * second is the database refusing, which is why a 23505 here is swallowed as
 * "already paid" rather than treated as a failure.
 *
 * A FAILED PAYMENT DOES NOT UNDO THE CERTIFICATION. The advisor earned it; the
 * money is bookkeeping that can be repaired, and revoking something earned
 * because a ledger write failed would be the worse of the two outcomes.
 */
async function payForCertification(
  service: Client,
  userId: string,
  advisorCertificationId: string
): Promise<void> {
  const { data: settings } = await service
    .from("game_settings")
    .select("sand_certification")
    .limit(1)
    .maybeSingle();

  const amount = Number(settings?.sand_certification ?? 0);
  if (amount <= 0) return;

  await service.from("sand_dollar_entry").insert({
    user_id: userId,
    amount,
    reason: "certification",
    ref_id: advisorCertificationId,
    note: "Certification earned",
  });
}

/**
 * RLS refuses writes to these tables silently enough to hide a dead feature.
 *
 * 42501 is insufficient_privilege, which is what a session client gets when it
 * tries to write a table whose only policies are SELECT. Turning it into a
 * thrown error means the wrong client fails the first time somebody completes a
 * course, rather than never certifying anybody and looking like a content gap.
 */
function assertServiceRole(error: { code?: string; message?: string }, table: string): void {
  if (error?.code === "42501") {
    throw new Error(
      `${table}: write refused by RLS. This path must be given createServiceClient() — ` +
        `derived state has no write policy for any session role.`
    );
  }
}

/* ---------------------------------------------------------------------------
   THE CREDENTIAL
--------------------------------------------------------------------------- */

/**
 * Recompute EDIAGD Certified from what the advisor holds, and persist it if it
 * now computes.
 *
 * THE CORE COUNT COMES FROM THE CATALOGUE AND INCLUDES INACTIVE TRACKS. All
 * eight core certifications count toward the denominator whether or not they
 * are currently earnable. Using the ACTIVE core count instead would mean that
 * with four core tracks below the content bar, an advisor holding the other
 * four would compute as EDIAGD Certified — the credential would get easier
 * exactly because the content got thinner. The credential is unreachable until
 * Mitch's content lands, and that is the intended reading.
 */
export async function recomputeCredential(
  service: Client,
  userId: string,
  today: IsoDate
): Promise<AccrualResult["credential"]> {
  const { data: core } = await service
    .from("certification")
    .select("id, slug")
    .eq("is_core", true);

  const coreRows = (core ?? []) as { id: string; slug: string }[];
  const coreCount = coreRows.length;
  if (coreCount === 0) return null;

  const { data: held } = await service
    .from("advisor_certification")
    .select("certification_id, current_through")
    .eq("user_id", userId);

  const heldBy = new Map(
    ((held ?? []) as { certification_id: string; current_through: string }[]).map((h) => [
      h.certification_id,
      h.current_through,
    ])
  );

  /* ONE HOLDING PER CORE CERTIFICATION, earned or not. computeCredential
     refuses when the list it is handed is not the whole core — passing only the
     rows that came back from advisor_certification would be exactly the
     filtered input its completeness guard exists to reject. */
  const holdings: CertificationHolding[] = coreRows.map((c) => ({
    slug: c.slug,
    isCore: true,
    currentThrough: (heldBy.get(c.id) as IsoDate | undefined) ?? null,
  }));

  const computed = computeCredential(holdings, today, coreCount);
  if (!computed) return null;

  /* Already recorded? The credential's currency is recomputed from its
     constituents every time it is read, so an existing row is not refreshed
     here — there is nothing to refresh that is not derivable. */
  const { data: existing } = await service
    .from("advisor_credential")
    .select("certificate_id")
    .eq("user_id", userId)
    .eq("level", computed.level)
    .maybeSingle();

  if (existing?.certificate_id) {
    return { level: computed.level, certificateId: existing.certificate_id as string };
  }

  const { data: minted, error: mintError } = await service.rpc("mint_certificate_id", {
    _level: computed.level,
  });
  if (mintError || typeof minted !== "string") return null;

  const { error } = await service.from("advisor_credential").insert({
    user_id: userId,
    level: computed.level,
    certificate_id: minted,
    current_through: computed.currentThrough,
  });

  if (error) {
    if (error.code === "23505") {
      /* Raced with another completion. Read back whichever id won. */
      const { data: row } = await service
        .from("advisor_credential")
        .select("certificate_id")
        .eq("user_id", userId)
        .eq("level", computed.level)
        .maybeSingle();
      return row?.certificate_id
        ? { level: computed.level, certificateId: row.certificate_id as string }
        : null;
    }
    assertServiceRole(error, "advisor_credential");
    return null;
  }

  return { level: computed.level, certificateId: minted };
}
