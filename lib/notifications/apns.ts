/* ============================================================================
   EDIAGD — talking to Apple directly

   ---------------------------------------------------------------------------
   WHY NO PROVIDER
   ---------------------------------------------------------------------------
   A push provider is a company that holds the key to every EDIAGD phone, adds a
   monthly bill, and gives us a second place for a delivery to go missing. What
   it buys is a REST call instead of an HTTP/2 one, plus Android and web push we
   are not shipping. This file is the whole of what it would have replaced.

   ---------------------------------------------------------------------------
   TOKEN AUTH, NOT CERTIFICATES
   ---------------------------------------------------------------------------
   The .p8 key does not expire, works for every app under the team, and covers
   both APNs environments. A certificate expires annually and takes push down on
   a date nobody has in a calendar. So: a signed JWT, regenerated well inside
   Apple's one-hour limit and reused across a batch — Apple rate-limits providers
   that mint a fresh token per request.

   ---------------------------------------------------------------------------
   PRODUCTION HOST, INCLUDING FOR TESTFLIGHT
   ---------------------------------------------------------------------------
   This is the trap in Apple's own documentation. A TestFlight build is signed
   for DISTRIBUTION, so its tokens are production tokens and the sandbox host
   rejects them with BadDeviceToken. Only a build installed from Xcode onto an
   attached device is sandbox. Development is opt-in via APNS_SANDBOX, and the
   default is the one that is right for everybody Ryan will actually test with.
   ============================================================================ */

import { createSign, createPrivateKey } from "node:crypto";
import http2 from "node:http2";

const PRODUCTION_HOST = "https://api.push.apple.com";
const SANDBOX_HOST = "https://api.sandbox.push.apple.com";

/** The shell's bundle id. APNs calls this the topic. */
export const APNS_TOPIC = "ai.ediagd.app";

/** Apple rejects tokens older than an hour; renew with room to spare. */
const TOKEN_TTL_MS = 45 * 60 * 1000;

export type ApnsResult = {
  ok: boolean;
  status: number;
  /** Apple's machine-readable reason, e.g. "Unregistered", "BadDeviceToken". */
  reason?: string;
  /** Apple's id for the delivery, for a support conversation with them. */
  apnsId?: string;
};

export type ApnsMessage = {
  title: string;
  body: string;
  /** In-app route the tap lands on. Read by the listener in lib/native/bridge. */
  deepLink: string;
};

/**
 * The three secrets, read at call time rather than at module load.
 *
 * At module load a missing variable would crash the whole route on import, and
 * the route has work to do — generating the outbox — that does not need Apple
 * at all. Reading here means a misconfigured environment produces a clear
 * "not configured" in the response instead of a 500 with a stack trace.
 */
function config() {
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const key = process.env.APNS_KEY_P8;
  if (!keyId || !teamId || !key) return null;
  return {
    keyId,
    teamId,
    /* Vercel's UI keeps the newlines, but a value pasted through a shell may
       arrive with them escaped. Both are accepted rather than leaving somebody
       to debug an "invalid key" against an invisible difference. */
    key: key.includes("\\n") ? key.replace(/\\n/g, "\n") : key,
    host: process.env.APNS_SANDBOX === "1" ? SANDBOX_HOST : PRODUCTION_HOST,
  };
}

export function isApnsConfigured(): boolean {
  return config() !== null;
}

/* ---- The JWT -------------------------------------------------------------- */

const base64url = (input: Buffer | string) =>
  Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/**
 * ES256 signatures come out of OpenSSL as DER and JOSE wants the raw pair.
 *
 * node:crypto will do the conversion itself given `dsaEncoding: "ieee-p1363"`,
 * which is the whole reason this is three lines rather than a DER parser. The
 * option is easy to miss and the failure it prevents is a 403 InvalidProviderToken
 * with nothing to indicate the signature shape was the problem.
 */
function sign(payload: object, header: object, privateKeyPem: string): string {
  const signingInput =
    `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signer = createSign("SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign({
    key: createPrivateKey(privateKeyPem),
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${base64url(signature)}`;
}

let cached: { token: string; mintedAt: number } | null = null;

/**
 * Mints the provider JWT, or explains why it cannot.
 *
 * Returns a reason instead of throwing because the throw was the bug: a
 * malformed .p8 made createPrivateKey raise, the exception escaped the route
 * handler, and Next answered with a 500 and an EMPTY BODY. From the outside
 * that is indistinguishable from a crash, a timeout, or a bad deploy — the one
 * failure this whole feature is most likely to hit was also the one it could
 * say the least about.
 */
