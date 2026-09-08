#!/usr/bin/env node
/* ============================================================================
   EDIAGD — prove the APNs key before it goes anywhere near Vercel

   ---------------------------------------------------------------------------
   WHY THIS EXISTS
   ---------------------------------------------------------------------------
   The signing key has now failed twice in a way that could not be seen from
   the phone: once because its newlines were lost, once because its middle was.
   Both times the value still LOOKED like a key — both markers present, plausible
   shape — and both times the only symptom was Apple refusing every device with
   an OpenSSL error that named none of it.

   The loop that produced that is the problem: paste a secret nobody can read
   into a form nobody can validate, deploy, cold-launch a phone, tap a button,
   read a message that does not say what is wrong. Four minutes per attempt and
   no signal about which end is at fault.

   So this closes the loop locally. It reads the file, runs the SAME
   normalisation the server runs, and then actually SIGNS something with it —
   which is the only test that means anything, because it is exactly what the
   provider token does. If this passes, the file is good and any remaining
   failure is in the transfer rather than the key.

   NOTHING SECRET IS PRINTED. Lengths, line counts, markers, curve, and a pass
   or fail. The envelope goes to the clipboard, never to the terminal, so it
   cannot end up in a scrollback buffer or a screen share.

     node scripts/check-apns-key.mjs ~/Downloads/AuthKey_XXXXXXXXXX.p8
   ============================================================================ */

import { readFileSync } from "node:fs";
import { createSign, createPrivateKey } from "node:crypto";
import { execSync } from "node:child_process";
import { basename } from "node:path";

const path = process.argv[2];
if (!path) {
  console.error("\n  usage: node scripts/check-apns-key.mjs <path-to-.p8>\n");
  process.exit(1);
}

/* The same function the server uses. Copied rather than imported because this
   is a plain .mjs run with no build step, and the server copy is TypeScript. */
function normalisePrivateKey(raw) {
  let key = raw.trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }
  if (!key.includes("-----BEGIN")) {
    try {
      const decoded = Buffer.from(key, "base64").toString("utf8");
      if (decoded.includes("-----BEGIN")) key = decoded.trim();
    } catch {
      /* not base64 */
    }
  }
  key = key.replace(/\\r/g, "").replace(/\\n/g, "\n").replace(/\r/g, "");
  const label = key.match(/-----BEGIN ([A-Z0-9 ]+)-----/)?.[1] ?? "PRIVATE KEY";
  const header = `-----BEGIN ${label}-----`;
  const footer = `-----END ${label}-----`;
  let body = key;
  const start = key.indexOf(header);
  const end = key.indexOf(footer);
  if (start !== -1 && end !== -1) body = key.slice(start + header.length, end);
  body = body.replace(/[^A-Za-z0-9+/=]/g, "");
  const wrapped = body.match(/.{1,64}/g) ?? [];
  return `${header}\n${wrapped.join("\n")}\n${footer}\n`;
}

let raw;
try {
  raw = readFileSync(path, "utf8");
} catch (error) {
  console.error(`\n  Could not read ${path}\n  ${error.message}\n`);
  process.exit(1);
}

console.log(`\n  FILE  ${basename(path)}`);
console.log(`        ${raw.length} characters, ${raw.split("\n").length} lines`);
console.log(`        header ${raw.includes("-----BEGIN") ? "yes" : "NO"}` +
            `, footer ${raw.includes("-----END") ? "yes" : "NO"}`);

const pem = normalisePrivateKey(raw);
console.log(`\n  NORMALISED  ${pem.length} characters, ${pem.split("\n").length} lines`);

/* A PKCS#8 P-256 key lands around 241 characters once canonicalised. Far short
   of that is a truncated file, which is a different problem from a malformed
   one and has a different fix. */
if (pem.length < 180) {
  console.error(
    `\n  FAIL  This file is too short to be a complete P-256 key (expected ~241\n` +
    `        characters, got ${pem.length}). The file itself is incomplete —\n` +
    `        re-download the .p8 from the Apple Developer portal.\n`
  );
  process.exit(1);
}

let key;
try {
  key = createPrivateKey(pem);
} catch (error) {
  console.error(`\n  FAIL  node:crypto will not accept this key.\n        ${error.message}\n`);
  process.exit(1);
}

const details = key.asymmetricKeyDetails ?? {};
console.log(`        type ${key.asymmetricKeyType ?? "?"}` +
            `${details.namedCurve ? `, curve ${details.namedCurve}` : ""}`);

/* The only test that means anything: sign, exactly as the provider token does.
   A P-256 ES256 signature in the JOSE encoding is always 64 bytes. */
try {
  const signer = createSign("SHA256");
  signer.update("ediagd-apns-preflight");
  signer.end();
  const signature = signer.sign({ key, dsaEncoding: "ieee-p1363" });
  if (signature.length !== 64) {
    console.error(`\n  FAIL  Signed, but produced ${signature.length} bytes rather than 64.\n` +
                  `        This is not a P-256 key and APNs will reject it.\n`);
    process.exit(1);
  }
} catch (error) {
  console.error(`\n  FAIL  The key will not sign.\n        ${error.message}\n`);
  process.exit(1);
}

const envelope = Buffer.from(pem, "utf8").toString("base64");

console.log(`\n  PASS  This key signs correctly. It is a valid APNs signing key.`);
console.log(`\n  ENVELOPE  ${envelope.length} characters, one line`);

try {
  execSync("pbcopy", { input: envelope });
  console.log(`            copied to the clipboard`);
} catch {
  console.log(`            (pbcopy unavailable — re-run and pipe it yourself)`);
}

console.log(
  `\n  Paste it into Vercel as APNS_KEY_P8. CLEAR THE FIELD FIRST — appending\n` +
  `  to a half-value is what produced the truncated key. Then redeploy.\n` +
  `\n  After pasting, the field should hold exactly ${envelope.length} characters.\n`
);
