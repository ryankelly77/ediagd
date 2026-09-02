"use client";

/* ============================================================================
   EDIAGD — the content detail screen, on the content model

   Replaces a form that showed Type · Service · Subcategory · Tier · Title ·
   Notes · Video URL · Duration — a shape that predates quotes, collections,
   versions and Mux, and that buried the voice inside the notes field as
   "Voice: Lou Holtz".

   ---------------------------------------------------------------------------
   THE SHAPE OF THE SCREEN IS THE SHAPE OF THE MODEL
   ---------------------------------------------------------------------------
     Header      what this is, and the Mux facts, read-only
     Identity    title, voice, version, filenames
     Taxonomy    the five tags — the only editable classification
     Structure   where it surfaces, derived and read-only
     Notes       notes, now that voice has moved out of them — but on a quote
                 row `body` IS the quote, so the section renames itself
     Actions     save, publish, retire

   READ-ONLY IS A FEATURE HERE. Mux ids, dimensions, version history and
   structure are written by ingest, the webhook and the LMS. A form that could
   edit an asset id would let a typo unplayable a video that is fine, so those
   are shown and copyable and never editable.
   ============================================================================ */

import { useMemo, useState, useTransition } from "react";
import MuxPlayer from "@mux/mux-player-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/brand/Card";
import {
  CONTENT_ENTITLEMENT,
  PRODUCT_META,
} from "@/lib/content";
import {
  saveDetail,
  setPublished,
  retireContent,
  restoreVersion,
  restoreText,
  linkArtifact,
  searchLinkTargets,
  type DetailDraft,
} from "@/app/(app)/admin/content/item/[id]/actions";

export const COLLECTIONS = [
  "Mindset",
  "Pitches by Op Code",
  "Craft",
  "Onboarding",
  "Manager Meetings",
  "Joe the Pro",
] as const;

export const STAGES = [
  "Pre-Write",
  "On the Drive",
  "At the Kiosk",
  "MPI Setup",
  "After-MPI",
  "Objections",
] as const;

type OpCode = { code: string; category: string; name: string; sort_order: number };
type VersionRow = {
  version: number;
  mux_playback_id: string | null;
  source_filename: string | null;
  created_at: string;
  superseded_at: string | null;
};
/* The words as they were, from the 0083 trigger. Distinct from VersionRow
   above, which is a video take. */
type TextVersionRow = {
  seq: number;
  title: string | null;
  body: string | null;
  detail: string | null;
  title_changed: boolean;
  body_changed: boolean;
  detail_changed: boolean;
  changed_at: string;
};
type Linked = { id: string; title: string; format: string | null; status: string };
type Mux = {
  assetId: string | null; playbackId: string | null;
  verticalAssetId: string | null; verticalPlaybackId: string | null;
  durationSec: number | null; width: number | null; height: number | null;
  quality: string | null; dashboardBase: string | null;
  token: string | null; thumbnailToken: string | null; verticalToken: string | null;
  /** Which cut each device gets, in a sentence. See lib/video-rendition.ts. */
  renditionNote: string;
};
type Structure = {
  dailyLoopEligible: boolean; dailyLoopReason: string;
  module: { id: string; name: string; course: string; track: string } | null;
  onboardingPosition: string | null; saveCount: number; lastServed: string | null;
};

/* ---- Small parts --------------------------------------------------------- */

function Chip({ children, tone = "line" }: { children: React.ReactNode; tone?: "line" | "palm" | "clay" | "teal" }) {
  const bg = {
    line: "bg-cream-card text-ink-soft border-line",
    palm: "bg-palm-soft/40 text-navy border-palm/40",
    clay: "bg-clay/10 text-clay border-clay/30",
    teal: "bg-teal-soft/40 text-navy border-teal/40",
  }[tone];
  return (
    <span className={`inline-flex items-center rounded-pill border px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide ${bg}`}>
      {children}
    </span>
  );
}

