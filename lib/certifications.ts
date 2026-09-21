/* ============================================================================
   EDIAGD — what the certification surfaces read
   SERVER ONLY (takes a Supabase client). Read side only; nothing here writes.

   The decisions still live in lib/certification.ts, which is pure. This file
   fetches and shapes, and calls that module for every judgement it needs —
   currency, the rung line, the credential — so the screens and the accrual
   agree about what "current" means by construction rather than by care.
============================================================================ */

import { loadStoryGate } from "@/lib/story";
import {
  certificationState,
  coreBuildLine,
  coreProgressLine,
  credentialCurrencyLine,
  earnedLine,
  type CertificationHolding,
  type CertificationState,
} from "@/lib/certification";
import type { IsoDate } from "@/lib/gamification/streak";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

export type CertificationTile = {
  id: string;
  slug: string;
  name: string;
  kind: "craft" | "service";
  glyphKey: string;
  isCore: boolean;
  isMasterTrack: boolean;
  /** Content-derived and bar-aware. False means "not offered", never "failed". */
  active: boolean;
  sort: number;

  /** How many published items the track holds, per 0116. */
  itemCount: number;
  doneItems: number;
  totalModules: number;
  doneModules: number;

  /*
   * THE THIRD LEG — 3e. Carried on the tile so statusLine can name what is
   * actually outstanding instead of saying "Finishing up" to somebody who is
   * one paragraph short of eight months of work.
   */
  storyRequired: boolean;
  storySubmitted: boolean;

  earnedAt: string | null;
  /*
   * There is deliberately no `currentThrough` here.
   *
   * The DB column survives because it is NOT NULL and because we retire rather
   * than delete — but carrying it onto the tile would put a live-looking,
   * unread date in front of every screen, which is how a retired rule gets
   * wired back up by someone who assumes a field exists to be used. What the
   * screens need is earnedAt. See 0122.
   */
  state: CertificationState;
  /** "Earned 2027-03-14", or null when never earned. */
  currency: string | null;
};

export type CertificationsView = {
  tiles: CertificationTile[];
  /** "5 of 8 core — 3 from EDIAGD Certified." */
  rungLine: string;
  /** "4 of the 8 are still being built." Null when every core track is live. */
  buildLine: string | null;
  coreCount: number;
  coreHeld: number;
  credential: {
    level: "certified" | "master";
    certificateId: string;
    currentThrough: IsoDate;
    earnedAt: string;
    /** "Current through …" / "Renew to stay current" — the only clock left. */
    currency: string;
  } | null;
};

/**
 * Everything the certifications screen and the profile card need, in three
 * round trips: the catalogue, what the advisor holds, and the progress rollup
 * from 0117.
 *
 * THE CATALOGUE INCLUDES INACTIVE TRACKS. They render as "coming soon" rather
 * than being hidden, for the reason lib/badges.ts gives about future badges: a
 * track the advisor cannot start is not a track they are failing to finish, and
 * hiding it would make the wall change shape as Mitch writes content.
 */
export async function loadCertifications(
  client: Client,
  userId: string,
  today: IsoDate
): Promise<CertificationsView> {
  const [{ data: catalogue }, { data: held }, { data: progress }, storyGate, { data: cred }] =
    await Promise.all([
      client
        .from("certification")
        .select(
          "id, slug, name, kind, glyph_key, is_core, is_master_track, active, sort, item_count"
        )
        .order("sort"),
      client
        .from("advisor_certification")
        .select("certification_id, earned_at")
        .eq("user_id", userId),
      client.rpc("my_certification_progress"),
      /* The story gate. Read here rather than per tile so the flag is fetched
         once and the page cannot ask the same question two different ways. */
      loadStoryGate(client as never, userId),
      client
        .from("advisor_credential")
        .select("level, certificate_id, current_through, earned_at")
        .eq("user_id", userId)
        .eq("level", "certified")
        .maybeSingle(),
    ]);

  const heldBy = new Map(
    ((held ?? []) as {
      certification_id: string;
      earned_at: string;
    }[]).map((h) => [h.certification_id, h])
  );

  const progressBy = new Map(
    ((progress ?? []) as {
      certification_id: string;
      total_items: number;
      done_items: number;
      total_modules: number;
      done_modules: number;
    }[]).map((p) => [p.certification_id, p])
  );

  const tiles: CertificationTile[] = ((catalogue ?? []) as any[]).map((c) => {
    const mine = heldBy.get(c.id);
    const p = progressBy.get(c.id);
    /* The day it was earned is the only date a track has that means anything. */
    const earnedOn = ((mine?.earned_at as string | undefined)?.slice(0, 10) ?? null) as
      | IsoDate
      | null;

    return {
      id: c.id,
      slug: c.slug,
      name: c.name,
      kind: c.kind,
      glyphKey: c.glyph_key,
      isCore: c.is_core,
      isMasterTrack: c.is_master_track,
      active: c.active,
      sort: c.sort,
      itemCount: Number(c.item_count ?? 0),
      doneItems: Number(p?.done_items ?? 0),
      totalModules: Number(p?.total_modules ?? 0),
      doneModules: Number(p?.done_modules ?? 0),
      storyRequired: storyGate.storyRequired,
      storySubmitted: storyGate.toldFor.has(c.id as string),
      earnedAt: (mine?.earned_at as string | undefined) ?? null,
      state: certificationState({ earnedOn }),
      currency: earnedLine({ earnedOn }),
    };
  });

  /* THE WHOLE CORE, NOT THE EARNED PART OF IT. coreProgressLine takes the
     catalogue's core count for the same reason computeCredential does — handed
     a filtered list it would report progress against a denominator that shrank
     as content was withdrawn. */
  const coreTiles = tiles.filter((t) => t.isCore);
  const holdings: CertificationHolding[] = coreTiles.map((t) => ({
    slug: t.slug,
    isCore: true,
    earnedOn: (t.earnedAt?.slice(0, 10) as IsoDate | undefined) ?? null,
  }));

  /* "Still being built" means exactly what the Coming Soon grid holds: not
     earnable, and not already held. A core track somebody earned before the bar
     moved is not something Mitch still has to write, and counting it here would
     tell that advisor a track they hold is unfinished. */
  const unbuiltCore = coreTiles.filter((t) => !t.active && t.state === "unearned").length;

  return {
    tiles,
    rungLine: coreProgressLine(holdings, today, coreTiles.length),
    buildLine: coreBuildLine(coreTiles.length, unbuiltCore),
    coreCount: coreTiles.length,
    coreHeld: coreTiles.filter((t) => t.state === "held").length,
    credential: cred
      ? {
          level: cred.level,
          certificateId: cred.certificate_id,
          currentThrough: cred.current_through,
          earnedAt: cred.earned_at,
          currency: credentialCurrencyLine(cred.current_through as IsoDate, today),
        }
      : null,
  };
}

