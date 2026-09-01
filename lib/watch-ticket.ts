/* ============================================================================
   EDIAGD — a signed "this step was served at" stamp
   SERVER ONLY.

   ---------------------------------------------------------------------------
   WHY THE TIMESTAMP HAS TO BE SIGNED
   ---------------------------------------------------------------------------
   The completion endpoint refuses a watch percentage that could not physically
   have been reached in the time available: 95% of a 29-second video needs about
   26 seconds of wall clock, so a completion claiming it two seconds after the
   step appeared is a forgery.

   That check needs to know WHEN THE STEP WAS SERVED, and the only party who
   knows is the page — which runs on the server, renders, and is then out of the
   conversation until a Server Action arrives. Passing the timestamp through the
   client is the only route, and a plain timestamp travelling through the client
   is worthless: moving it backwards makes the elapsed window larger, which is
   exactly the direction a forger wants. The check would verify a number the
   attacker chose.

   So it travels signed. The client carries the stamp and hands it back; it
   cannot alter it, because it cannot produce the HMAC. Same posture as Mux
   playback tokens: the client holds the credential, the server minted it.

   ---------------------------------------------------------------------------
   WHAT IS BOUND INTO THE SIGNATURE, AND WHY EACH PART
   ---------------------------------------------------------------------------
   user + content + servedAt. The user stops a ticket minted for one advisor
   being replayed by another; the content id stops a ticket minted for a
   4-second video being spent on a 20-minute one, which would otherwise be the
   cheapest possible bypass.
   ============================================================================ */

import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

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

/** Tickets older than this are not trusted, whatever they say. */
const MAX_AGE_MS = 12 * 60 * 60 * 1000; // twelve hours — one shift

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/**
 * Mint a ticket for one video step. Call from the page that renders it.
 *
 * Returns null when there is no video — a step with nothing to watch has
 * nothing to verify, and a null ticket is how the completion path knows the
 * difference between "no video" and "a video whose ticket went missing".
 */
export function mintWatchTicket(
  userId: string,
  contentId: string | null,
  now: number = Date.now()
): string | null {
  if (!contentId) return null;
  const payload = `${userId}.${contentId}.${now}`;
  return `${payload}.${sign(payload)}`;
}

export type TicketCheck =
  | { ok: true; servedAt: number; elapsedSec: number }
  | { ok: false; reason: string };

/**
 * Verify a ticket and say how long ago it was minted.
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
  now: number = Date.now()
): TicketCheck {
  if (!contentId) return { ok: false, reason: "no video on this step" };
  if (!ticket) return { ok: false, reason: "no watch ticket" };

  const parts = ticket.split(".");
  if (parts.length !== 4) return { ok: false, reason: "malformed watch ticket" };

  const [tUser, tContent, tTime, mac] = parts;
  const expected = sign(`${tUser}.${tContent}.${tTime}`);

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

  const servedAt = Number(tTime);
  if (!Number.isFinite(servedAt)) return { ok: false, reason: "malformed watch ticket time" };
  if (now - servedAt > MAX_AGE_MS) return { ok: false, reason: "watch ticket expired" };
  /*
   * A ticket from the future means the server's own clock moved, not that the
   * client cheated — it cannot forge one. Clamp to zero elapsed rather than
   * reject, so a clock skew costs a strict check and not somebody's streak.
   */
  const elapsedSec = Math.max(0, (now - servedAt) / 1000);

  return { ok: true, servedAt, elapsedSec };
}