/** An id you can read and copy. Links out only when the org path is configured. */
function IdRow({ label, value, href }: { label: string; value: string | null; href?: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!value) {
    return (
      <div className="flex items-baseline justify-between gap-3 py-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">{label}</span>
        <span className="text-xs text-ink-soft">—</span>
      </div>
    );
  }
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-ink-soft">{label}</span>
      <span className="flex min-w-0 items-baseline gap-2">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="truncate font-mono text-xs text-teal underline underline-offset-2">
            {value}
          </a>
        ) : (
          <span className="truncate font-mono text-xs text-ink">{value}</span>
        )}
        <button
          type="button"
          onClick={() => { navigator.clipboard?.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
          className="shrink-0 text-[11px] font-bold text-ocean"
        >
          {copied ? "copied" : "copy"}
        </button>
      </span>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-ink-soft">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-soft">{hint}</span>}
    </label>
  );
}

const input =
  "w-full rounded-xl border border-line bg-cream-card p-3 text-navy outline-none focus:ring-2 focus:ring-gold disabled:opacity-50";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="px-1 text-sm font-bold uppercase tracking-[0.18em] text-ink-soft">{title}</h2>
      <Card className="mt-2 p-5">{children}</Card>
    </section>
  );
}

/* ---- The screen ---------------------------------------------------------- */

