/* ============================================================================
   EDIAGD — the day that was served, signed
   SERVER ONLY.

   ---------------------------------------------------------------------------
   THE PROBLEM THIS REPLACES
   ---------------------------------------------------------------------------
   completeDay derived the block, the op code, the stage and the tier
   server-side, and took the five CONTENT IDS from the request body. They were
   described as "just provenance on the completion row", and they are not:

     impact_coaching joins daily_completion.cue_content_id to content.
     service_family to decide whether an advisor was coached on a family in a
     period, and that feeds admin_impact_* and the ROI-per-rooftop figure shown
     to a dealer principal.

   So a client could post any published cue id and manufacture coaching
   coverage in the number the product is sold on. Not a leak — a fabrication,
   in the direction that flatters us.

   ---------------------------------------------------------------------------
   ONE STAMP, MINTED WHERE THE DAY IS ASSEMBLED
   ---------------------------------------------------------------------------
   /today already knows exactly what it served. It signs that — user, store-local
   date, block, the five content ids, the cue rung, the tier and the skipped
   flag — and the client carries the stamp back untouched. completeDay verifies
   it and writes WHAT IT VERIFIED, not what the request said.

   The client stops sending ids as data. It sends them back as the stamp's
   payload, which it cannot alter, so finding 6's failure surface is not reduced
   — it is gone. A forged cue_content_id fails the signature, full stop.

   WHY THE PAYLOAD IS JSON AND NOT DOT-JOINED. Ten fields, most nullable, three
   of them free-ish text. Dot-joining would need an escaping rule, and an
   escaping rule is where a delimiter-injection bug lives. A canonical key order
   with JSON.stringify has no delimiter to confuse.
   ============================================================================ */

import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/** The same key the watch tickets use, and for the same reasons. */
function secret(): string {
  const s =
    process.env.WATCH_TICKET_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SB_KEY;
  if (!s) throw new Error("No signing key available for the day stamp.");
  return s;
}

/**
 * Everything about the day that the completion row records as fact.
 *
 * Short keys because this travels to the browser and back on every completion;
 * the comment is the documentation, not the key names.
 */
export type ServedDay = {
  /** user id */ u: string;
  /** store-local date */ d: string;
  /** open coaching block id, or null */ b: string | null;
  /** life quote */ q1: string | null;
  /** selling quote */ q2: string | null;
  /** coaching cue */ cue: string | null;
  /** lifestyle video */ vid: string | null;
  /** op-code pitch video */ pitch: string | null;
  /** step 3 looked up and found nothing */ skipped: boolean | null;
  /** which rung of the ladder fired */ match: string | null;
  /** the block's tier at serve time */ tier: string | null;
};

/* One canonical ordering, used for signing and verifying alike. Sorting keys at
   runtime would work too and would hide the fact that the order is load-bearing. */
const KEYS: (keyof ServedDay)[] = [
  "u", "d", "b", "q1", "q2", "cue", "vid", "pitch", "skipped", "match", "tier",
];

function canonical(day: ServedDay): string {
  return JSON.stringify(KEYS.map((k) => day[k] ?? null));
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** `<base64url(canonical json)>.<mac>` */
export function mintDayStamp(day: ServedDay): string {
  const body = Buffer.from(canonical(day), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

export type DayStampCheck =
  | { ok: true; day: ServedDay }
  | { ok: false; reason: string };

/**
 * Verify a stamp and hand back the day it describes.
 *
 * The user and the date are checked against the caller's own session and the
 * rooftop's today, not taken from the stamp — a valid stamp for yesterday, or
 * for somebody else, is still not this completion.
 */
export function readDayStamp(
  stamp: string | null | undefined,
  userId: string,
  storeDate: string
): DayStampCheck {
  if (!stamp) return { ok: false, reason: "no day stamp" };

  const parts = stamp.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed day stamp" };

  const [body, mac] = parts;
  const expected = sign(body);

  /* Length-checked first: timingSafeEqual throws on a mismatch rather than
     returning false, and the input is attacker-controlled. */
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad day stamp signature" };
  }

  let values: unknown;
  try {
    values = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "unreadable day stamp" };
  }
  if (!Array.isArray(values) || values.length !== KEYS.length) {
    return { ok: false, reason: "unreadable day stamp" };
  }

  const day = Object.fromEntries(
    KEYS.map((k, i) => [k, values[i] ?? null])
  ) as unknown as ServedDay;

  if (day.u !== userId) return { ok: false, reason: "day stamp belongs to another user" };
  if (day.d !== storeDate) return { ok: false, reason: "day stamp is from another day" };

  return { ok: true, day };
}
