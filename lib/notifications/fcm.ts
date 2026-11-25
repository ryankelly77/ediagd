/* ============================================================================
   EDIAGD — talking to Firebase Cloud Messaging directly

   ---------------------------------------------------------------------------
   WHY NO firebase-admin
   ---------------------------------------------------------------------------
   `firebase-admin` is ~15 MB installed and pulls in Firestore, Storage, Auth
   and the whole GRPC stack to do two HTTP requests: swap a signed JWT for an
   access token, then POST a message. On a serverless function that weight is
   cold-start time on every invocation of a route that runs hourly.

   lib/notifications/apns.ts already signs its own provider JWT with
   node:crypto and talks to Apple over plain HTTP/2 for the same reason. This
   is the same posture against the other provider, and the two files are
   deliberately readable side by side.

   ---------------------------------------------------------------------------
   HTTP v1, NOT THE LEGACY ENDPOINT
   ---------------------------------------------------------------------------
   The legacy `fcm.googleapis.com/fcm/send` server-key API is retired. v1 is
   per-project, OAuth-scoped, and has ONE TOKEN PER REQUEST — there is no
   multicast in the REST API, so a batch is a loop. That is fine here: a batch
   is one person's handsets, which is one or two.

   ---------------------------------------------------------------------------
   THE PROJECT IS ANDROID'S, AND IT IS NOT iOS'S
   ---------------------------------------------------------------------------
   The shell in the Play Store carries google-services.json for `ediagd-3fcb5`
   — the Firebase project that owns the Play Console. iOS talks to Apple
   directly from apns.ts and has no Firebase project in its send path at all.
   So FCM_PROJECT_ID is Android's project and nothing here is shared with iOS:
   a service account from the wrong project returns SENDER_ID_MISMATCH for
   every token, which is why that error is mapped the way it is below.
   ============================================================================ */

import { createSign } from "node:crypto";
/*
 * THE SAME NORMALISER, NOT A SECOND ONE.
 *
 * apns.ts's normalisePrivateKey is 60 lines of commentary over a defect that
 * cost an afternoon: a PEM whose newlines died somewhere between a text
 * editor, a clipboard and an environment variable is unparseable even though
 * every character of the secret survived. A Google service-account key arrives
 * through exactly the same journey — it is PKCS#8 with the same BEGIN PRIVATE
 * KEY label, and the JSON file ships it with literal \n escapes, which is the
 * mangled case that function exists for.
 *
 * Copying it here would be a second definition that passes forever while the
 * first one learns something. It reads the PEM's label rather than assuming
 * Apple's, which is what makes it correct for this caller too.
 */
import { normalisePrivateKey } from "./apns";
import type { PushMessage, PushResult } from "./push-result";

const OAUTH_HOST = "https://oauth2.googleapis.com/token";
const FCM_HOST = "https://fcm.googleapis.com";

/** The only scope v1 needs. Narrower than cloud-platform on purpose. */
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

/**
 * Google's access tokens last an hour; renew with room to spare, exactly as
 * apns.ts does for the same reason — minting one per request is what gets a
 * provider rate-limited.
 */
const TOKEN_TTL_MS = 45 * 60 * 1000;

/**
 * A reminder is about today. One hour, matching the apns-expiration header on
 * the Apple side, so a phone that was off does not wake up to a nudge about a
 * day that has already ended.
 */
const TTL_SECONDS = 3600;

/* ---- Configuration ------------------------------------------------------- */

/**
 * PRODUCTION ONLY, AND REFUSAL IS THE DEFAULT.
 *
 * Push is a production-only feature: a Preview deploy shares the production
 * database, so a cron or a test route running there would send real
 * notifications to real advisors' phones from an unreviewed branch.
 *
 * The gate is written as "only when VERCEL_ENV says production" rather than
 * "not when it says preview", because the value is ABSENT locally and absent
 * is the case that matters. An exclusion by value exempts every row that never
 * got the value — so this one is an inclusion by value, and anything that
 * cannot prove it is production is refused.
 *
 * The one deliberate hole is named, not implied: EDIAGD_PUSH_ALLOW_NONPROD=1
 * in a terminal, which is how the emulator test in a local harness sends at
 * all. It is not read from .env; it has to be typed by a person who meant it.
 */
