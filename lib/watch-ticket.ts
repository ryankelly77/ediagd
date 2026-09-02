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

     A TTL PROPORTIONAL TO THE ASSET. Three times the duration plus five
     minutes, instead of a flat twelve hours. Long enough for a service drive —
     pause, serve a customer, come back — and short enough that a ticket cannot
     be banked in the morning and spent at lunch.

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

/**
 * How long a ticket stays spendable, from the moment the player opened.
 *
 * Three times the asset plus five minutes. A twelve-minute video on a service
 * drive is genuinely watched in bursts, so a tight multiple would fail honest
 * viewers; three times is generous to them and still refuses a ticket minted
 * before the morning meeting and spent after lunch. The flat five minutes
 * covers assets whose duration is unknown or very short.
 */
export function ticketTtlMs(durationSec: number | null | undefined): number {
  const d = Number(durationSec);
  const base = Number.isFinite(d) && d > 0 ? d : 0;
  return (base * 3 + 300) * 1000;
}

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

export type TicketCheck =
  | { ok: true; openedAt: number; elapsedSec: number }
  | { ok: false; reason: string };

/**
 * Verify a ticket and say how long the player has been open.
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
  durationSec: number | null | undefined,
  now: number = Date.now()
): TicketCheck {
  if (!contentId) return { ok: false, reason: "no video on this step" };
  if (!ticket) return { ok: false, reason: "no watch ticket" };

  const parts = ticket.split(".");
  if (parts.length !== 5) return { ok: false, reason: "malformed watch ticket" };

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
    return { ok: false, reason: "bad watch ticket signature" };
  }

  if (tUser !== userId) return { ok: false, reason: "watch ticket belongs to another user" };
  if (tContent !== contentId) return { ok: false, reason: "watch ticket is for another video" };
  if (tDate !== storeDate) return { ok: false, reason: "watch ticket is from another day" };

  const openedAt = Number(tTime);
  if (!Number.isFinite(openedAt)) return { ok: false, reason: "malformed watch ticket time" };
  if (now - openedAt > ticketTtlMs(durationSec)) {
    return { ok: false, reason: "watch ticket expired — open the video again" };
  }

  /*
   * A ticket from the future means the server's own clock moved, not that the
   * client cheated — it cannot forge one. Clamp to zero elapsed rather than
   * reject, so a clock skew costs a strict check and not somebody's streak.
   */
  const elapsedSec = Math.max(0, (now - openedAt) / 1000);

  return { ok: true, openedAt, elapsedSec };
}
