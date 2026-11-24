/* ============================================================================
   EDIAGD — the shape every push transport answers in

   ---------------------------------------------------------------------------
   WHY THIS IS A FILE AND NOT A SECOND COPY OF ApnsResult
   ---------------------------------------------------------------------------
   There are two transports now and the caller must be able to treat them
   alike: group a message, hand it a list of devices, record one row per device,
   retire what came back dead. The moment Apple's answer and Google's answer
   have two different shapes, that loop needs a branch for each — and a branch
   per transport is where "which one did we just record" gets lost.

   So both senders return THIS, and the one thing that genuinely differs
   between them — what counts as a permanently dead address — is a function per
   transport rather than a field on the result.

   This file holds types only and imports nothing. Both senders import it; the
   router imports all three. No cycles, in either direction.
   ============================================================================ */

/** Matches the `push_platform` enum in 0056. Not a wider string. */
export type PushPlatform = "ios" | "android";

/**
 * One device's answer from whichever provider owns it.
 *
 * `status` is the provider's HTTP status — 200 from Apple, 200 from Google,
 * and 0 for a failure that never reached them (no credentials, DNS, a socket
 * that died). Zero is not a status code and is deliberately distinguishable
 * from one: "we never asked" and "they said no" are different facts and the
 * second one is the only one that can mean a device is gone.
 */
export type PushResult = {
  ok: boolean;
  status: number;
  /** The provider's machine-readable reason: "Unregistered", "UNREGISTERED". */
  reason?: string;
  /** The provider's id for the delivery, for a support conversation. */
  providerId?: string;
};

export type PushMessage = {
  title: string;
  body: string;
  /** In-app route the tap lands on. Read by the listener in lib/native/bridge. */
  deepLink: string;
};

/** A token and what it is, which is the only way to pick a transport for it. */
export type PushDevice = {
  token: string;
  platform: PushPlatform;
};