export function isProductionSendAllowed(): boolean {
  if (process.env.EDIAGD_PUSH_ALLOW_NONPROD === "1") return true;
  return process.env.VERCEL_ENV === "production";
}

type FcmConfig = {
  projectId: string;
  clientEmail: string;
  key: string;
};

/**
 * The three variables, read at call time rather than at module load — same
 * reasoning as apns.ts: a missing variable must produce "not configured" in a
 * response body, not a 500 with a stack trace from an import.
 */
function config(): FcmConfig | null {
  const projectId = process.env.FCM_PROJECT_ID?.trim();
  const clientEmail = process.env.FCM_CLIENT_EMAIL?.trim();
  const key = process.env.FCM_PRIVATE_KEY;
  if (!projectId || !clientEmail || !key) return null;
  return { projectId, clientEmail, key: normalisePrivateKey(key) };
}

/**
 * Configured AND allowed to send. Both, because the caller's question is never
 * "are the variables present" — it is "will a send happen", and on a Preview
 * deploy with every variable set the answer is no.
 */
export function isFcmConfigured(): boolean {
  return config() !== null && isProductionSendAllowed();
}

/* ---- The OAuth assertion -------------------------------------------------- */

const base64url = (input: Buffer | string) =>
  Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/**
 * RS256, and the default DER encoding is the correct one here.
 *
 * apns.ts needs `dsaEncoding: "ieee-p1363"` because ES256 signatures come out
 * of OpenSSL as DER and JOSE wants the raw pair. That option is an ECDSA
 * concern and must NOT be carried over: RSA signatures have one encoding, and
 * passing a dsaEncoding for an RSA key is at best ignored. Worth stating
 * because these two files are read together and the asymmetry looks like an
 * omission.
 */
function signAssertion(cfg: FcmConfig, now: number): string {
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: cfg.clientEmail,
    scope: SCOPE,
    aud: OAUTH_HOST,
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(
    JSON.stringify(claims)
  )}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  return `${signingInput}.${base64url(signer.sign(cfg.key))}`;
}

let cached: { token: string; mintedAt: number } | null = null;

/** Only for the tests: a fresh process is the only other way to clear this. */
export function resetAccessTokenCache(): void {
  cached = null;
}

/**
 * Swap the assertion for an access token, or explain why not.
 *
 * Returns a reason rather than throwing, for the reason apns.ts's providerToken
 * records: a malformed key made createPrivateKey raise, the exception escaped
 * the route handler, and Next answered 500 with an EMPTY BODY — the most
 * likely failure was the one the system could say the least about.
 */
