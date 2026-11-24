/* ============================================================================
   EDIAGD — the Firebase transport and the platform router, proved offline

   ---------------------------------------------------------------------------
   WHAT THIS CAN AND CANNOT PROVE, SAID FIRST
   ---------------------------------------------------------------------------
   This suite stubs the network. It is evidence about the REQUEST this code
   builds, the token it reuses, and the retirement decisions it makes from a
   response — nothing about whether Google accepts the request or whether a
   notification appears in a shade. That needs a real service account, a real
   handset, and it is the one step listed in the PR for Ryan to watch.

   Scoped that way on purpose: every defect this file is written against is a
   defect in what we send or what we conclude, and all of those are decidable
   here. The three that would have cost the most:

     1. INVALID_ARGUMENT treated as a dead token. FCM returns it for a bad
        TOKEN and for a bad MESSAGE, so one payload bug would retire every
        Android token in the fleet on a single cron run — silently
        unsubscribing every working phone, with no symptom but silence.
     2. A send from a Preview deploy. Preview shares the production database,
        so an unreviewed branch would push to real advisors' phones.
     3. The router handing an iOS token to Google, or an Android token to
        Apple. The second one is 0106, which already happened once.

   A refusal is not self-verifying, so every gate below is proved in BOTH
   directions: it refuses the bad input AND accepts a known-good one.

     npm run test:fcm
   ============================================================================ */