export type CredentialCard = {
  level: "certified" | "master";
  certificateId: string;
  currentThrough: IsoDate;
  /** "Current through …" / "Renew to stay current". */
  currency: string;
  /** "8 of 8 core — EDIAGD Certified" */
  rungLine: string;
  /** How many certifications they hold in total, current or lapsed. */
  held: number;
};

/**
 * The profile card's data, without paying for the whole wall.
 *
 * NO CREDENTIAL MEANS NO CARD, so this returns null rather than an empty shape —
 * a profile section reading "Credential: none" tells an advisor they are missing
 * something, when the truth today is that four core tracks have no content
 * behind them and nobody in the company can hold one.
 *
 * Three narrow reads instead of loadCertifications' four wide ones: the profile
 * page already runs eight queries of its own and does not need the catalogue.
 */
export async function loadCredentialCard(
  client: Client,
  userId: string,
  today: IsoDate
): Promise<CredentialCard | null> {
  const { data: cred } = await client
    .from("advisor_credential")
    .select("level, certificate_id, current_through")
    .eq("user_id", userId)
    .order("level")
    .limit(1)
    .maybeSingle();

  if (!cred) return null;

  const [{ data: core }, { data: held }] = await Promise.all([
    client.from("certification").select("id, slug").eq("is_core", true),
    client
      .from("advisor_certification")
      .select("certification_id, earned_at")
      .eq("user_id", userId),
  ]);

  const coreRows = (core ?? []) as { id: string; slug: string }[];
  const heldRows = (held ?? []) as {
    certification_id: string;
    earned_at: string;
  }[];
  const heldBy = new Map(
    heldRows.map((h) => [h.certification_id, h.earned_at.slice(0, 10)])
  );

  const holdings: CertificationHolding[] = coreRows.map((c) => ({
    slug: c.slug,
    isCore: true,
    earnedOn: (heldBy.get(c.id) as IsoDate | undefined) ?? null,
  }));

  return {
    level: cred.level,
    certificateId: cred.certificate_id,
    currentThrough: cred.current_through,
    currency: credentialCurrencyLine(cred.current_through as IsoDate, today),
    rungLine: coreProgressLine(holdings, today, coreRows.length),
    held: heldRows.length,
  };
}

/**
 * What a manager may see about somebody else: the credential, and nothing else.
 *
 * Deliberately NOT the per-track progress. A roster is a list of who holds a
 * credential, not a coaching dashboard about how far through a colleague is,
 * and advisor_credential's own RLS policy is what decides whether the row comes
 * back at all — this function adds no filter of its own and would return
 * nothing for an advisor the caller cannot see.
 */
export async function loadCredentialPills(
  client: Client,
  userIds: string[]
): Promise<Map<string, "Certified" | "Master Certified">> {
  const out = new Map<string, "Certified" | "Master Certified">();
  if (userIds.length === 0) return out;

  const { data } = await client
    .from("advisor_credential")
    .select("user_id, level")
    .in("user_id", userIds);

  for (const row of (data ?? []) as { user_id: string; level: string }[]) {
    /* Master outranks certified if somebody ever holds both. */
    if (row.level === "master") out.set(row.user_id, "Master Certified");
    else if (!out.has(row.user_id)) out.set(row.user_id, "Certified");
  }
  return out;
}
