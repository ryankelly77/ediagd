/* ============================================================================
   EDIAGD — delivery channels
   SERVER ONLY.

   Register a channel here and every notification starts flowing through it.
   Nothing else in the codebase knows how many channels exist.
   ============================================================================ */

import type {
  ChannelPreference,
  DeliveryChannel,
  DeliveryResult,
  Notification,
} from "./types";

/**
 * In-app. The row in `notification` IS the delivery — the inbox reads the
 * table — so there is nothing to send and this reports what it saw.
 *
 * It looks like a no-op because it is one. That is the useful property: if the
 * abstraction only fitted email, the seam would be in the wrong place.
 */
export const inAppChannel: DeliveryChannel = {
  name: "in_app",
  wants: (preference: ChannelPreference) =>
    preference === "in_app" || preference === "both",
  async deliver(_recipientId: string, batch: Notification[]): Promise<DeliveryResult> {
    return { channel: "in_app", delivered: batch.length, skipped: 0 };
  },
};

/**
 * Email — DECLARED, NOT IMPLEMENTED.
 *
 * Deliberately present and deliberately inert. It documents the exact shape a
 * real implementation has to take, and it means the routing, the preference
 * and the email_sent_at column are all exercised before a provider is chosen:
 * flip a user to 'both' today and the dispatcher will route to this channel and
 * report it as unavailable, rather than silently dropping their mail.
 *
 * To implement: send the batch as ONE message (never one email per row — the
 * rollup work in 0031 exists precisely so a manager gets one thing to read),
 * then stamp email_sent_at on the delivered ids.
 */
export const emailChannel: DeliveryChannel = {
  name: "email",
  wants: (preference: ChannelPreference) =>
    preference === "email" || preference === "both",
  async deliver(_recipientId: string, batch: Notification[]): Promise<DeliveryResult> {
    return {
      channel: "email",
      delivered: 0,
      skipped: batch.length,
      unavailable: "No email provider is configured yet.",
    };
  },
};

export const CHANNELS: DeliveryChannel[] = [inAppChannel, emailChannel];