function providerToken(): { token: string } | { reason: string } {
  const cfg = config();
  if (!cfg) return { reason: "ApnsNotConfigured" };
  if (cached && Date.now() - cached.mintedAt < TOKEN_TTL_MS) {
    return { token: cached.token };
  }

  try {
    const token = sign(
      { iss: cfg.teamId, iat: Math.floor(Date.now() / 1000) },
      { alg: "ES256", kid: cfg.keyId },
      cfg.key
    );
    cached = { token, mintedAt: Date.now() };
    return { token };
  } catch (error) {
    /* Almost always the key itself: pasted without its BEGIN/END lines, or
       with the newlines flattened. Never include cfg.key in the message. */
    return {
      reason: `KeyRejected: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * What is configured, in terms safe to show on a screen.
 *
 * Deliberately reports SHAPE, never content: whether each variable is present,
 * how long the key is, whether it has the PEM header and footer, and whether
 * node:crypto will actually accept it. That is everything needed to diagnose a
 * paste error and nothing that would leak the key.
 */
export function describeApnsConfig(): Record<string, unknown> {
  const cfg = config();
  if (!cfg) {
    return {
      configured: false,
      APNS_KEY_ID: Boolean(process.env.APNS_KEY_ID),
      APNS_TEAM_ID: Boolean(process.env.APNS_TEAM_ID),
      APNS_KEY_P8: Boolean(process.env.APNS_KEY_P8),
    };
  }
  const minted = providerToken();
  return {
    configured: true,
    host: cfg.host,
    keyIdLength: cfg.keyId.length,
    teamId: cfg.teamId,
    keyLength: cfg.key.length,
    keyHasHeader: cfg.key.includes("BEGIN PRIVATE KEY"),
    keyHasFooter: cfg.key.includes("END PRIVATE KEY"),
    keyLineCount: cfg.key.split("\n").length,
    jwt: "token" in minted ? "minted ok" : minted.reason,
  };
}

/* ---- Sending -------------------------------------------------------------- */

/**
 * Send one message to many device tokens over a single HTTP/2 connection.
 *
 * ONE CONNECTION FOR THE BATCH. Apple explicitly asks providers not to open a
 * connection per notification, and on a serverless function the handshake costs
 * more than the sends do.
 *
 * NEVER THROWS. A batch of thirty must not be abandoned because Apple hung up
 * on the fourth; every device gets a result object and the caller decides what
 * to record. A rejected token is data, not an exception.
 */
export async function sendToTokens(
  tokens: string[],
  message: ApnsMessage
): Promise<Map<string, ApnsResult>> {
  const results = new Map<string, ApnsResult>();
  const cfg = config();
  const minted = providerToken();

  if (!cfg || !("token" in minted)) {
    const reason = !cfg
      ? "ApnsNotConfigured"
      : (minted as { reason: string }).reason;
    for (const t of tokens) results.set(t, { ok: false, status: 0, reason });
    return results;
  }
  const jwt = minted.token;
  if (tokens.length === 0) return results;

  const payload = JSON.stringify({
    aps: {
      alert: { title: message.title, body: message.body },
      sound: "default",
    },
    /* Read by pushNotificationActionPerformed in lib/native/bridge.ts. The key
       matches what the generator writes in 0056. */
    deep_link: message.deepLink,
  });

  const client = http2.connect(cfg.host);

  /* A connection-level failure is every token's failure, not a thrown error. */
  const connectionError = new Promise<Error | null>((resolve) => {
    client.once("error", (err) => resolve(err));
    client.once("connect", () => resolve(null));
  });

  const failed = await connectionError;
  if (failed) {
    client.close();
    for (const t of tokens) {
      results.set(t, { ok: false, status: 0, reason: `Connect: ${failed.message}` });
    }
    return results;
  }

  await Promise.all(
    tokens.map(
      (token) =>
        new Promise<void>((resolve) => {
          const req = client.request({
            ":method": "POST",
            ":path": `/3/device/${token}`,
            authorization: `bearer ${jwt}`,
            "apns-topic": APNS_TOPIC,
            "apns-push-type": "alert",
            /* 10 = deliver now. This is a time-of-day message about today; at
               priority 5 iOS may hold it past the moment it is about. */
            "apns-priority": "10",
            /* Expire at the end of the hour rather than never. A streak nudge
               that arrives tomorrow morning because a phone was off is a
               notification about a day that has already ended. */
            "apns-expiration": String(Math.floor(Date.now() / 1000) + 3600),
            "content-type": "application/json",
          });

          let status = 0;
          let apnsId: string | undefined;
          let raw = "";

          req.on("response", (headers) => {
            status = Number(headers[":status"] ?? 0);
            apnsId = headers["apns-id"] as string | undefined;
          });
          req.on("data", (chunk) => (raw += chunk));
          req.on("end", () => {
            let reason: string | undefined;
            if (raw) {
              try {
                reason = (JSON.parse(raw) as { reason?: string }).reason;
              } catch {
                reason = raw.slice(0, 120);
              }
            }
            results.set(token, { ok: status === 200, status, reason, apnsId });
            resolve();
          });
          req.on("error", (err) => {
            results.set(token, { ok: false, status: 0, reason: err.message });
            resolve();
          });

          req.end(payload);
        })
    )
  );

  client.close();
  return results;
}

/**
 * Is this response Apple telling us the device is gone for good?
 *
 * Only these. A 429 or a 503 is Apple asking us to come back later and must NOT
 * cost somebody their token — retiring on a transient failure would silently
 * unsubscribe a working phone, and nothing in the product would ever say so.
 */
export function isDeadToken(result: ApnsResult): boolean {
  if (result.status === 410) return true;
  return result.reason === "Unregistered" || result.reason === "BadDeviceToken";
}
