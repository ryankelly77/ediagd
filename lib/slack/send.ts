import "server-only";

/* ============================================================================
   EDIAGD — post to a Slack incoming webhook

   The same shape the marketing site's lead path uses: one POST of { text } to an
   incoming-webhook URL. The URL is a secret read from the environment by the
   caller and passed in here, so this file names no specific channel and can back
   a second webhook later without change.

   BEST-EFFORT, like the email sender. A missing URL logs one warning and returns
   { posted: false }; a failed POST logs and returns the same. It never throws,
   because the feedback row is the record and a dropped Slack message must not
   take down the action that already captured the feedback.
   ============================================================================ */

export type SlackResult =
  | { posted: true }
  | { posted: false; reason: "no_url" | "error" };

/**
 * Post plain text to a Slack incoming webhook. Returns rather than throws.
 *
 * `label` names the sender in the warning only — never the message text, which
 * for feedback carries an advisor's words and must not reach a log.
 */
export async function postToSlack(
  webhookUrl: string | undefined,
  text: string,
  label = "slack"
): Promise<SlackResult> {
  if (!webhookUrl) {
    console.warn(`[${label}] webhook URL is not set — Slack post skipped (best-effort).`);
    return { posted: false, reason: "no_url" };
  }
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      console.error(`[${label}] webhook returned ${res.status}`);
      return { posted: false, reason: "error" };
    }
    return { posted: true };
  } catch (error) {
    console.error(`[${label}] post failed`, error);
    return { posted: false, reason: "error" };
  }
}
