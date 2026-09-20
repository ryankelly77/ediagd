/* ============================================================================
   EDIAGD — is this rooftop set up yet?
   SERVER ONLY.

   ---------------------------------------------------------------------------
   WHY A ROOFTOP WITH NO PRODUCT NEEDS ITS OWN ANSWER
   ---------------------------------------------------------------------------
   `content_entitled_read` (0010) gates every published row on
   `rooftop_has_product(rooftop, product_for_content_type(type))`, and
   `rooftop_has_product` needs an actual row with status 'active' or 'trialing'.
   No row means NO CONTENT — not a smaller library, none: no mindset film, no
   pitch, no item, no quote.

   Every pool in lib/loop.ts then degrades politely to null, which is correct
   behaviour and produces a morning with nothing in it. `evaluateDayGate` fails
   closed on that morning — deliberately, because an empty screen must never pay
   out a streak day — so the advisor works through a ritual that CANNOT COMPLETE
   and is told nothing.

   Measured on production 2026-09-19: ten of eleven Doggett rooftops have no
   rooftop_product row at all. One of the four advisor accounts is at one of
   them.

   An advisor in that state must see an honest screen, not a broken one. That is
   what this decides, and it is deliberately a SEPARATE question from "is the
   library empty" — a rooftop that owns the product and has nothing published is
   a content gap, and the loop's existing empty states already say so.

   ---------------------------------------------------------------------------
   IT ASKS THE DATABASE'S OWN FUNCTION
   ---------------------------------------------------------------------------
   `rooftop_has_product` is the predicate RLS itself uses. Restating it here —
   "select from rooftop_product where status in (…)" — would be a second copy of
   an entitlement rule, which is the mistake 0118 refused to make when it could
   have copied content_entitled_read. If the rule ever changes, this follows for
   free.
   ============================================================================ */

import "server-only";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = { rpc: (fn: string, args?: Record<string, unknown>) => any };

/**
 * Does this rooftop hold the product the daily loop's content sits behind?
 *
 * `advisor_base` is what `product_for_content_type` resolves to for BOTH `cue`
 * and `advisor_video` — the item slot and every film. So one question covers
 * the whole ritual; there is no partial state where the pitch works and the
 * item does not.
 *
 * FAILS TOWARDS "SET UP", and that is the safer direction here. A database
 * hiccup returning an error would otherwise tell a working rooftop it is not
 * provisioned and replace a functioning ritual with a support message — a
 * self-inflicted outage. The opposite failure costs an unprovisioned advisor
 * one more morning of the empty loop they are already getting.
 */
export async function rooftopIsProvisioned(
  service: Client,
  rooftopId: string
): Promise<boolean> {
  try {
    const { data, error } = await service.rpc("rooftop_has_product", {
      _rooftop: rooftopId,
      _product: "advisor_base",
    });
    if (error) return true;
    return data !== false;
  } catch {
    return true;
  }
}