async function accessToken(
  now: number
): Promise<{ token: string } | { reason: string }> {
  const cfg = config();
  if (!cfg) return { reason: "FcmNotConfigured" };
  if (cached && now - cached.mintedAt < TOKEN_TTL_MS) {
    return { token: cached.token };
  }

  let assertion: string;
  try {
    assertion = signAssertion(cfg, Math.floor(now / 1000));
  } catch (error) {
    /* Almost always the key itself. NEVER include cfg.key in the message. */
    return {
      reason: `KeyRejected: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  let response: Response;
  try {
    response = await fetch(OAUTH_HOST, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }).toString(),
    });
  } catch (error) {
    return {
      reason: `OAuthUnreachable: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const raw = await response.text();
  if (!response.ok) {
    /*
     * Google's error body here is `{"error":"invalid_grant",
     * "error_description":"Invalid JWT Signature."}` — short, specific, and
     * safe to surface. It is the difference between "push is broken" and "the
     * service account key was rotated".
     */
    let detail = raw.slice(0, 160);
    try {
      const parsed = JSON.parse(raw) as {
        error?: string;
        error_description?: string;
      };
      if (parsed.error) {
        detail = parsed.error_description
          ? `${parsed.error}: ${parsed.error_description}`
          : parsed.error;
      }
    } catch {
      /* Not JSON. The truncated body is more use than a generic sentence. */
    }
    return { reason: `OAuth ${response.status}: ${detail}` };
  }

  let token: string | undefined;
  try {
    token = (JSON.parse(raw) as { access_token?: string }).access_token;
  } catch {
    return { reason: "OAuthBadBody" };
  }
  if (!token) return { reason: "OAuthNoAccessToken" };

  cached = { token, mintedAt: now };
  return { token };
}

/* ---- Diagnosis ----------------------------------------------------------- */

/**
 * What is configured, in terms safe to put on a screen.
 *
 * SHAPE, never content — the same rule as describeApnsConfig, and for the same
 * reason: this exists so a paste error stops being a mystery. The client email
 * IS shown in full, deliberately: it is not a secret (it appears in the
 * project's IAM list), and the single most likely misconfiguration is a
 * service account from the WRONG PROJECT, which is invisible unless the email
 * and the project id can be read next to each other.
 */
export async function describeFcmConfig(): Promise<Record<string, unknown>> {
  const cfg = config();
  if (!cfg) {
    return {
      configured: false,
      FCM_PROJECT_ID: Boolean(process.env.FCM_PROJECT_ID),
      FCM_CLIENT_EMAIL: Boolean(process.env.FCM_CLIENT_EMAIL),
      FCM_PRIVATE_KEY: Boolean(process.env.FCM_PRIVATE_KEY),
      sendAllowedHere: isProductionSendAllowed(),
    };
  }

  const minted = await accessToken(Date.now());
  return {
    configured: true,
    sendAllowedHere: isProductionSendAllowed(),
    vercelEnv: process.env.VERCEL_ENV ?? null,
    projectId: cfg.projectId,
    clientEmail: cfg.clientEmail,
    /* The service account's own project, read out of its email rather than
       trusted to match. `…@<project>.iam.gserviceaccount.com`. */
    clientEmailProject: cfg.clientEmail.split("@")[1]?.split(".")[0] ?? null,
    projectMatchesClientEmail:
      cfg.clientEmail.includes(`@${cfg.projectId}.iam.gserviceaccount.com`),
    keyLength: cfg.key.length,
    keyHasHeader: cfg.key.includes("BEGIN PRIVATE KEY"),
    keyHasFooter: cfg.key.includes("END PRIVATE KEY"),
    keyLineCount: cfg.key.split("\n").length,
    /* A 2048-bit PKCS#8 RSA key lands around 1,700 characters. Far short of
       that is TRUNCATED rather than malformed, and no reformatting recovers
       bytes that are not there. */
    looksTruncated: cfg.key.length < 1000,
    accessToken: "token" in minted ? "minted ok" : minted.reason,
  };
}

/* ---- Sending ------------------------------------------------------------- */

/**
 * The message body for one token.
 *
 * ---------------------------------------------------------------------------
 * `notification` AND `data`, AND BOTH HALVES ARE LOAD-BEARING
 * ---------------------------------------------------------------------------
 * `notification` is what makes Android display anything when the app is not
 * running: the FCM SDK in the shell builds and posts the tray notification
 * itself. A data-only message is handed to the app instead, and the Capacitor
 * plugin does not post a notification for one — so a data-only reminder is
 * silent on a phone in somebody's pocket, which is every phone this is for.
 *
 * `data.deep_link` is what survives the tap. The plugin's handleOnNewIntent
 * copies every intent extra except google.message_id into notification.data,
 * and lib/native/bridge.ts reads exactly `data.deep_link` — the same key the
 * generator writes in 0056 and the same key the APNs payload carries. The
 * query string travels with it, which is how `?opened_via=` reaches /today and
 * becomes mark_push_opened. Without this key the notification arrives, opens
 * the app, and the open is unattributable.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS DELIBERATELY NOT SET, AND WHY, BECAUSE BOTH ARE TRAPS
 * ---------------------------------------------------------------------------
 * NO `android.notification.icon`. Build 3's launcher icon is an adaptive icon,
 * and firebase-messaging 25.0.1 refuses adaptive icons for notifications
 * outright ("Adaptive icons cannot be used in notifications. Ignoring icon
 * id:"), falling back to android.R.drawable.sym_def_app_icon — the platform's
 * generic app icon. Naming a resource here looks like the fix and is worse:
 * getSmallIcon resolves the name as a `drawable` BEFORE a `mipmap`, and the
 * only `ic_launcher_foreground` in the drawable set is the Android Studio
 * template vector the Capacitor scaffold left behind. The EDIAGD mark is the
 * mipmap of the same name. So naming it would put template artwork in the
 * status bar instead of a generic icon. The fix is a real monochrome drawable
 * plus a default_notification_icon meta-data entry, which is a new store
 * build; until then the generic icon is the honest outcome.
 *
 * NO `android.notification.channel_id`. Nothing in build 3 creates a channel,
 * and FCM's getOrCreateChannel logs "has not been created by the app" and
 * falls through to its own fcm_fallback_notification_channel either way. The
 * field would be a claim about the app that the app does not honour.
 */
function messageBody(token: string, message: PushMessage): string {
  return JSON.stringify({
    message: {
      token,
      notification: { title: message.title, body: message.body },
      data: { deep_link: message.deepLink },
      android: {
        /*
         * "high" is the FCM transport priority — deliver now rather than
         * batch with the next wakeup. This is a time-of-day message about
         * today; held until a maintenance window it is a notification about a
         * moment that has passed.
         */
        priority: "high",
        ttl: `${TTL_SECONDS}s`,
        notification: {
          /*
           * Notification.priority, which governs heads-up on API < 26. From 26
           * the CHANNEL's importance governs it, and the fallback channel is
           * created IMPORTANCE_DEFAULT — so on every phone this will actually
           * reach, the reminder lands in the shade with a sound and does not
           * pop over whatever is on screen. Set anyway: minSdk is 24, and it
           * becomes correct the moment build 4 declares a channel.
           */
          notification_priority: "PRIORITY_HIGH",
          default_sound: true,
        },
      },
    },
  });
}

/** v1 answers one token per request; keep a wide batch from opening 1,000 sockets. */
const MAX_IN_FLIGHT = 10;

/**
 * Send one message to many Android tokens.
 *
 * NEVER THROWS, for the reason sendToTokens does not: a batch must not be
 * abandoned because Google hung up on the fourth device. Every token gets a
 * result object and the caller decides what to record. A rejected token is
 * data, not an exception.
 */
export async function sendToFcmTokens(
  tokens: string[],
  message: PushMessage
): Promise<Map<string, PushResult>> {
  const results = new Map<string, PushResult>();
  if (tokens.length === 0) return results;

  const cfg = config();
  if (!cfg || !isProductionSendAllowed()) {
    const reason = !cfg
      ? "FcmNotConfigured"
      : /* Configured, refused. Named differently so the summary cannot read as
           a missing-credentials problem on a deploy that has the credentials. */
        "FcmSendNotAllowedHere";
    for (const t of tokens) results.set(t, { ok: false, status: 0, reason });
    return results;
  }

  const minted = await accessToken(Date.now());
  if (!("token" in minted)) {
    for (const t of tokens) {
      results.set(t, { ok: false, status: 0, reason: minted.reason });
    }
    return results;
  }

  const url = `${FCM_HOST}/v1/projects/${cfg.projectId}/messages:send`;
  const queue = [...tokens];

  const worker = async () => {
    for (;;) {
      const token = queue.shift();
      if (token === undefined) return;
      results.set(token, await sendOne(url, minted.token, token, message));
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(MAX_IN_FLIGHT, tokens.length) }, worker)
  );

  return results;
}

async function sendOne(
  url: string,
  accessTokenValue: string,
  token: string,
  message: PushMessage
): Promise<PushResult> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessTokenValue}`,
        "content-type": "application/json",
      },
      body: messageBody(token, message),
    });
  } catch (error) {
    /* Status 0: we never got an answer, so nothing here can mean a dead
       device. isDeadFcmToken keys on the reason strings, never on a 0. */
    return {
      ok: false,
      status: 0,
      reason: `Fetch: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const raw = await response.text();

  if (response.ok) {
    /* v1 answers `{"name":"projects/<id>/messages/<id>"}`. The message id is
       the only handle a support conversation with Google can use. */
    let providerId: string | undefined;
    try {
      const name = (JSON.parse(raw) as { name?: string }).name;
      providerId = name?.split("/").pop();
    } catch {
      /* A 200 with an unparseable body is still a 200. */
    }
    return { ok: true, status: response.status, providerId };
  }

  return { ok: false, status: response.status, reason: errorReason(raw) };
}

