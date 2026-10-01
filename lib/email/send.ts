import "server-only";

/* ============================================================================
   EDIAGD — the one place mail leaves from

   Nothing in the app sent email before this. The Feedback screen is the first
   sender, and it goes through here so that the second and third senders have an
   obvious home rather than each reaching for Resend on their own.

   RESEND, VIA THE REST API, NOT THE SDK. One POST with a bearer token is the
   whole contract, so a dependency would be weight for nothing. Swap the fetch
   for the SDK here if a later sender needs attachments or batching; callers
   never see it.

   NO KEY IS NOT AN ERROR. On the night this ships the ediagd.ai domain may not
   be verified at Resend yet, so RESEND_API_KEY may be unset. When it is, this
   logs a single warning and returns { sent: false } — it does NOT throw. The
   caller treats email as best-effort: the feedback row and the Slack post have
   already kept the promise, and the email lands once DNS clears.
   ============================================================================ */

export type SendEmailInput = {
  to: string;
  subject: string;
  /** Plain text. The one sender today needs nothing richer. */
  text: string;
  /** Defaults to the product sender once the domain verifies. */
  from?: string;
};

export type SendEmailResult =
  | { sent: true; id: string | null }
  | { sent: false; reason: "no_key" | "error" };

const DEFAULT_FROM = "EDIAGD <feedback@ediagd.ai>";

/**
 * Send one email. Best-effort by contract: returns rather than throws, so a
 * failed or skipped send never takes down the action that called it.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    // ONE warning, no detail: the subject can name a rooftop and a person, and
    // this line goes to the server log, not a lock screen — but there is no
    // reason to spill it. The absence of the key is the whole story.
    console.warn("[email] RESEND_API_KEY is not set — email skipped (best-effort).");
    return { sent: false, reason: "no_key" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: input.from ?? DEFAULT_FROM,
        to: input.to,
        subject: input.subject,
        text: input.text,
      }),
    });
    if (!res.ok) {
      // Status and Resend's own error body are useful and carry no advisor
      // content — the subject/body were composed by us, not typed by a person.
      const detail = await res.text().catch(() => "");
      console.error(`[email] Resend returned ${res.status}: ${detail.slice(0, 300)}`);
      return { sent: false, reason: "error" };
    }
    const json = (await res.json().catch(() => null)) as { id?: string } | null;
    return { sent: true, id: json?.id ?? null };
  } catch (error) {
    console.error("[email] send failed", error);
    return { sent: false, reason: "error" };
  }
}
