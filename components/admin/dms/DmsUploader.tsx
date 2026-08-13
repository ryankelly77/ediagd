"use client";

/* ============================================================================
   EDIAGD — upload a DMS workbook

   THE PREVIEW IS THE POINT. Uploading parses and stages; it does not import.
   The admin sees what WOULD happen — which rooftops are about to be created,
   how many rows are about to be replaced, which sub-categories nobody has
   mapped — and then commits deliberately, or walks away.

   That split matters more here than on most screens. This file carries eleven
   stores at once, and the failure mode of a bad import is not an error message,
   it is silently wrong numbers on somebody's performance screen a month later.
   ============================================================================ */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/brand/Card";
import {
  commitImport,
  discardImport,
  previewImport,
  type CommitResult,
  type ImportPreview,
} from "@/lib/dms/import-actions";

export function DmsUploader() {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [stage, setStage] = useState<"idle" | "parsing" | "preview" | "done">("idle");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onUpload(form: FormData) {
    setError(null);
    setStage("parsing");
    try {
      const p = await previewImport(form);
      setPreview(p);
      setStage("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
      setStage("idle");
    }
  }

  function onCommit() {
    if (!preview) return;
    setError(null);
    startTransition(async () => {
      try {
        const r = await commitImport(preview.importId);
        setResult(r);
        setStage("done");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Commit failed.");
      }
    });
  }

  function onDiscard() {
    if (!preview) return;
    startTransition(async () => {
      await discardImport(preview.importId);
      setPreview(null);
      setStage("idle");
      router.refresh();
    });
  }

  /* ---- 1. Pick a file --------------------------------------------------- */
  if (stage === "idle" || stage === "parsing") {
    return (
      <Card className="mt-4 p-5">
        <p className="ediagd-eyebrow">Step one</p>
        <h2 className="mt-1 text-lg font-extrabold text-navy">
          Upload the workbook
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          One tab per report date. Nothing is imported yet — you&apos;ll see
          exactly what it would change before anything happens.
        </p>

        <form action={onUpload} className="mt-4">
          <input
            type="file"
            name="file"
            required
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            /*
              min-w-0 + truncate: the browser prints the chosen filename beside
              the button, and these names run to 48 characters with no spaces
              ("Doggett_Key_Maintenance_Sales_2026_04_April.xlsx"), so without
              a min-width of zero the flex item refuses to shrink and the name
              runs off the screen edge.
            */
            className="block w-full min-w-0 truncate text-sm text-ink-soft file:mr-3 file:min-h-[2.75rem] file:rounded-xl file:border file:border-line file:bg-surface-card file:px-4 file:text-sm file:font-extrabold file:text-navy"
          />
          <button
            type="submit"
            disabled={stage === "parsing"}
            className="mt-4 flex min-h-[3rem] w-full items-center justify-center rounded-xl bg-gold px-5 text-sm font-extrabold text-navy transition hover:brightness-95 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            {stage === "parsing" ? "Reading the workbook…" : "Upload and preview"}
          </button>
        </form>

        {error && <Problem>{error}</Problem>}
      </Card>
    );
  }

  /* ---- 3. Committed ------------------------------------------------------ */
  if (stage === "done" && result) {
    return (
      <Card className="mt-4 p-5">
        <p className="ediagd-eyebrow">Imported</p>
        <h2 className="mt-1 text-lg font-extrabold text-navy">
          {result.metricRowsInserted.toLocaleString()} rows are in
        </h2>
        <dl className="mt-4 space-y-1.5">
          <Line label="Rooftops created" value={result.rooftopsCreated} />
          <Line label="Advisors added or refreshed" value={result.advisorsUpserted} />
          <Line label="Rows replaced" value={result.metricRowsDeleted} />
          <Line label="Rows written" value={result.metricRowsInserted} />
          <Line label="Advisor day-totals written" value={result.advisorTotalsInserted} />
          <Line
            label="Monthly periods retired"
            value={result.monthlyPeriodsSuperseded}
          />
          <Line label="Sub-category mappings seeded" value={result.subCategoriesSeeded} />
          <Line label="Months rebuilt into periods" value={result.periodsRebuilt} />
          <Line
            label="Sub-categories still unmapped"
            value={result.unmappedSubCategories}
            hint="the preview projected the same figure"
          />
          <Line label="Rows under an unmapped sub-category" value={result.unmappedRows} />
        </dl>
        <button
          type="button"
          onClick={() => {
            setStage("idle");
            setPreview(null);
            setResult(null);
          }}
          className="mt-5 flex min-h-[2.75rem] w-full items-center justify-center rounded-xl border border-line px-5 text-sm font-extrabold text-navy transition hover:bg-teal-soft/20"
        >
          Upload another
        </button>
      </Card>
    );
  }

  /* ---- 2. The preview ---------------------------------------------------- */
  if (!preview) return null;

  const creating = preview.rooftops.filter((r) => r.action === "will create");
  const matched = preview.rooftops.filter((r) => r.action === "matched");
  const newAdvisors = preview.advisors.filter((a) => a.action === "will create");
  // Projected post-commit, by the same function the result screen's numbers
  // are read back from — so the two cannot disagree.
  const unmapped = preview.subCategories.filter((s) => s.status === "unmapped");
  const unmappedRows = preview.unmappedRows;

  return (
    <div className="mt-4 space-y-3">
      <Card className="p-5">
        <p className="ediagd-eyebrow">Step two — nothing has been imported yet</p>
        {/* One unbroken 48-character token. `truncate` keeps the card the width
            of the screen and `title` keeps the full name reachable. */}
        <h2
          className="mt-1 truncate text-lg font-extrabold text-navy"
          title={preview.fileName}
        >
          {preview.fileName}
        </h2>
        <p className="ediagd-numeral mt-1 text-sm text-ink-soft">
          {preview.coversFrom} → {preview.coversTo} · {preview.dates.length} report
          dates
        </p>

        {preview.alreadyCommitted && (
          <Note>
            This exact file was already imported on{" "}
            {new Date(preview.alreadyCommitted.committedAt).toLocaleDateString()}.
            Committing again replaces the same days with the same numbers — it
            changes nothing, but there is no need.
          </Note>
        )}

        <dl className="mt-4 space-y-1.5">
          <Line label="Rows in the file" value={preview.counts.totalRows} />
          <Line
            label="Subtotal rows filtered out"
            value={preview.counts.rollupRows}
            hint="the report's own 'All …' rows — summing these double-counts"
          />
          <Line label="Detail rows to import" value={preview.counts.detailRows} strong />
          <Line
            label="Advisor day-totals kept"
            value={preview.counts.advisorTotalRows}
            hint="the only source of unique RO counts"
          />
          <Line
            label="Existing rows this replaces"
            value={preview.counts.replacingRows}
          />
        </dl>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-extrabold text-navy">
          Rooftops · {matched.length} matched, {creating.length} to create
        </h3>
        <ul className="mt-2 divide-y divide-line">
          {preview.rooftops.map((r) => (
            <li
              key={r.dealerName}
              className="flex items-center gap-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 truncate text-navy">
                {r.dealerName}
              </span>
              <span className="ediagd-numeral text-xs text-ink-soft">
                {r.rows.toLocaleString()}
              </span>
              <Tag tone={r.action === "matched" ? "calm" : "new"}>{r.action}</Tag>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-extrabold text-navy">
          Advisors · {preview.advisors.length - newAdvisors.length} matched,{" "}
          {newAdvisors.length} to create
        </h3>
        {newAdvisors.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm text-ink-soft">
            {newAdvisors.slice(0, 12).map((a) => (
              <li key={`${a.dealer}|${a.opId}`} className="truncate">
                <span className="ediagd-numeral font-bold text-navy">{a.opId}</span>{" "}
                {a.name} · {a.dealer}
              </li>
            ))}
            {newAdvisors.length > 12 && (
              <li className="text-xs">and {newAdvisors.length - 12} more</li>
            )}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-extrabold text-navy">
          {`Sub-categories · ${preview.subCategories.length - unmapped.length - preview.notCoachableSubCategories} mapped, ${preview.unmappedSubCategories} unmapped, ${preview.notCoachableSubCategories} not coachable`}
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-ink-soft">
          {`${unmappedRows.toLocaleString()} rows sit under a sub-category with no family yet. They import either way — they just won’t appear in attach rates until somebody maps them.`}
        </p>
        {unmapped.length > 0 && (
          <ul className="mt-3 divide-y divide-line">
            {unmapped.slice(0, 10).map((s) => (
              <li key={s.name} className="flex items-center gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-navy">{s.name}</span>
                <span className="ediagd-numeral text-xs text-ink-soft">
                  {s.rows.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {preview.supersedes.length > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-extrabold text-navy">
            Monthly periods this covers
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            These came from the older monthly report. Any that this file fully
            covers will be retired so the same month isn&apos;t counted twice.
          </p>
          <ul className="mt-2 space-y-1 text-sm text-navy">
            {preview.supersedes.map((s) => (
              <li key={`${s.rooftop}${s.from}`}>
                {s.rooftop} · {s.label} ({s.from} → {s.to})
              </li>
            ))}
          </ul>
        </Card>
      )}

      {preview.warnings.length > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-extrabold text-navy">Worth reading</h3>
          <ul className="mt-2 space-y-1 text-xs leading-relaxed text-ink-soft">
            {preview.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Card>
      )}

      {error && (
        <Card className="p-5">
          <Problem>{error}</Problem>
        </Card>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCommit}
          disabled={busy}
          className="flex min-h-[3rem] flex-1 items-center justify-center rounded-xl bg-gold px-5 text-sm font-extrabold text-navy transition hover:brightness-95 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          {busy ? "Importing…" : `Import ${preview.counts.detailRows.toLocaleString()} rows`}
        </button>
        <button
          type="button"
          onClick={onDiscard}
          disabled={busy}
          className="flex min-h-[3rem] items-center justify-center rounded-xl border border-line px-5 text-sm font-extrabold text-navy transition hover:bg-teal-soft/20 disabled:opacity-60"
        >
          Discard
        </button>
      </div>
    </div>
  );
}

/* ---- small parts --------------------------------------------------------- */

function Line({
  label,
  value,
  hint,
  strong,
}: {
  label: string;
  value: number;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-sm text-ink-soft">
        {label}
        {hint && <span className="block text-[11px] leading-snug">{hint}</span>}
      </dt>
      <dd
        className={`ediagd-numeral shrink-0 ${strong ? "text-lg font-extrabold text-navy" : "text-sm font-bold text-navy"}`}
      >
        {value.toLocaleString()}
      </dd>
    </div>
  );
}

function Tag({ children, tone }: { children: React.ReactNode; tone: "calm" | "new" }) {
  return (
    <span
      className="shrink-0 rounded-pill px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide"
      style={
        tone === "calm"
          ? {
              background: "color-mix(in srgb, rgb(var(--ediagd-palm)) 16%, transparent)",
              color: "rgb(var(--ediagd-palm))",
            }
          : {
              background: "color-mix(in srgb, rgb(var(--ediagd-teal)) 16%, transparent)",
              color: "rgb(var(--ediagd-ocean))",
            }
      }
    >
      {children}
    </span>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="mt-3 rounded-card px-3 py-2 text-xs leading-relaxed"
      style={{
        background: "color-mix(in srgb, rgb(var(--ediagd-teal)) 10%, transparent)",
        color: "rgb(var(--ediagd-ink))",
      }}
    >
      {children}
    </p>
  );
}

function Problem({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="mt-3 rounded-card px-3 py-2 text-xs font-bold leading-relaxed"
      style={{
        background: "color-mix(in srgb, rgb(var(--ediagd-clay)) 12%, transparent)",
        color: "rgb(var(--ediagd-clay))",
      }}
    >
      {children}
    </p>
  );
}