import { generateKeyPairSync } from "node:crypto";
import {
  errorReason,
  isDeadFcmToken,
  isFcmConfigured,
  isProductionSendAllowed,
  resetAccessTokenCache,
  sendToFcmTokens,
} from "@/lib/notifications/fcm";
import {
  configuredPlatforms,
  isAnyTransportConfigured,
  isDeadForPlatform,
  sendPush,
  transportName,
} from "@/lib/notifications/push-send";
import {
  lintPushCopy,
  OPENED_VIA_KIND,
  PUSH_COPY,
} from "@/lib/notifications/push-copy";
import type { PushMessage } from "@/lib/notifications/push-result";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    failures.push(
      `${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
    console.log(`  FAIL  ${name}`);
  }
}

/* ---- A real key, generated here ------------------------------------------ */

/*
 * A GENUINE RSA KEY RATHER THAN A PLACEHOLDER STRING.
 *
 * The signing step is the one part of the OAuth exchange that can fail without
 * the network, and it fails on the SHAPE of the key — which is exactly the
 * defect normalisePrivateKey exists for. A fake key would make every test
 * below pass through a code path that never signed anything.
 */
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }) as string;

/*
 * The shape a Google service-account key ACTUALLY arrives in: the JSON file
 * stores the PEM with literal backslash-n, and that string is what gets pasted
 * into a Vercel variable. Using the mangled form here means the test exercises
 * normalisePrivateKey doing its job rather than being handed a clean PEM it has
 * nothing to fix.
 */
const PEM_AS_JSON_ESCAPED = PEM.replace(/\n/g, "\\n");

const PROJECT = "ediagd-3fcb5";
const CLIENT_EMAIL = `push@${PROJECT}.iam.gserviceaccount.com`;

/*
 * THE REAL COPY, NOT A PARAPHRASE OF IT.
 *
 * The first version of this file hardcoded the deep link as
 * `/today?opened_via=streak_keeper` and the suite failed, because the tag the
 * copy actually carries is `streak_saver` — the kind was renamed and the tag
 * was not, and OPENED_VIA_KIND maps one to the other on purpose. A hardcoded
 * message would have tested this file's idea of the route and passed forever
 * while the real one drifted; it would also have proved nothing about the
 * string /today keys mark_push_opened on.
 */
const COPY = PUSH_COPY.streak_keeper;
const MESSAGE: PushMessage = {
  title: COPY.title.replace("{days}", "7"),
  body: COPY.body,
  deepLink: COPY.deepLink,
};
const OPENED_VIA_TAG = new URLSearchParams(
  COPY.deepLink.split("?")[1] ?? ""
).get("opened_via");

/* ---- The stub ------------------------------------------------------------ */

type Call = { url: string; headers: Record<string, string>; body: string };

let calls: Call[] = [];
/** Queue of replies for the SEND endpoint, in order. */
let sendReplies: { status: number; body: string }[] = [];
let oauthReply: { status: number; body: string } = {
  status: 200,
  body: JSON.stringify({ access_token: "access-1", expires_in: 3599 }),
};

const realFetch = globalThis.fetch;

function installStub() {
  calls = [];
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const headers = Object.fromEntries(
      Object.entries((init?.headers ?? {}) as Record<string, string>)
    );
    calls.push({ url, headers, body: String(init?.body ?? "") });

    if (url.includes("oauth2.googleapis.com")) {
      return new Response(oauthReply.body, { status: oauthReply.status });
    }
    const reply = sendReplies.shift() ?? {
      status: 200,
      body: JSON.stringify({ name: `projects/${PROJECT}/messages/0:stub` }),
    };
    return new Response(reply.body, { status: reply.status });
  }) as typeof globalThis.fetch;
}

function restoreFetch() {
  globalThis.fetch = realFetch;
}

function configure(env: Record<string, string | undefined>) {
  for (const key of [
    "FCM_PROJECT_ID",
    "FCM_CLIENT_EMAIL",
    "FCM_PRIVATE_KEY",
    "VERCEL_ENV",
    "EDIAGD_PUSH_ALLOW_NONPROD",
    "APNS_KEY_ID",
    "APNS_TEAM_ID",
    "APNS_KEY_P8",
  ]) {
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) process.env[key] = value;
  }
  resetAccessTokenCache();
}

/** The credentials a working Production deployment has. */
const LIVE = {
  FCM_PROJECT_ID: PROJECT,
  FCM_CLIENT_EMAIL: CLIENT_EMAIL,
  FCM_PRIVATE_KEY: PEM_AS_JSON_ESCAPED,
  VERCEL_ENV: "production",
};

const sendCalls = () => calls.filter((c) => c.url.includes("fcm.googleapis.com"));
const oauthCalls = () => calls.filter((c) => c.url.includes("oauth2.googleapis.com"));

async function main() {
  installStub();

  /* ===================================================================== */
  console.log("\n  THE REQUEST FCM ACTUALLY RECEIVES\n");
  /* ===================================================================== */

  configure(LIVE);
  sendReplies = [];
  let results = await sendToFcmTokens(["tok-android-1"], MESSAGE);

  check("one send request for one token", sendCalls().length, 1);
  check(
    "the v1 per-project endpoint, with the Android project's id",
    sendCalls()[0]?.url,
    `https://fcm.googleapis.com/v1/projects/${PROJECT}/messages:send`
  );
  check(
    "bearer auth from the access token, not a legacy server key",
    sendCalls()[0]?.headers.authorization,
    "Bearer access-1"
  );

  const sent = JSON.parse(sendCalls()[0]?.body ?? "{}") as {
    message?: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  };

  check("the token is addressed singly — v1 has no multicast", sent.message?.token, "tok-android-1");
  check(
    "a notification block, which is what displays with the app closed",
    [sent.message?.notification?.title, sent.message?.notification?.body],
    [MESSAGE.title, MESSAGE.body]
  );

  /*
   * THE KEY THE SHELL READS, SPELLED THE WAY THE SHELL READS IT.
   *
   * lib/native/bridge.ts does `action.notification?.data?.deep_link`. The
   * plugin copies intent extras into notification.data verbatim, so this key
   * name is the contract between this file and that one. Wrong key: the
   * notification arrives, the tap opens the app at wherever it was, and the
   * open is unattributable forever — which is 0152's defect exactly.
   */
  check(
    "data.deep_link carries the route AND its query string, verbatim from the copy",
    sent.message?.data?.deep_link,
    COPY.deepLink
  );
  check(
    "the opened_via tag survives, so mark_push_opened can key on it",
    new URLSearchParams(
      String(sent.message?.data?.deep_link).split("?")[1] ?? ""
    ).get("opened_via"),
    OPENED_VIA_TAG
  );
  check(
    "and that tag still resolves to a kind — a /today link with no owner is an unattributable open",
    OPENED_VIA_KIND[OPENED_VIA_TAG ?? ""],
    "streak_keeper"
  );

  check("transport priority high — a nudge about today is not batched", sent.message?.android?.priority, "high");
  check(
    "one hour TTL, matching apns-expiration — not a reminder about yesterday",
    sent.message?.android?.ttl,
    "3600s"
  );

  /*
   * BOTH OF THESE ARE ABSENT ON PURPOSE AND THE ABSENCE IS THE ASSERTION.
   *
   * channel_id: nothing in versionCode 3 creates a notification channel, so
   * naming one is a claim about the app the app does not honour — FCM falls
   * through to its own fallback channel either way.
   *
   * icon: getSmallIcon resolves a name as a `drawable` BEFORE a `mipmap`, and
   * the only ic_launcher_foreground in build 3's drawable set is the Android
   * Studio template vector the Capacitor scaffold left behind. Naming it would
   * put template artwork in the status bar rather than the generic icon.
   */
  check(
    "no channel_id — build 3 creates no channel, so claiming one would be a lie",
    sent.message?.android?.notification?.channel_id,
    undefined
  );
  check(
    "no icon — the only same-named drawable in build 3 is the scaffold's template vector",
    sent.message?.android?.notification?.icon,
    undefined
  );

  check("every token gets a result", results.size, 1);
  check("a 200 is ok", results.get("tok-android-1")?.ok, true);
  check(
    "the provider's message id is kept, for a conversation with Google",
    results.get("tok-android-1")?.providerId,
    "0:stub"
  );

  /* ===================================================================== */
  console.log("\n  THE OAUTH EXCHANGE, AND THE TOKEN IT REUSES\n");
  /* ===================================================================== */

  check("one token request for the first send", oauthCalls().length, 1);
  const form = new URLSearchParams(oauthCalls()[0]?.body ?? "");
  check(
    "the JWT-bearer grant, which is what a service account uses",
    form.get("grant_type"),
    "urn:ietf:params:oauth:grant-type:jwt-bearer"
  );

  const assertion = (form.get("assertion") ?? "").split(".");
  check("the assertion is a three-part JWS", assertion.length, 3);
  const header = JSON.parse(
    Buffer.from(assertion[0] ?? "", "base64url").toString("utf8")
  ) as Record<string, string>;
  /* RS256, not ES256. apns.ts signs ES256 and needs dsaEncoding ieee-p1363;
     carrying that option over to an RSA key is the mistake this asserts
     against, because the two files are read side by side. */
  check("RS256 — a Google service account key is RSA", header.alg, "RS256");

  const claims = JSON.parse(
    Buffer.from(assertion[1] ?? "", "base64url").toString("utf8")
  ) as Record<string, string | number>;
  check("issued by the service account", claims.iss, CLIENT_EMAIL);
  check(
    "scoped to firebase.messaging alone, not cloud-platform",
    claims.scope,
    "https://www.googleapis.com/auth/firebase.messaging"
  );
  check("audience is the token endpoint", claims.aud, "https://oauth2.googleapis.com/token");
  check("the assertion expires", typeof claims.exp, "number");

  /* The key arrived with literal \n, as it does out of the JSON file. That it
     signed at all is the proof normalisePrivateKey rebuilt the PEM. */
  check("a \\n-escaped service account key still signs", assertion[2]?.length !== 0, true);

  /* Reuse. Minting a token per request is what gets a provider rate-limited,
     and it is invisible — every send still works. */
  await sendToFcmTokens(["tok-android-2"], MESSAGE);
  check("the access token is REUSED across sends, not re-minted", oauthCalls().length, 1);
  check("the second send still happened", sendCalls().length, 2);

  /* Refresh. The cache has a TTL and the only way to prove the TTL is honoured
     without waiting 45 minutes is to clear it, which is what a fresh process
     does in production. */
  resetAccessTokenCache();
  oauthReply = {
    status: 200,
    body: JSON.stringify({ access_token: "access-2", expires_in: 3599 }),
  };
  await sendToFcmTokens(["tok-android-3"], MESSAGE);
  check("an expired cache re-mints", oauthCalls().length, 2);
  check(
    "and the NEW token is the one used — a stale bearer is a silent 401",
    sendCalls()[2]?.headers.authorization,
    "Bearer access-2"
  );

  /* A refused exchange must reach the caller as a reason, not a throw. */
  resetAccessTokenCache();
  oauthReply = {
    status: 400,
    body: JSON.stringify({
      error: "invalid_grant",
      error_description: "Invalid JWT Signature.",
    }),
  };
  results = await sendToFcmTokens(["tok-a", "tok-b"], MESSAGE);
  check("a refused exchange answers for EVERY token", results.size, 2);
  check(
    "and says which half of the credential is wrong",
    results.get("tok-a")?.reason,
    "OAuth 400: invalid_grant: Invalid JWT Signature."
  );
  check(
    "status 0, because no provider was ever reached",
    results.get("tok-a")?.status,
    0
  );
  check(
    "a failed exchange sends nothing — no token is spent on a doomed POST",
    sendCalls().length,
    3
  );

  oauthReply = {
    status: 200,
    body: JSON.stringify({ access_token: "access-1", expires_in: 3599 }),
  };

  /* ===================================================================== */
  console.log("\n  WHICH ANSWERS RETIRE A DEVICE, AND WHICH MUST NOT\n");
  /* ===================================================================== */

  const fcmError = (code: number, errorCode: string) =>
    JSON.stringify({
      error: {
        code,
        status: code === 404 ? "NOT_FOUND" : "ERROR",
        message: "stub",
        details: [
          { "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode },
        ],
      },
    });

  const badRequest = (field: string) =>
    JSON.stringify({
      error: {
        code: 400,
        status: "INVALID_ARGUMENT",
        message: "Request contains an invalid argument.",
        details: [
          {
            "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError",
            errorCode: "INVALID_ARGUMENT",
          },
          {
            "@type": "type.googleapis.com/google.rpc.BadRequest",
            fieldViolations: [{ field, description: "stub" }],
          },
        ],
      },
    });

  check(
    "the FcmError errorCode is preferred over the generic gRPC status",
    errorReason(fcmError(404, "UNREGISTERED")),
    "UNREGISTERED"
  );
  check(
    "a field violation is appended rather than thrown away",
    errorReason(badRequest("message.token")),
    "INVALID_ARGUMENT (message.token)"
  );
  check(
    "an unparseable body still yields something a person can read",
    errorReason("<html>502 Bad Gateway</html>"),
    "<html>502 Bad Gateway</html>"
  );
  check("an empty body is named, not blank", errorReason(""), "NoBody");

  const dead = (status: number, reason: string) =>
    isDeadFcmToken({ ok: false, status, reason });

  check("UNREGISTERED is gone for good", dead(404, "UNREGISTERED"), true);
  check(
    "SENDER_ID_MISMATCH is gone for good — a token from the old Firebase project",
    dead(403, "SENDER_ID_MISMATCH"),
    true
  );
  check(
    "INVALID_ARGUMENT naming message.token is a dead token",
    dead(400, "INVALID_ARGUMENT (message.token)"),
    true
  );

  /*
   * THE MOST EXPENSIVE ASSERTION IN THIS FILE.
   *
   * A payload mistake — a bad ttl, a misspelled android key — comes back
   * INVALID_ARGUMENT for EVERY token in the run. Treated as dead, one bad
   * deploy retires the whole Android fleet, and the only symptom is that
   * Android notifications stop. Nothing would look for it.
   */
  check(
    "INVALID_ARGUMENT about the MESSAGE retires nobody",
    dead(400, "INVALID_ARGUMENT (message.android.ttl)"),
    false
  );
  check(
    "a bare INVALID_ARGUMENT with no field named retires nobody",
    dead(400, "INVALID_ARGUMENT"),
    false
  );
  check("UNAVAILABLE is Google asking us to come back", dead(503, "UNAVAILABLE"), false);
  check("INTERNAL is not a verdict about a phone", dead(500, "INTERNAL"), false);
  check("QUOTA_EXCEEDED is about us, not them", dead(429, "QUOTA_EXCEEDED"), false);
  check(
    "THIRD_PARTY_AUTH_ERROR is a credential problem, not a dead handset",
    dead(401, "THIRD_PARTY_AUTH_ERROR"),
    false
  );
  check(
    "a socket that never reached Google retires nobody",
    isDeadFcmToken({ ok: false, status: 0, reason: "Fetch: ECONNRESET" }),
    false
  );
  check(
    "missing credentials retire nobody — the SERVER was wrong, not the phone",
    isDeadFcmToken({ ok: false, status: 0, reason: "FcmNotConfigured" }),
    false
  );
  check("an accepted send retires nobody", isDeadFcmToken({ ok: true, status: 200 }), false);

  /* End to end through the sender, so the mapping is proved where it is used
     and not only where it is defined. */
  configure(LIVE);
  sendReplies = [
    { status: 404, body: fcmError(404, "UNREGISTERED") },
    { status: 400, body: badRequest("message.android.ttl") },
  ];
  results = await sendToFcmTokens(["gone", "payload-bug"], MESSAGE);
  check(
    "a 404 UNREGISTERED reaches the caller as a dead token",
    isDeadFcmToken(results.get("gone")!),
    true
  );
  check(
    "and a payload bug in the same batch does not",
    isDeadFcmToken(results.get("payload-bug")!),
    false
  );

  /* ===================================================================== */
  console.log("\n  PRODUCTION ONLY — THE REFUSAL AND THE ACCEPTANCE\n");
  /* ===================================================================== */

  configure({});
  check("no credentials, no transport", isFcmConfigured(), false);
  check("and no platform claims to be reachable", configuredPlatforms(), []);

  configure({ ...LIVE, VERCEL_ENV: "preview" });
  check("credentials present on Preview still refuse", isFcmConfigured(), false);
  check("isProductionSendAllowed says no on Preview", isProductionSendAllowed(), false);
  const before = sendCalls().length;
  results = await sendToFcmTokens(["tok-preview"], MESSAGE);
  check(
    "and the refusal is BEFORE the request — nothing left the deployment",
    sendCalls().length,
    before
  );
  check(
    "named apart from missing credentials, which it is not",
    results.get("tok-preview")?.reason,
    "FcmSendNotAllowedHere"
  );

  configure({ ...LIVE, VERCEL_ENV: undefined });
  check("absent VERCEL_ENV refuses too — local is not production", isFcmConfigured(), false);

  /*
   * THE ACCEPTANCE HALF, which is the one that gets skipped and the one that
   * catches a gate that refuses everything. A guard that always said no would
   * pass every test above it.
   */
  configure({ ...LIVE, VERCEL_ENV: "production" });
  check("Production accepts", isFcmConfigured(), true);
  sendReplies = [];
  const beforeProd = sendCalls().length;
  results = await sendToFcmTokens(["tok-prod"], MESSAGE);
  check("and sends", sendCalls().length, beforeProd + 1);
  check("with a real result", results.get("tok-prod")?.ok, true);

  configure({ ...LIVE, VERCEL_ENV: undefined, EDIAGD_PUSH_ALLOW_NONPROD: "1" });
  check(
    "the named local override works, so the emulator test is possible",
    isFcmConfigured(),
    true
  );

  /* ===================================================================== */
  console.log("\n  THE ROUTER — ONE PLATFORM PER PROVIDER, AND NO SILENT DROPS\n");
  /* ===================================================================== */

  check("ios goes to Apple", transportName("ios"), "apns");
  check("android goes to Firebase", transportName("android"), "fcm");
  check("an unknown platform has no transport", transportName("web"), null);

  /*
   * APNs IS LEFT UNCONFIGURED HERE DELIBERATELY, and that is what makes this
   * test prove routing rather than assume it. An iOS token comes back
   * "ApnsNotConfigured" — a string only apns.ts produces — and the FCM stub
   * records which tokens reached Google. If the router crossed the wires,
   * either the Android token would come back with Apple's reason or the stub
   * would have seen the iOS one.
   */
  configure({ ...LIVE, VERCEL_ENV: "production" });
  check("only android is reachable from this configuration", configuredPlatforms(), ["android"]);
  check("but there IS a transport, so the cron proceeds", isAnyTransportConfigured(), true);

  calls = [];
  sendReplies = [];
  const mixed = await sendPush(
    [
      { token: "iphone-1", platform: "ios" },
      { token: "android-1", platform: "android" },
      { token: "android-2", platform: "android" },
    ],
    MESSAGE
  );

  check("one result per device", mixed.size, 3);
  check("the iPhone was routed to Apple", mixed.get("iphone-1")?.transport, "apns");
  check(
    "and Apple is the one that answered it",
    mixed.get("iphone-1")?.reason,
    "ApnsNotConfigured"
  );
  check("the Android handsets were routed to Firebase", mixed.get("android-1")?.transport, "fcm");
  check(
    "Google saw both Android tokens and NEITHER iOS one",
    sendCalls()
      .map((c) => (JSON.parse(c.body) as { message: { token: string } }).message.token)
      .sort(),
    ["android-1", "android-2"]
  );
  check("both Android sends were accepted", [
    mixed.get("android-1")?.ok,
    mixed.get("android-2")?.ok,
  ], [true, true]);
  check(
    "each result carries its platform, so a delivery row can say what it was",
    [mixed.get("iphone-1")?.platform, mixed.get("android-1")?.platform],
    ["ios", "android"]
  );

  /*
   * A PLATFORM WITH NO SENDER IS REPORTED, NOT FILTERED OUT.
   *
   * This is the codebase's most-repeated defect — a fixed list that is silent
   * about what it does not recognise, which on a summary reads as success. If
   * push_platform ever gains a value, the row must come back with a reason
   * naming it rather than vanish from a count.
   */
  const unknown = await sendPush(
    [
      { token: "web-1", platform: "web" as unknown as "ios" },
      { token: "android-9", platform: "android" },
    ],
    MESSAGE
  );
  check("the unknown platform still gets a result", unknown.size, 2);
  check(
    "and the reason names it, so a summary can say which",
    unknown.get("web-1")?.reason,
    "NoTransportForPlatform: web"
  );
  check("with no transport claimed", unknown.get("web-1")?.transport, null);
  check(
    "and it does not stop the platform that does have one",
    unknown.get("android-9")?.ok,
    true
  );

  /* Dead-token questions go to the right provider. The two vocabularies look
     alike and mean different things, and asking the wrong one is how a working
     phone gets retired. */
  check(
    "Apple's word is not asked of Google",
    isDeadForPlatform("android", { ok: false, status: 410, reason: "Unregistered" }),
    false
  );
  check(
    "Google's word is not asked of Apple",
    isDeadForPlatform("ios", { ok: false, status: 404, reason: "UNREGISTERED" }),
    false
  );
  check(
    "each provider's own word is honoured",
    [
      isDeadForPlatform("ios", { ok: false, status: 410, reason: "Unregistered" }),
      isDeadForPlatform("android", { ok: false, status: 404, reason: "UNREGISTERED" }),
    ],
    [true, true]
  );
  check(
    "an unroutable platform retires nobody",
    isDeadForPlatform("web", {
      ok: false,
      status: 0,
      reason: "NoTransportForPlatform: web",
    }),
    false
  );

  /* ===================================================================== */
  console.log("\n  THE COPY IS UNCHANGED AND STILL LEGAL\n");
  /* ===================================================================== */

  const problems = lintPushCopy();
  check("lintPushCopy finds nothing", problems, []);
  check(
    "every /today reminder still has an owner for its tag",
    Object.values(PUSH_COPY)
      .filter((c) => c.deepLink.startsWith("/today"))
      .map((c) =>
        Boolean(
          OPENED_VIA_KIND[
            new URLSearchParams(c.deepLink.split("?")[1] ?? "").get("opened_via") ?? ""
          ]
        )
      ),
    [true, true, true, true]
  );

  restoreFetch();

  /* ---- The summary, computed from what happened ------------------------- */
  console.log(`\n  ${passed + failed} checks, ${failed} failed\n`);
  if (failures.length > 0) {
    for (const line of failures) console.log(`  * ${line}`);
    console.log("");
  }
  /* The exit code is a function of the failure count, not a closing line that
     prints either way. See AGENTS.md on ingest-videos.ts exiting 0 on 102
     failures. */
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  restoreFetch();
  console.error("  HARNESS FAILED:", error);
  process.exit(1);
});
