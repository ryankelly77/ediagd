import type { ServiceCue } from "@/lib/daily";

/* ============================================================================
   EDIAGD — one coaching cue, rendered

   The content table holds TWO shapes, and a cue card that assumes either one
   looks broken on the other:

     A) title = a short name ("Stopping Distance"), body = the sentence to say.
        This is the shape the CMS is built for. ~43% of published cues.

     B) title = a 200-character slab of body copy, hard-truncated mid-word by
        the import, and body = an editor's note ("cite the 8 ft / 13 ft stat").
        ~57% of published cues — see the import bug noted in BADGES/README work.

   So the heading is only rendered when the title is actually title-shaped.
   Otherwise the long text becomes the prose and the note sits under it, which
   reads as deliberate rather than as a bug.
   ============================================================================ */

/** Longer than this and it isn't a title, it's body copy in the wrong column. */
const TITLE_MAX = 90;

export function CueCard({ cue, badge }: { cue: ServiceCue; badge?: string }) {
  const title = cue.title.trim();
  const heading = title.length <= TITLE_MAX ? title : null;

  // Shape A: heading + body. Shape B: the long title IS the content, and the
  // body is a short directive that reads well as a closing takeaway.
  const prose = heading ? cue.body : title;
  const takeaway = heading ? null : cue.body;

  return (
    <div className="rounded-card border border-line bg-cream-card p-4">
      {badge && (
        <span className="mb-2 inline-block rounded-pill bg-gold-soft px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-navy">
          {badge}
        </span>
      )}

      {heading && (
        <p className="text-base font-extrabold leading-snug text-navy">
          {heading}
        </p>
      )}

      {prose && (
        <p
          className={`whitespace-pre-line leading-relaxed ${
            heading ? "mt-1.5 text-sm text-ink" : "text-[15px] text-navy"
          }`}
        >
          {prose}
        </p>
      )}

      {takeaway && (
        <p className="mt-3 border-t border-line pt-2.5 text-xs font-bold leading-relaxed text-ocean">
          {takeaway}
        </p>
      )}
    </div>
  );
}

export default CueCard;
