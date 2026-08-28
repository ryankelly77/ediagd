/* ============================================================================
   EDIAGD — Android App Links

   The Android half of the deep-link handshake. Simpler than Apple's: the file
   is plain JSON at a .json path, so Next serves it correctly, but it is a route
   handler anyway to keep both association files in one place and to gate on the
   fingerprint the same way.

   THE FINGERPRINT IS PER SIGNING KEY, NOT PER APP. The debug key, the local
   release key and Play App Signing all produce different SHA-256s, and a
   mismatch means links silently open the browser. All of them can be listed at
   once, which is what ANDROID_CERT_FINGERPRINTS accepts — comma-separated.

   Get the debug one with:
     keytool -list -v -keystore ~/.android/debug.keystore \
             -alias androiddebugkey -storepass android -keypass android
   ============================================================================ */

const PACKAGE_NAME = "ai.ediagd.app";

export const dynamic = "force-dynamic";

export async function GET() {
  const raw = process.env.ANDROID_CERT_FINGERPRINTS;

  if (!raw) {
    return new Response(
      JSON.stringify({
        error: "ANDROID_CERT_FINGERPRINTS is not set. App Links are not configured.",
      }),
      { status: 503, headers: { "content-type": "application/json" } }
    );
  }

  const fingerprints = raw
    .split(",")
    .map((f) => f.trim().toUpperCase())
    .filter(Boolean);

  const body = [
    {
      relation: [
        "delegate_permission/common.handle_all_urls",
        "delegate_permission/common.get_login_creds",
      ],
      target: {
        namespace: "android_app",
        package_name: PACKAGE_NAME,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=300",
    },
  });
}