export function ContentDetail({
  item, voices, opCodes, versions, textVersions, linked, mux, structure,
}: {
  item: Record<string, unknown>;
  voices: string[];
  opCodes: OpCode[];
  versions: VersionRow[];
  textVersions: TextVersionRow[];
  linked: Linked[];
  mux: Mux;
  structure: Structure;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const id = item.id as string;
  const isVideo = item.format === "video";
  /*
   * ON A QUOTE ROW, `body` IS THE QUOTE — NOT A NOTE ABOUT IT.
   *
   * One column, two meanings, depending on the format: for a video `body` is
   * the standing description, for a quote it is the words themselves, the ones
   * the advisor reads on step 1 of the loop. The screen was built for videos
   * and labelled the box "Notes" for everything, so Mitch would open a quote,
   * read a heading that says this is a scratchpad, and edit the live quote
   * believing he was leaving a comment.
   *
   * The fix is the label, not the field. Moving quote text to its own column
   * would fork every reader in the daily loop for no gain.
   */
  const isQuote = item.format === "quote";
  const retired = Boolean(item.retired_at);

  const [draft, setDraft] = useState<DetailDraft>({
    title: (item.title as string) ?? "",
    voice: (item.voice as string) ?? null,
    collection: (item.collection as string) ?? null,
    op_code: (item.op_code as string) ?? null,
    stage: (item.stage as string) ?? null,
    type: (item.type as string) ?? "cue",
    body: (item.body as string) ?? null,
  });
  const set = <K extends keyof DetailDraft>(k: K, v: DetailDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const needsOpCode = draft.collection === "Pitches by Op Code";
  // Live re-validation: the op-code rule is the one that changes as you pick a
  // collection, so it is answered on the screen before the DB has to refuse it.
  const opCodeMissing = needsOpCode && !draft.op_code;

  const grouped = useMemo(() => {
    const m = new Map<string, OpCode[]>();
    opCodes.forEach((o) => { const l = m.get(o.category) ?? []; l.push(o); m.set(o.category, l); });
    return [...m.entries()];
  }, [opCodes]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      setMsg(r.ok ? { tone: "ok", text: okText } : { tone: "bad", text: r.error ?? "Failed." });
      if (r.ok) router.refresh();
    });

  const gate = CONTENT_ENTITLEMENT[draft.type as keyof typeof CONTENT_ENTITLEMENT];
  const product = gate ? PRODUCT_META[gate.product] : null;

  return (
    <div className="pb-16">
      {/* ---- Header ------------------------------------------------------- */}
      <div className="mt-1 flex flex-wrap gap-2">
        {item.collection ? <Chip tone="teal">{item.collection as string}</Chip> : <Chip>No collection</Chip>}
        {item.format ? <Chip>{item.format as string}</Chip> : null}
        <Chip>v{(item.version as number) ?? 1}</Chip>
        {retired ? <Chip tone="clay">Retired</Chip>
          : item.status === "published" ? <Chip tone="palm">Published</Chip> : <Chip tone="clay">Draft</Chip>}
      </div>

      {isVideo && (
        <Section title="Mux">
          {mux.token && mux.playbackId ? (
            /*
             * mux-player, NOT a bare <video src="…m3u8">.
             *
             * Chrome cannot play HLS natively — only Safari can — so a plain
             * video element sits there loading forever, which is exactly what
             * it did: the page hung hard enough that a screenshot could not be
             * injected. mux-player ships the HLS engine and handles the signed
             * token, and it is already what the daily loop uses.
             */
            <div className="overflow-hidden rounded-xl bg-navy">
              <MuxPlayer
                playbackId={mux.playbackId}
                tokens={{ playback: mux.token, thumbnail: mux.thumbnailToken ?? undefined }}
                streamType="on-demand"
                accentColor="#0E7C7B"
                playsInline
                style={{ aspectRatio: "16 / 9", width: "100%" }}
              />
            </div>
          ) : null}

          <div className="mt-4 flex items-start gap-4">
            <div className="min-w-0 flex-1 divide-y divide-line">
              <IdRow label="Asset" value={mux.assetId} href={mux.dashboardBase && mux.assetId ? `${mux.dashboardBase}/${mux.assetId}` : null} />
              <IdRow label="Playback" value={mux.playbackId} />
              <IdRow label="Vertical asset" value={mux.verticalAssetId} href={mux.dashboardBase && mux.verticalAssetId ? `${mux.dashboardBase}/${mux.verticalAssetId}` : null} />
              <IdRow label="Vertical playback" value={mux.verticalPlaybackId} />
              {/*
                WHAT PLAYS WHERE. The rows above are ids; this is the rule they
                feed. It is here because "why is this blurry on my laptop" was a
                real question with no answer on this screen — the preview player
                above always shows the master, so the admin's own eyes could not
                catch a video the app was serving as a phone crop to everyone.
              */}
              <div className="py-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">
                  Renditions
                </span>
                <p className="mt-0.5 text-xs leading-relaxed text-ink">
                  {mux.renditionNote}
                </p>
              </div>
              <div className="flex items-baseline justify-between gap-3 py-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Format</span>
                <span className="text-xs text-ink">
                  {mux.width && mux.height ? `${mux.width}×${mux.height}` : "—"}
                  {mux.durationSec ? ` · ${Math.round(mux.durationSec)}s` : ""}
                  {mux.quality ? ` · ${mux.quality}` : ""}
                </span>
              </div>
            </div>

            {/* The 9:16 sibling, or a quiet note. Not a warning — a vertical
                that has not derived yet is a queue state, not a fault. */}
            {mux.verticalPlaybackId && mux.verticalToken ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt="Vertical rendition"
                src={`https://image.mux.com/${mux.verticalPlaybackId}/thumbnail.jpg?token=${mux.verticalToken}`}
                className="h-28 w-16 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <div className="flex h-28 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-line p-1 text-center text-[10px] leading-tight text-ink-soft">
                vertical not derived yet
              </div>
            )}
          </div>
        </Section>
      )}

      {/* ---- Identity ----------------------------------------------------- */}
      <Section title="Identity">
        <div className="space-y-4">
          <Field label="Title" hint="Required.">
            <input className={input} value={draft.title} onChange={(e) => set("title", e.target.value)} />
          </Field>

          <Field label="Voice" hint="Who is speaking. One spelling per person — pick from the list where you can.">
            <input
              className={input}
              list="ediagd-voices"
              value={draft.voice ?? ""}
              onChange={(e) => set("voice", e.target.value || null)}
              placeholder="Mitch Hardt"
            />
            <datalist id="ediagd-voices">
              {voices.map((v) => <option key={v} value={v} />)}
            </datalist>
          </Field>

          {isVideo && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Canonical filename">
                  <p className="break-all rounded-xl bg-cream-card p-3 font-mono text-xs text-ink">
                    {(item.canonical_filename as string) ?? "—"}
                  </p>
                </Field>
                <Field label="Dropped as">
                  <p className="break-all rounded-xl bg-cream-card p-3 font-mono text-xs text-ink-soft">
                    {(item.source_filename as string) ?? "—"}
                  </p>
                </Field>
              </div>

              {versions.length > 0 && (
                <details className="rounded-xl border border-line p-3">
                  <summary className="cursor-pointer text-sm font-bold text-navy">
                    History — {versions.length} version{versions.length === 1 ? "" : "s"}
                  </summary>
                  <ul className="mt-3 space-y-2">
                    {versions.map((v) => (
                      <li key={v.version} className="flex items-center justify-between gap-3 border-t border-line pt-2 text-xs">
                        <span className="min-w-0">
                          <span className="font-bold text-navy">v{v.version}</span>
                          {v.version === (item.version as number) && <span className="ml-2 text-palm">live</span>}
                          <span className="ml-2 text-ink-soft">{new Date(v.created_at).toLocaleDateString()}</span>
                          <span className="block truncate font-mono text-[11px] text-ink-soft">{v.source_filename ?? "—"}</span>
                        </span>
                        {v.version !== (item.version as number) && (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => run(() => restoreVersion(id, v.version), `v${v.version} is live.`)}
                            className="shrink-0 text-xs font-bold text-teal underline"
                          >
                            restore
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      </Section>

      {/* ---- Taxonomy ----------------------------------------------------- */}
      <Section title="Taxonomy">
        <div className="space-y-4">
          <LinkedFormats id={id} linked={linked} onDone={() => router.refresh()} />

          <Field label="Collection">
            <select
              className={input}
              value={draft.collection ?? ""}
              onChange={(e) => {
                const c = e.target.value || null;
                set("collection", c);
                // Leaving Pitches clears the op code and, with it, the stage.
                if (c !== "Pitches by Op Code") { set("op_code", null); set("stage", null); }
              }}
            >
              <option value="">No collection</option>
              {COLLECTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>

          <Field
            label="Op code"
            hint={needsOpCode ? "Required — this collection is organised by op code." : "Only for Pitches by Op Code."}
          >
            <select
              className={`${input} ${opCodeMissing ? "border-clay" : ""}`}
              disabled={!needsOpCode}
              value={draft.op_code ?? ""}
              onChange={(e) => { const v = e.target.value || null; set("op_code", v); if (!v) set("stage", null); }}
            >
              <option value="">{needsOpCode ? "Pick an op code" : "—"}</option>
              {grouped.map(([cat, list]) => (
                <optgroup key={cat} label={cat}>
                  {list.map((o) => <option key={o.code} value={o.code}>{o.code} — {o.name}</option>)}
                </optgroup>
              ))}
            </select>
          </Field>
          {opCodeMissing && (
            <p className="-mt-2 text-xs font-bold text-clay">
              A pitch needs an op code. Saving is blocked until one is set.
            </p>
          )}

          <Field label="Stage" hint="Where in the conversation. Needs an op code first.">
            <select
              className={input}
              disabled={!draft.op_code}
              value={draft.stage ?? ""}
              onChange={(e) => set("stage", e.target.value || null)}
            >
              <option value="">—</option>
              {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>

          {/*
            THE OPTIONS READ AS GATES, NOT FORMATS.
            "Advisor video" is the type value's name; this field asks which
            paywall the artifact sits behind, and answering it with a format
            makes the control read as "what kind of video is this".

            ONLY THE VIDEO TYPES ARE OFFERED, and that is what makes the gate
            labels unambiguous. Five type values collapse to three gates —
            cue, quote and advisor_video all mean advisor_base — so labelling
            every option by its gate would print "Advisor Coaching — base"
            three times with no way to tell them apart. For a video the three
            video types map one-to-one onto the three gates, so the list is
            exactly the three real answers.

            A cue or a quote has no choice to make: both are advisor_base by
            definition, so the gate is stated rather than offered.
          */}
          <Field label="Entitlement">
            {isVideo ? (
              <select className={input} value={draft.type} onChange={(e) => set("type", e.target.value)}>
                {(["advisor_video", "manager_video", "joe_the_pro"] as const).map((t) => {
                  const g = PRODUCT_META[CONTENT_ENTITLEMENT[t].product];
                  return (
                    <option key={t} value={t}>
                      {g.label} — {g.isAddon ? "add-on" : "base"}
                    </option>
                  );
                })}
              </select>
            ) : (
              <p className="rounded-xl bg-cream-card p-3 text-navy">
                {product ? `${product.label} — ${product.isAddon ? "add-on" : "base"}` : "—"}
              </p>
            )}
            {product && (
              <span className="mt-1 block text-xs text-ink-soft">
                {product.isAddon
                  ? "Paid add-on — a rooftop must have bought it."
                  : "In every subscription."}
              </span>
            )}
          </Field>
        </div>
      </Section>

      {/* ---- Structure ---------------------------------------------------- */}
      <Section title="Where it shows up">
        <ul className="space-y-3 text-sm">
          <li className="flex items-start justify-between gap-3">
            <span className="text-ink-soft">Daily loop</span>
            {/* Teal is the brand's active/positive state. palm read as a
                generic success green borrowed from somewhere else. */}
            <span className={`text-right ${structure.dailyLoopEligible ? "font-bold text-teal" : "text-ink-soft"}`}>
              {structure.dailyLoopEligible ? "In rotation" : "Not in rotation"}
              <span className="block text-xs text-ink-soft">{structure.dailyLoopReason}</span>
            </span>
          </li>
          <li className="flex items-start justify-between gap-3 border-t border-line pt-3">
            <span className="text-ink-soft">Lesson</span>
            <span className="text-right">
              {structure.module ? (
                <Link href={`/library/m/${structure.module.id}`} className="font-bold text-teal underline">
                  {structure.module.track} · {structure.module.course} · {structure.module.name}
                </Link>
              ) : (
                <span className="text-ink-soft">Not in any lesson yet</span>
              )}
              <span className="block text-xs text-ink-soft">Certifications: coming with the LMS build</span>
            </span>
          </li>
          {structure.onboardingPosition && (
            <li className="flex items-center justify-between gap-3 border-t border-line pt-3">
              <span className="text-ink-soft">Onboarding</span>
              <span className="font-bold text-navy">{structure.onboardingPosition}</span>
            </li>
          )}
          <li className="flex items-center justify-between gap-3 border-t border-line pt-3">
            <span className="text-ink-soft">Kept by advisors</span>
            <span className="font-bold text-navy">{structure.saveCount}</span>
          </li>
          <li className="flex items-center justify-between gap-3 border-t border-line pt-3">
            <span className="text-ink-soft">Last served</span>
            <span className="font-bold text-navy">{structure.lastServed ?? "—"}</span>
          </li>
        </ul>
      </Section>

      {/* ---- The words, or the notes about them ---------------------------- */}
      <Section title={isQuote ? "The quote" : "Notes"}>
        <textarea
          className={`${input} leading-relaxed`}
          rows={4}
          value={draft.body ?? ""}
          onChange={(e) => set("body", e.target.value || null)}
          placeholder={
            isQuote
              ? "The words themselves, as the advisor reads them."
              : "Anything worth knowing about this item."
          }
        />
        {isQuote ? (
          <p className="mt-2 text-sm text-ink-soft">
            This is the live text an advisor sees in the daily loop. Editing it changes the quote.
          </p>
        ) : null}

        {/*
          PREVIOUS TEXT — the words as they were before somebody replaced them.
          Collapsed, same weight as the take history in the Mux section, and in
          this section rather than its own because it is about these words.
        */}
        {textVersions.length > 0 && (
          <details className="mt-4 rounded-xl border border-line p-3">
            <summary className="cursor-pointer text-sm font-bold text-navy">
              Previous text — {textVersions.length} version
              {textVersions.length === 1 ? "" : "s"}
            </summary>
            <p className="mt-2 text-xs leading-relaxed text-ink-soft">
              Kept automatically whenever the title, body or detail changes.
              Restoring writes the old words back as a normal edit, so the
              current text is kept too and a restore can itself be undone.
            </p>
            <ul className="mt-3 space-y-3">
              {textVersions.map((v) => (
                <li key={v.seq} className="border-t border-line pt-2">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 text-xs">
                      <span className="font-bold text-navy">v{v.seq}</span>
                      <span className="ml-2 text-ink-soft">
                        {new Date(v.changed_at).toLocaleString()}
                      </span>
                      <span className="ml-2 text-ink-soft">
                        {[
                          v.title_changed ? "title" : null,
                          v.body_changed ? "body" : null,
                          v.detail_changed ? "detail" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}{" "}
                        replaced
                      </span>
                    </span>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        run(() => restoreText(id, v.seq), `v${v.seq} restored.`)
                      }
                      className="shrink-0 text-xs font-bold text-teal underline"
                    >
                      restore
                    </button>
                  </div>
                  {v.title_changed && (
                    <p className="mt-1 text-xs font-bold text-navy">{v.title ?? "—"}</p>
                  )}
                  <p className="mt-1 whitespace-pre-wrap rounded-xl bg-cream-card p-2 text-xs leading-relaxed text-ink-soft">
                    {v.body ?? "—"}
                  </p>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Section>

      {/* ---- Replace ------------------------------------------------------ */}
      {isVideo && (
        <Section title="Replace the video">
          <p className="text-sm leading-relaxed text-ink">
            Drop the new take in <span className="font-bold">00 — Drop Zone</span> with the same working
            name. Ingest matches it to this artifact and creates v{((item.version as number) ?? 1) + 1};
            the current version stays in History.
          </p>
          {item.canonical_filename ? (
            <div className="mt-3">
              <IdRow label="Match on" value={item.canonical_filename as string} />
            </div>
          ) : null}
        </Section>
      )}

      {/* ---- Actions ------------------------------------------------------ */}
      {msg && (
        <p className={`mt-5 text-sm font-bold ${msg.tone === "ok" ? "text-palm" : "text-clay"}`}>{msg.text}</p>
      )}

      <div className="mt-4 space-y-2">
        <button
          type="button"
          disabled={pending || opCodeMissing}
          onClick={() => run(() => saveDetail(id, draft), "Saved.")}
          className="w-full rounded-xl bg-clay p-4 text-base font-extrabold text-white transition hover:brightness-95 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>

        <button
          type="button"
          disabled={pending || retired}
          onClick={() => run(() => setPublished(id, item.status !== "published"), item.status === "published" ? "Unpublished." : "Published.")}
          className="w-full rounded-xl bg-navy p-4 text-base font-extrabold text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {item.status === "published" ? "Unpublish" : "Publish"}
        </button>

        {/* RETIRE, NOT DELETE. See retireContent() — a hard delete cascades
            saves, progress and open review items, and daily_completion refuses
            it outright. There is no delete path on this screen. */}
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => retireContent(id, !retired), retired ? "Back in the library." : "Retired.")}
          className="w-full rounded-xl border border-line p-4 text-base font-bold text-ink-soft transition hover:bg-cream-card disabled:opacity-50"
        >
          {retired ? "Return to the library" : "Retire"}
        </button>
        <p className="px-1 text-xs text-ink-soft">
          Retiring withdraws this from the library and unpublishes it. Nothing is deleted —
          lesson credit, saves and view history all survive, and it can be returned.
        </p>
      </div>
    </div>
  );
}

/* ---- Linked formats ------------------------------------------------------ */

/**
 * One idea, one item, however many formats.
 *
 * A quote and the video of Mitch saying it are the same artifact. The Drive
 * audit found 20 of 35 filmed takes already existed as quotes, so this is the
 * common case rather than an edge one.
 */
function LinkedFormats({ id, linked, onDone }: { id: string; linked: Linked[]; onDone: () => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ id: string; title: string; format: string | null; voice: string | null }[]>([]);
  const [pending, start] = useTransition();

  return (
    <div className="rounded-xl border border-line p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Linked formats</p>

      {linked.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {linked.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 text-sm">
              <Link href={`/admin/content/item/${l.id}`} className="min-w-0 truncate text-teal underline">
                {l.format ?? "item"} · {l.title}
              </Link>
              <button
                type="button"
                disabled={pending}
                onClick={() => start(async () => { await linkArtifact(id, null); onDone(); })}
                className="shrink-0 text-xs font-bold text-ink-soft"
              >
                unlink
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <p className="mt-1 text-xs text-ink-soft">
            No other format of this idea. If the words exist as a quote, link them.
          </p>
          <input
            className="mt-2 w-full rounded-xl border border-line bg-cream-card p-2.5 text-sm outline-none focus:ring-2 focus:ring-gold"
            placeholder="Search by title, text or voice…"
            value={q}
            onChange={(e) => {
              const v = e.target.value;
              setQ(v);
              start(async () => setHits(await searchLinkTargets(v, id)));
            }}
          />
          {hits.length > 0 && (
            <ul className="mt-2 space-y-1">
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => start(async () => { await linkArtifact(id, h.id); onDone(); })}
                    className="w-full truncate rounded-lg px-2 py-1.5 text-left text-sm text-navy hover:bg-cream-card"
                  >
                    <span className="text-ink-soft">{h.format ?? "item"}</span> · {h.title}
                    {h.voice ? <span className="text-ink-soft"> · {h.voice}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
