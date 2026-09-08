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
  error?: string;
};

export function PushSelfTest() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function send() {
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch("/api/push/test", { method: "POST" });
      setResult((await response.json()) as Result);
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : "failed" });
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
        </div>
      )}
    </div>
  );
}
