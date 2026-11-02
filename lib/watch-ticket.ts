/* ============================================================================
   EDIAGD — a signed "this video was OPENED at" stamp
   SERVER ONLY.

   ---------------------------------------------------------------------------
   WHAT THE OLD TICKET ACTUALLY PROVED, AND WHY IT WAS NOT ENOUGH
   ---------------------------------------------------------------------------
   It was minted when /today RENDERED, lived twelve hours, and could be spent
   any number of times. The completion endpoint checked that enough wall clock
   had passed since minting to make the claimed percentage physically possible.

   Which is a true statement about the page, and almost nothing about the video.
   Open the day at 7:00am, do nothing, and at 7:05 post `watchPct: 100` for a
   three-minute video: five minutes had passed, so the check passed. The cost of
   forging a full watch was opening the app once and waiting — which an advisor
   does anyway, every morning, for free.

   Three changes, and each one closes part of the same gap:

     MINTED AT OPEN, NOT AT RENDER. The stamp now says when the PLAYER was
     opened, so the elapsed window starts when there was something to watch.

     A LIFETIME OF ONE STORE-LOCAL DAY, and nothing shorter.

     This was three times the duration plus five minutes, and that number cost
     an advisor her day: an 85-second mindset film with the player open 577
     seconds, against a 555-second TTL. She watched it, the gate write was
     refused as expired, and the morning could not be saved.

     The TTL was there to stop a ticket being "banked in the morning and spent
     at lunch" — which was a real risk for the OLD ticket, minted when the PAGE
     rendered, because the elapsed window started at render and waiting was free.
     It is not a risk for this one. The stamp is minted on first PLAY and the
     wall-clock test below is a LOWER bound: enough time must have passed for
     the video to have played. An upper bound buys nothing on top of that —
     spending at lunch is no cheaper than spending ninety seconds after opening,
     because both have to clear the same lower bound. What the upper bound did
     buy was a refusal for the honest viewer who takes longer than three times
     the film, which on a short film is no time at all.

     So the lifetime is THE STORE-LOCAL DAY, and it needs no arithmetic: the
     date is already signed into the ticket and already compared against the
     rooftop's today. A ticket cannot outlive its day because the day is part of
     what it says, and a mismatch is `wrong-day`. The unsafe state is not
     representable rather than merely bounded.

     SINGLE USE. The completion records a hash of the ticket it spent, and a
     ticket already spent is refused. Bound to the store-local date as well, so
     yesterday's cannot be produced today.

   WHAT IS STILL NOT PROVEN, STATED PLAINLY. Opening the player and letting it
   run in another tab still passes. That is the floor for any client-measured
   signal short of server-side attestation, and it is not what this fixes. What
   it fixes is the price: forging a full watch now costs the video's actual
   duration with the player open, per video, per day — the same cost as watching
   it.

   ---------------------------------------------------------------------------
   WHAT IS BOUND INTO THE SIGNATURE
   ---------------------------------------------------------------------------
   user + content + store-local date + opened-at. The user stops a ticket minted
   for one advisor being replayed by another; the content id stops a ticket
   minted for a four-second clip being spent on a twenty-minute one; the date
   stops one being carried across midnight; opened-at is the measurement itself.
   ============================================================================ */

import "server-only";
import { createHmac, createHash, timingSafeEqual } from "node:crypto";

/**
 * The signing key.
 *
 * WATCH_TICKET_SECRET when set; otherwise the service-role key, which is
 * already the app's most sensitive server-only value and is never shipped to a
 * browser. Reusing it is deliberate rather than lazy: a dedicated secret that
 * has to be added to every environment is a secret that will be missing from
 * one of them, and the failure mode there is every completion being rejected.
 *
 * It is used ONLY as an HMAC key here — nothing derived from it is exposed, and
 * an HMAC does not leak its key.
 */
