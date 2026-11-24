/* ============================================================================
   EDIAGD — the one way to send a push, whatever the handset is

   ---------------------------------------------------------------------------
   WHY A ROUTER AND NOT A BRANCH AT EACH CALL SITE
   ---------------------------------------------------------------------------
   0106 sent an Android token to Apple, earned a guaranteed BadDeviceToken, and
   would have retired a working device for failing at a service it was never
   meant to reach. The fix then was to narrow the QUERY — `and t.platform =
   'ios'` in push_outbox_due — with the note that when an Android transport
   arrives "the fix is a second transport plus a second branch here, not the
   removal of this filter."

   This is that second branch, in one place. The two callers hand over tokens
   WITH their platform and get back one result per token; neither of them knows
   that Apple and Google exist. A third caller cannot reintroduce 0106's defect
   by forgetting a filter, because there is no filter to forget — picking the
   transport is not a decision a caller makes.

   ---------------------------------------------------------------------------
   AN UNKNOWN PLATFORM IS REPORTED, NEVER SKIPPED
   ---------------------------------------------------------------------------
   `push_platform` is an enum with two values today. A third one would arrive
   as a row this file has no sender for, and the tempting shape — filter the
   list down to what we can handle — is the defect this codebase has met most
   often: a fixed list that says nothing about the thing it does not recognise,
   which on a summary reads exactly like success.

   So every token handed in gets a result back, including a refusal naming the
   platform. The counts a caller reports are then over the population it was
   given rather than over the subset that happened to be routable.
   ============================================================================ */

import {
  describeApnsConfig,
  isApnsConfigured,
  isDeadToken as isDeadApnsToken,
  sendToTokens,
} from "./apns";
import {
  describeFcmConfig,
  isDeadFcmToken,
  isFcmConfigured,
  sendToFcmTokens,
} from "./fcm";
import type { PushDevice, PushMessage, PushPlatform, PushResult } from "./push-result";

/** Which provider a result came from. Recorded so a reason is readable later. */
export type PushTransport = "apns" | "fcm";

export type PushSendResult = PushResult & {
  platform: string;
  /** Null when no transport owns the platform — the refusal case. */
  transport: PushTransport | null;
};

type Transport = {
  name: PushTransport;
  configured: () => boolean;
  send: (
    tokens: string[],
    message: PushMessage
  ) => Promise<Map<string, PushResult>>;
  /** Permanently dead for THIS provider. Apple's list is not Google's. */
  isDead: (result: PushResult) => boolean;
};

/**
 * Platform to transport. The whole mapping, and the only place it exists.
 *
 * iOS goes to Apple directly and NOT through Firebase. Routing iOS through FCM
 * would mean uploading the APNs key to Google, adding a hop that can lose a
 * delivery, and replacing a failure Apple names precisely with one Firebase
 * paraphrases — for nothing, since apns.ts already works.
 */
const TRANSPORTS: Record<PushPlatform, Transport> = {
  ios: {
    name: "apns",
    configured: isApnsConfigured,
    send: sendToTokens,
    isDead: isDeadApnsToken,
  },
  android: {
    name: "fcm",
    configured: isFcmConfigured,
    send: sendToFcmTokens,
    isDead: isDeadFcmToken,
  },
};

const PLATFORMS = Object.keys(TRANSPORTS) as PushPlatform[];

function transportFor(platform: string): Transport | null {
  return Object.prototype.hasOwnProperty.call(TRANSPORTS, platform)
    ? TRANSPORTS[platform as PushPlatform]
    : null;
}

/** The platforms that could actually be delivered to from this deployment. */
export function configuredPlatforms(): PushPlatform[] {
  return PLATFORMS.filter((p) => TRANSPORTS[p].configured());
}

/** Is there any transport at all? The caller's "queue it and say so" gate. */
export function isAnyTransportConfigured(): boolean {
  return configuredPlatforms().length > 0;
}

export function transportName(platform: string): PushTransport | null {
  return transportFor(platform)?.name ?? null;
}

/**
 * Permanently dead, asked of the right provider.
 *
 * Takes the platform rather than guessing from the result, because the two
 * providers' vocabularies overlap in shape and not in meaning: Apple's 410
 * means gone, Google's 404 means gone, and Google's 400 means gone only
 * sometimes. A single predicate over both would have to be the union of two
 * lists, and the union of a permanent-failure list and a transient-failure
 * list retires working phones.
 */
export function isDeadForPlatform(platform: string, result: PushResult): boolean {
  const transport = transportFor(platform);
  /* No transport means we never asked anybody, so nothing was refused and
     nothing is dead. Retiring here would delete a registration because the
     SERVER was behind, which is the inverse of 0106 and just as wrong. */
  if (!transport) return false;
  return transport.isDead(result);
}

/**
 * Send one message to many devices across however many platforms they are.
 *
 * Grouped by platform so each transport still gets ONE batched call — the
 * whole reason sendToTokens takes an array is that Apple asks providers not to
 * open a connection per notification. Device order is not preserved and does
 * not matter; the caller reads results by token.
 *
 * NEVER THROWS. Both senders promise the same, and a platform with no sender
 * resolves to a refusal rather than an absence.
 */
export async function sendPush(
  devices: PushDevice[],
  message: PushMessage
): Promise<Map<string, PushSendResult>> {
  const out = new Map<string, PushSendResult>();
  if (devices.length === 0) return out;

  const byPlatform = new Map<string, string[]>();
  for (const device of devices) {
    const list = byPlatform.get(device.platform);
    if (list) list.push(device.token);
    else byPlatform.set(device.platform, [device.token]);
  }

  await Promise.all(
    [...byPlatform.entries()].map(async ([platform, tokens]) => {
      const transport = transportFor(platform);

      if (!transport) {
        for (const token of tokens) {
          out.set(token, {
            ok: false,
            status: 0,
            /* Names the platform, so the summary says WHICH unknown kind
               turned up rather than that a count did not add up. */
            reason: `NoTransportForPlatform: ${platform}`,
            platform,
            transport: null,
          });
        }
        return;
      }

      const results = await transport.send(tokens, message);
      for (const token of tokens) {
        const result = results.get(token) ?? {
          ok: false,
          status: 0,
          /* A sender that returned no entry for a token it was given. Both of
             ours fill every slot; this is the case that must not become a
             silent zero if one ever stops. */
          reason: "NoResult",
        };
        out.set(token, { ...result, platform, transport: transport.name });
      }
    })
  );

  return out;
}

/**
 * Every transport's configuration, in terms safe to show on a screen.
 *
 * Both, always, rather than only the one being tested. The failure this is for
 * is "nothing arrived on my Android phone" and the most common cause of it
 * will be that FCM has no credentials on a deployment where APNs does — which
 * is only visible if both answers are side by side.
 */
export async function describePushTransports(): Promise<Record<string, unknown>> {
  return {
    platforms: PLATFORMS,
    configuredPlatforms: configuredPlatforms(),
    apns: describeApnsConfig(),
    fcm: await describeFcmConfig(),
  };
}