/**
 * The reason string, taken from the most specific place Google put it.
 *
 * v1 errors carry a google.rpc.Status with a `details` array, and the only
 * member that names an FCM condition is the FcmError one:
 *
 *   {"error":{"code":404,"status":"NOT_FOUND","message":"Requested entity was
 *     not found.","details":[{"@type":"…fcm.v1.FcmError",
 *     "errorCode":"UNREGISTERED"}]}}
 *
 * `status` ("NOT_FOUND") is the generic gRPC name and `errorCode`
 * ("UNREGISTERED") is the one that means a device is gone. Preferring the
 * generic one would make every retirement decision from a coarser signal than
 * Google actually sent.
 *
 * For INVALID_ARGUMENT the detail that matters is in a DIFFERENT member — a
 * google.rpc.BadRequest with fieldViolations — so the field name is appended
 * rather than discarded. See isDeadFcmToken for why that matters a great deal.
 */
export function errorReason(raw: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw.slice(0, 160) || "NoBody";
  }

  const error = (parsed as { error?: Record<string, unknown> }).error;
  if (!error) return raw.slice(0, 160) || "NoBody";

  const details = Array.isArray(error.details)
    ? (error.details as Record<string, unknown>[])
    : [];

  const fcmError = details.find(
    (d) => typeof d["@type"] === "string" && String(d["@type"]).includes("FcmError")
  );
  const code =
    (typeof fcmError?.errorCode === "string" ? fcmError.errorCode : null) ??
    (typeof error.status === "string" ? error.status : null) ??
    (typeof error.message === "string" ? error.message.slice(0, 120) : "Unknown");

  const badRequest = details.find(
    (d) => typeof d["@type"] === "string" && String(d["@type"]).includes("BadRequest")
  );
  const violations = Array.isArray(badRequest?.fieldViolations)
    ? (badRequest!.fieldViolations as { field?: string }[])
    : [];
  const fields = violations
    .map((v) => v.field)
    .filter((f): f is string => typeof f === "string");

  return fields.length > 0 ? `${code} (${fields.join(",")})` : code;
}

