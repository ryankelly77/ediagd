"use client";

/* ============================================================================
   EDIAGD — "did the APNs key actually work?", answerable in one tap

   Platform owner only, and it only ever sends to the person tapping it.

   The streak saver is designed to be almost impossible to trigger, which is
   correct for advisors and useless for verifying a key. Every way the transport
   can be misconfigured — wrong Key ID, a .p8 missing its BEGIN/END lines, the
   sandbox host against a TestFlight build — fails as "no notification arrived",
   which looks exactly like "nobody was eligible today".

   So this shows Apple's actual answer. A wrong key stops being a mystery and
   becomes the word InvalidProviderToken on the screen.
   ============================================================================ */

import { useState } from "react";

type Result = {
  ok?: boolean;
  reason?: string;
  devices?: number;
  results?: { device: string; ok: boolean; status: number; reason: string | null }[];
  config?: Record<string, unknown>;
  error?: string;
};

export function PushSelfTest() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function send() {
    setBusy(true);
    setResult(null);

    /*
     * READ THE BODY AS TEXT FIRST, THEN PARSE.
     *
     * The first version did `await response.json()` inside a try and showed
     * error.message, which turned every possible failure — a 500 returning an
     * HTML error page, an empty body, a redirect to /login, a blocked request —
     * into one indistinguishable sentence with no status code and no body. That
     * is not a diagnostic, it is a shrug.
     *
     * An ABSOLUTE url, too. A relative fetch inside the shell resolves against
     * whatever the webview currently considers its base, and this is the one
     * button whose whole job is to be unambiguous about what failed.
     */
    const url = `${window.location.origin}/api/push/test`;
    let status = 0;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { accept: "application/json" },
        /* Same-origin credentials explicitly: the route resolves the signed-in
           user from the session cookie, and a request without it is a 401 that
           looks like a bug. */
        credentials: "same-origin",
      });
      status = response.status;
      const raw = await response.text();

      try {
        setResult(JSON.parse(raw) as Result);
      } catch {
        setResult({
          error: `HTTP ${status} — response was not JSON: ${raw.slice(0, 200) || "(empty body)"}`,
        });
      }
    } catch (error) {
      setResult({
        error:
          `Request failed${status ? ` after HTTP ${status}` : ""} — ` +
          (error instanceof Error ? `${error.name}: ${error.message}` : String(error)) +
          ` (url: ${url})`,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 border-t border-line pt-4">
      <button
        type="button"
        onClick={send}
        disabled={busy}
        className="w-full rounded-xl border border-line p-3 text-sm font-bold text-ocean transition hover:bg-navy/5 disabled:opacity-60"
      >
        {busy ? "Sending…" : "Send me a test notification"}
      </button>

      {result && (
        <div className="mt-3 rounded-xl bg-navy/5 p-3 text-xs leading-relaxed text-navy/80">
          {result.reason || result.error ? (
            <p>{result.reason ?? result.error}</p>
          ) : (
            <>
              <p className="font-bold">
                {result.ok
                  ? `Accepted by Apple for ${result.results?.filter((r) => r.ok).length} of ${result.devices} device(s).`
                  : "Apple refused every device."}
              </p>
              {/* Per device, because "it worked" and "it worked on the handset
                  you are holding" are different facts. */}
              <ul className="mt-1 space-y-0.5">
                {result.results?.map((r) => (
                  <li key={r.device}>
                    …{r.device}: {r.ok ? "delivered" : `${r.status} ${r.reason ?? ""}`}
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* The key's SHAPE, never its content. This is what turns "Apple
              refused every device" into a sentence somebody can act on, and
              it is the difference between a diagnostic and a shrug. */}
          {result.config && (
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all border-t border-navy/10 pt-2 text-xs leading-relaxed">
              {JSON.stringify(result.config, null, 1)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