function secret(): string {
  const s =
    process.env.WATCH_TICKET_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SB_KEY;
  if (!s) throw new Error("No signing key available for watch tickets.");
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/* ticketTtlMs is GONE, not deprecated.
 *
 * A duration-proportional TTL was the only reason this module needed to know an
 * asset's duration, and it is the thing that refused an honest watch. There is
 * no replacement constant to tune, because the lifetime is now a property of
 * what the ticket SAYS — its store-local date, compared below — rather than a
 * number somebody has to pick. See the header.
 */

/**
 * What gets stored on the completion so a ticket can only be spent once.
 *
 * A HASH, NOT THE TICKET. The ticket is a credential; a credential sitting in a
 * table is one that whoever can read the table can replay. The hash answers the
 * only question ever asked of it — has this exact ticket been spent — and
 * answers nothing else.
 */
export function watchTicketRef(ticket: string): string {
  return createHash("sha256").update(ticket).digest("hex").slice(0, 32);
}

/**
 * Mint a ticket for one video, at the moment its player is opened.
 *
 * Returns null when there is no video — a step with nothing to watch has
 * nothing to verify, and a null ticket is how the completion path tells the
 * difference between "no video" and "a video whose ticket went missing".
 */
export function mintWatchTicket(
  userId: string,
  contentId: string | null,
  storeDate: string,
  now: number = Date.now()
): string | null {
  if (!contentId) return null;
  const payload = `${userId}.${contentId}.${storeDate}.${now}`;
  return `${payload}.${sign(payload)}`;
}

/**
 * Why a ticket did not verify — as a value, not as a sentence.
 *
 * The sentence is for the advisor and will be rewritten; the code is for the
 * completion path, which has to tell two very different things apart:
 *
 *   FORGED     wrong signature, another user, another video, another day. A
 *              ticket that was made up. The completion is refused.
 *   EXPIRED    a real ticket, minted for this viewer and this video, that has
 *              simply gone stale. Somebody got stuck, or set the phone down.
 *              The completion goes through UNCREDITED — see completeDay.
 *
 * Matching on the sentence would have worked until somebody improved the
 * wording, and the failure would have been a locked day.
 */
export type TicketFailure =
  | "no-video"
  | "missing"
  | "malformed"
  | "forged"
  | "wrong-user"
  | "wrong-content"
  | "wrong-day";
/* "expired" is gone with the TTL. It is removed from this union rather than
   left as an unreachable member, because a failure code nothing can return is a
   branch every reader has to reason about and no test can reach. The case it
   described — a real ticket gone stale — is now either the same store day (in
   which case it is valid) or a different one (in which case it is wrong-day). */

export type TicketCheck =
  | { ok: true; openedAt: number; elapsedSec: number }
  | { ok: false; reason: string; code: TicketFailure };

/**
 * Verify a ticket and say how long the player has been open.
 *
 * NO DURATION PARAMETER ANY MORE. It existed only to compute the TTL, and a
 * parameter a function accepts and ignores is how a check ends up measuring
 * something nobody intended.
 *
 * Every failure is distinguishable in the return value, because these end up in
 * an error the advisor reads: "your day did not save" with no reason is the
 * worst outcome of this whole feature, and a caller needs enough to say
 * something true.
 */
export function readWatchTicket(
  ticket: string | null | undefined,
  userId: string,
  contentId: string | null,
  storeDate: string,
  now: number = Date.now()
): TicketCheck {
  if (!contentId) return { ok: false, reason: "no video on this step", code: "no-video" };
  if (!ticket) return { ok: false, reason: "no watch ticket", code: "missing" };

  const parts = ticket.split(".");
  if (parts.length !== 5) return { ok: false, reason: "malformed watch ticket", code: "malformed" };

  const [tUser, tContent, tDate, tTime, mac] = parts;
  const expected = sign(`${tUser}.${tContent}.${tDate}.${tTime}`);

  /*
   * Constant-time, and length-checked first because timingSafeEqual THROWS on a
   * length mismatch rather than returning false — an attacker-controlled string
   * of the wrong length would turn a failed check into a 500.
   */
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad watch ticket signature", code: "forged" };
  }

  if (tUser !== userId) return { ok: false, reason: "watch ticket belongs to another user", code: "wrong-user" };
  if (tContent !== contentId) return { ok: false, reason: "watch ticket is for another video", code: "wrong-content" };
  /*
   * THE LIFETIME, AND IT IS THIS LINE.
   *
   * The ticket is signed with the store-local date it was minted on, so a
   * ticket is spendable exactly while that day is still the rooftop's today.
   * Nothing expires inside a day; nothing survives past it. This is the whole
   * of the ticket's lifetime and there is no second expression of it.
   */
  if (tDate !== storeDate) return { ok: false, reason: "watch ticket is from another day", code: "wrong-day" };

  const openedAt = Number(tTime);
  if (!Number.isFinite(openedAt)) return { ok: false, reason: "malformed watch ticket time", code: "malformed" };
  /*
   * A ticket from the future means the server's own clock moved, not that the
   * client cheated — it cannot forge one. Clamp to zero elapsed rather than
   * reject, so a clock skew costs a strict check and not somebody's streak.
   */
  const elapsedSec = Math.max(0, (now - openedAt) / 1000);

  return { ok: true, openedAt, elapsedSec };
}