/**
 * Is this response Google telling us the device is gone for good?
 *
 * ---------------------------------------------------------------------------
 * ONLY THESE, AND THE SECOND ONE IS NARROWER THAN IT LOOKS
 * ---------------------------------------------------------------------------
 * UNREGISTERED is unambiguous: the app was uninstalled, or the token was
 * replaced. Retire it; re-registration un-retires the row.
 *
 * SENDER_ID_MISMATCH means the token was minted by a DIFFERENT Firebase
 * project. It can never be reached by this sender, so it is permanently dead
 * for us even though the handset is fine — and this project has already had
 * one project move (`ediagd-8c0a5` → `ediagd-3fcb5`), which is exactly how a
 * token like that comes to exist. Retiring with a reason that says so is
 * better than failing against it hourly forever.
 *
 * INVALID_ARGUMENT IS THE DANGEROUS ONE. FCM returns it for a malformed
 * registration token AND for a malformed message — a typo in the payload, a
 * TTL in the wrong format, a bad `android` block. Treating the bare code as
 * dead would mean one payload bug retires EVERY ANDROID TOKEN IN THE FLEET on
 * a single cron run, silently unsubscribing every working phone, and the only
 * symptom would be that Android notifications quietly stopped. So it counts
 * only when Google's own fieldViolations name `message.token`, which is the
 * difference between "your token is wrong" and "your request is wrong".
 *
 * Nothing else. UNAVAILABLE, INTERNAL and QUOTA_EXCEEDED are Google asking us
 * to come back later, and must not cost somebody their token.
 */
export function isDeadFcmToken(result: PushResult): boolean {
  if (result.ok) return false;
  const reason = result.reason ?? "";
  if (reason.startsWith("UNREGISTERED")) return true;
  if (reason.startsWith("SENDER_ID_MISMATCH")) return true;
  if (reason.startsWith("INVALID_ARGUMENT")) {
    return reason.includes("message.token");
  }
  return false;
}
