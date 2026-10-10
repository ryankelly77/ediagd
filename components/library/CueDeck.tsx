"use client";

/* ============================================================================
   EDIAGD — a module's film above its cue deck

   THE FILM IS NOT A CARD. The deck is a fixed-height, horizontally-snapping
   reading frame — right for a cue, wrong for a player, which sizes itself by
   width and aspect ratio and wants a height the card cannot give it (#44 put a
   9:16 film in a 290px card and the controls fell below an inner scroll, inside
   a horizontal scroller where a drag on the seek bar was a drag on the deck).
   So the film comes out: its own block, full column width, natural height, the
   page scrolls. The deck below holds the cues and nothing else.

   ONE CARD FILLS THE VIEW, swipe to advance. A list of eight cues reads as
   homework; a deck reads as something you move through, one idea at a time.

   NO CAROUSEL LIBRARY, AND NONE NEEDED. The whole mechanism is CSS scroll-snap
   on a horizontally scrolling flex row — native touch momentum, native snapping,
   native accessibility, correct iOS rubber-banding. Buttons and arrow keys call
   scrollTo() against the same container, so position has ONE source of truth:
   the scroll offset.

   COMPLETION LOGIC IS UNTOUCHED. The film and the cues both complete through
   completeLibraryItem (the same server action), credit-only, no watch_gate.
   Payment, the daily cap, the pay-once unique index and module completion all
   live in lib/library-actions.ts. The film is still counted: the terminal card
   waits for it and module_completion needs it, even though it is not in the deck.

   LONG CUE BODIES SCROLL INSIDE THE CARD. Each card is a fixed-height column: a
   title that does not move, a body that scrolls, the action pinned beneath.
   Letting a 900-character cue grow the card would push "Mark done" off a phone.
   ============================================================================ */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { completeLibraryItem } from "@/lib/library-actions";
import { TrackedVideo, WatchGateLine } from "@/components/video/TrackedVideo";
import type { NextStep } from "@/lib/lms";
import type { VideoRenditions } from "@/lib/mux/playback";

export type DeckItemKind = "cue" | "video" | "video_placeholder";

export type DeckItem = {
  /** For a placeholder this is a sentinel, not a content id. Never submitted. */
  id: string;
  kind: DeckItemKind;
  title: string;
  body: string | null;
  tier: string | null;
  durationSec: number | null;
  /** Legacy pre-Mux URL. Fallback only when there is no Mux asset. */
  videoUrl: string | null;
  /** Both signed Mux cuts; the player picks by viewport. Null when no asset. */
  renditions: VideoRenditions | null;
  /** Furthest point reached and last position, so a lesson resumes. */
  watchedPct: number;
  positionSec: number | null;
  /** Demo content borrowed from elsewhere; says so on the card. */
  isSample: boolean;
  completed: boolean;
};

type Props = {
  moduleId: string;
  moduleName: string;
  items: DeckItem[];
  hasQuiz: boolean;
  quizPassed: boolean;
  completedAt: string | null;
  /*
   * NO videoThreshold. The bar is gateThreshold(duration_sec), computed inside
   * TrackedVideo per video and re-checked by completeLibraryItem against the
   * same function. Threading game_settings.video_complete_pct down to here is
   * what gave the deck a second, looser definition of "watched".
   */
  /** Where finishing this module sends them — the next lesson, usually. */
  nextStep: NextStep;
  /** Deep link from a failed quiz question: open the deck on this cue. */
  initialCueId?: string | null;
};

/** How long the check sits before the deck moves on. Long enough to register. */
const CONFIRM_MS = 650;

export function CueDeck({
  moduleId,
  items,
  hasQuiz,
  quizPassed,
  completedAt,
  nextStep,
  initialCueId,
}: Props) {
  const router = useRouter();
  const scroller = useRef<HTMLDivElement | null>(null);
  // The deck's wrapper, so finishing the film can scroll the deck into view.
  const deckWrap = useRef<HTMLDivElement | null>(null);

  // The film is NOT a card. It comes out of the deck and sits above it. There is
  // at most one video/placeholder item; the page synthesizes a placeholder when a
  // module has no film at all.
  const film = items.find((i) => i.kind === "video" || i.kind === "video_placeholder") ?? null;
  const cues = items.filter((i) => i.kind === "cue");

  const [index, setIndex] = useState(0);
  const [done, setDone] = useState<Set<string>>(
    () => new Set(items.filter((i) => i.completed).map((i) => i.id))
  );
  const [pending, setPending] = useState<string | null>(null);
  const [justDone, setJustDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The deck holds the cues plus the terminal card.
  const cardCount = cues.length + 1;
  // Completion still counts the film: a real film is completable (the terminal
  // waits for it and module_completion needs it), a placeholder never is.
  const completable = items.filter((i) => i.kind !== "video_placeholder");
  const remaining = completable.filter((i) => !done.has(i.id)).length;
  const allDone = remaining === 0 && completable.length > 0;

  const reducedMotion = useRef(false);
  useEffect(() => {
    reducedMotion.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
  }, []);

  // Mirrors `index` for the callbacks that fire later than they were created.
  const indexRef = useRef(0);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  const scrollToIndex = useCallback((i: number, smooth: boolean) => {
    const el = scroller.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(i, el.children.length - 1));
    const child = el.children[clamped] as HTMLElement | undefined;
    if (!child) return;

    // Measured, not computed as clientWidth * i — those stop agreeing the moment
    // the deck gains padding, a gap or a peek of the next card.
    const target =
      el.scrollLeft +
      child.getBoundingClientRect().left -
      el.getBoundingClientRect().left;

    el.scrollTo({
      left: target,
      behavior: smooth && !reducedMotion.current ? "smooth" : "auto",
    });
    setIndex(clamped);
  }, []);

  const goTo = useCallback(
    (i: number) => scrollToIndex(i, true),
    [scrollToIndex]
  );

  // A quiz miss links to /library/m/<id>?cue=<contentId>. The index is among
  // CUES now, which is also what the deck holds, so no translation is needed.
  // Landing is a jump, not a journey: animating it would scroll past every card.
  const landed = useRef(false);
  useEffect(() => {
    if (landed.current || !initialCueId) return;
    const i = cues.findIndex((it) => it.id === initialCueId);
    if (i < 0) return;
    landed.current = true;
    scrollToIndex(i, false);
  }, [initialCueId, cues, scrollToIndex]);

  // Position comes FROM the scroll offset, so a finger-swipe, a button and a key
  // press all converge on the same number instead of three sources drifting.
  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el || el.clientWidth === 0) return;

    const mid = el.getBoundingClientRect().left + el.clientWidth / 2;
    let nearest = 0;
    let best = Infinity;
    for (let i = 0; i < el.children.length; i++) {
      const box = (el.children[i] as HTMLElement).getBoundingClientRect();
      const d = Math.abs(box.left + box.width / 2 - mid);
      if (d < best) {
        best = d;
        nearest = i;
      }
    }
    setIndex((prev) => (prev === nearest ? prev : nearest));
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      goTo(index + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      goTo(index - 1);
    }
  };

  /**
   * Finish an item and run `after`.
   *
   * `watchedPct` is only meaningful for the film — the server re-checks it
   * against the threshold, so a client that lied would simply be refused. `after`
   * is where the cue advances the deck and the film scrolls the deck into view.
   */
  async function markDone(
    id: string,
    opts: { watchedPct?: number; after?: () => void } = {}
  ) {
    if (pending || done.has(id)) return;
    setPending(id);
    setError(null);

    /* "library" — the deck IS the library. Required by the signature so that
       content_progress.source and the Rollcall event both name the surface
       that finished the lesson; see lib/library-actions.ts. */
    const result = await completeLibraryItem(id, "library", opts.watchedPct);
    setPending(null);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setDone((prev) => new Set(prev).add(id));
    setJustDone(id);

    window.setTimeout(() => {
      setJustDone(null);
      opts.after?.();
      // Re-read the server so the quiz gate, the module completion and the Sand
      // Dollar balance are true rather than guessed.
      router.refresh();
    }, CONFIRM_MS);
  }

  const scrollDeckIntoView = useCallback(() => {
    deckWrap.current?.scrollIntoView({
      block: "start",
      behavior: reducedMotion.current ? "auto" : "smooth",
    });
  }, []);

  const filmIsReal = film?.kind === "video" && Boolean(film.renditions);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="This lesson's film and cues"
      className="mt-3"
    >
      {/* ---- The film, above the deck, at its natural height ------------- */}
      {film &&
        (filmIsReal ? (
          <FilmBlock
            item={film}
            isDone={done.has(film.id)}
            onComplete={(pct) => markDone(film.id, { watchedPct: pct })}
            onEnded={scrollDeckIntoView}
          />
        ) : (
          <FilmMissingBlock />
        ))}

      {/* ---- The deck of cues ------------------------------------------- */}
      <div ref={deckWrap} className={film ? "mt-6" : undefined}>
        <DeckProgress index={index} cues={cues} cardCount={cardCount} done={done} />

        <div
          ref={scroller}
          onScroll={onScroll}
          onKeyDown={onKeyDown}
          tabIndex={0}
          className="ediagd-deck mt-3 flex snap-x snap-mandatory overflow-x-auto overflow-y-hidden rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          {cues.map((cue, i) => (
            <CueCardDeck
              key={cue.id}
              item={cue}
              n={i + 1}
              of={cues.length}
              isDone={done.has(cue.id)}
              isPending={pending === cue.id}
              justDone={justDone === cue.id}
              onMarkDone={() =>
                markDone(cue.id, {
                  after: () => {
                    if (indexRef.current === i) goTo(i + 1);
                  },
                })
              }
            />
          ))}

          <TerminalCard
            moduleId={moduleId}
            hasQuiz={hasQuiz}
            quizPassed={quizPassed}
            allDone={allDone}
            remaining={remaining}
            completedAt={completedAt}
            nextStep={nextStep}
          />
        </div>

        {/* ---- Controls ------------------------------------------------- */}
        <div className="mt-3 flex items-center justify-between gap-3">
          <DeckButton
            label="Previous"
            glyph="‹"
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
          />
          <p aria-live="polite" className="ediagd-numeral text-xs text-ink-soft">
            {index < cues.length
              ? `${index + 1} of ${cues.length}`
              : hasQuiz
                ? "Quiz"
                : "Finish"}
          </p>
          <DeckButton
            label="Next"
            glyph="›"
            onClick={() => goTo(index + 1)}
            disabled={index >= cardCount - 1}
          />
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-card px-3 py-2 text-xs font-bold"
          style={{
            background: "color-mix(in srgb, rgb(var(--ediagd-clay)) 12%, transparent)",
            color: "rgb(var(--ediagd-clay))",
          }}
        >
          {error}
        </p>
      )}

      <style>{`
        .ediagd-deck {
          /* svh, not vh: mobile Safari's vh includes chrome that isn't there,
             which is exactly how an action button ends up below the fold. */
          height: min(30rem, calc(100svh - 15rem));
          min-height: 22rem;
          scrollbar-width: none;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior-x: contain;
        }
        .ediagd-deck::-webkit-scrollbar {
          display: none;
        }
        /* A soft fade top and bottom that says "there is more below" without
           spending a scrollbar on it. One rule for every cue in the deck. */
        .ediagd-cue-body {
          mask-image: linear-gradient(
            to bottom,
            transparent 0,
            #000 0.5rem,
            #000 calc(100% - 0.75rem),
            transparent 100%
          );
        }
        .ediagd-cue-body::-webkit-scrollbar {
          width: 3px;
        }
        .ediagd-cue-body::-webkit-scrollbar-thumb {
          background: rgb(var(--ediagd-line));
          border-radius: 999px;
        }
        @media (prefers-reduced-motion: reduce) {
          .ediagd-deck {
            scroll-behavior: auto;
          }
        }
      `}</style>
    </section>
  );
}

/* ---- The film block ------------------------------------------------------ */

/**
 * The lesson film, out of the deck and at its natural height.
 *
 * No fixed height, no inner overflow, no mask — the player sizes itself by the
 * column width and its aspect ratio, and the page scrolls. credit-only is the
 * LMS policy: controls stay, the watch records to content_progress, and NO
 * watch_gate row is filed. Resumes from the advisor's furthest point; captions
 * come from the asset's own text track.
 *
 * COMPLETION IS EARNED BY WATCHING, reported once — scrubbing backwards never
 * un-earns it, and the server re-checks the number against the threshold. When
 * the film ends with credit earned, the deck scrolls into view: that is what
 * "the deck advances" means now.
 */
function FilmBlock({
  item,
  isDone,
  onComplete,
  onEnded,
}: {
  item: DeckItem;
  isDone: boolean;
  onComplete: (pct: number) => void;
  onEnded: () => void;
}) {
  const [watched, setWatched] = useState(item.watchedPct ?? 0);
  const [met, setMet] = useState(isDone);
  const furthest = useRef(item.watchedPct ?? 0);
  const fired = useRef(isDone);

  const mins =
    item.durationSec && item.durationSec > 0
      ? item.durationSec < 60
        ? `${item.durationSec} sec`
        : `${Math.round(item.durationSec / 60)} min`
      : null;

  /*
   * CREDIT COMES FROM `met`, AND FROM NOWHERE ELSE.
   *
   * This fired on `isMet || pct >= threshold`, where threshold was
   * game_settings.video_complete_pct — a flat 90. TrackedVideo computes `met`
   * from `Math.max(given, gateThreshold(duration))`, so the two disagreed by
   * design and the OR took the looser: on a 221-second lesson the card awarded
   * credit at 90%, twenty-two seconds before the end, while the player still
   * read "not met". Two definitions of watched in one function, and the one
   * that decided was the one nobody intended.
   *
   * `met` is now the only trigger. One rule, computed in one place, for the
   * card, the server re-check and the morning alike.
   */
  const reach = (pct: number, isMet: boolean) => {
    if (pct > furthest.current) {
      furthest.current = pct;
      setWatched(pct);
    }
    if (isMet) setMet(true);
    if (!fired.current && !isDone && isMet) {
      fired.current = true;
      /* The measured number, not a number raised to clear a bar. `onComplete`
         previously sent max(pct, threshold) — manufacturing a percentage the
         viewer had not reached so the server's own weaker check would pass. */
      onComplete(pct);
    }
  };

  /* The deck advances when credit is EARNED, not when a percentage is passed —
     the same question `reach` now asks. */
  const handleEnded = () => {
    if (fired.current || isDone) onEnded();
  };

  const barPct = isDone ? 100 : watched;
  const isMetNow = isDone || met;

  return (
    <section>
      <div className="flex items-center gap-2">
        <span className="ediagd-eyebrow">Video</span>
        {mins && (
          <span className="ediagd-numeral text-xs text-ink-soft">{mins}</span>
        )}
        {item.isSample && <SampleChip />}
        {isDone && (
          <span
            className="ml-auto rounded-pill px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-wide"
            style={{
              background:
                "color-mix(in srgb, rgb(var(--ediagd-palm)) 16%, transparent)",
              color: "rgb(var(--ediagd-palm))",
            }}
          >
            Done
          </span>
        )}
      </div>
      <h3 className="mt-1 text-lg font-extrabold leading-snug text-navy">
        {item.title}
      </h3>

      <div className="mt-3">
        <TrackedVideo
          policy="credit-only"
          contentId={item.id}
          renditions={item.renditions!}
          title={item.title}
          /* NO THRESHOLD PASSED. Undefined means "decide per video", so
             TrackedVideo uses gateThreshold(duration) alone — the one rule.
             Passing game_settings.video_complete_pct here is what let a flat 90
             into a decision that is about seconds, not share. */
          initialWatchedPct={item.watchedPct}
          initialPositionSec={item.positionSec}
          onWatchChange={(s) => reach(s.pct, s.met)}
          onPlaybackEnded={handleEnded}
        />
      </div>

      {item.body && (
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-navy">
          {item.body}
        </p>
      )}

      {/*
        THE MORNING'S LINE, AND NO NUMBERS AT ALL.

        This printed "Watched {barPct}%" beside "counts at {threshold}%" — a raw
        float against a bar neither the player nor the server uses any more. Two
        numbers, both of them wrong: the first showed 94.999999 for a finished
        film, the second named 90 when credit needed ~99.

        A percentage is a promise the viewer can check, and this one did not add
        up: it would sit at "Watched 91%" with the film plainly still playing
        and nothing happening, or reach 100% having already gone palm. So both
        numbers go and the line says only the thing that is true — teal while
        working, palm and the single word "Watched" once credit is earned.

        WatchGateLine is imported from the morning rather than reimplemented. A
        second copy is how the library and the loop came to disagree about what
        "watched" meant in the first place.
      */}
      <div className="mt-3">
        <WatchGateLine pct={barPct} met={isMetNow} />
        {isMetNow && (
          <span
            className="mt-1.5 block text-xs font-extrabold"
            style={{ color: "rgb(var(--ediagd-palm))" }}
          >
            Watched
          </span>
        )}
      </div>
    </section>
  );
}

/**
 * A module with no film yet. The InactivePlayer frame and one line, in the
 * film's place above the deck — deliberately not a fake player, and not a card.
 */
function FilmMissingBlock() {
  return (
    <section>
      <span className="ediagd-eyebrow">Video</span>
      <div className="mt-3 flex flex-col items-center justify-center rounded-card border border-line bg-surface-card py-10 text-center">
        <InactivePlayer />
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">
          The film for this lesson is coming.
        </p>
      </div>
    </section>
  );
}

/* ---- Progress ------------------------------------------------------------ */

/**
 * "3 of 8" and a segment per cue, plus the terminal card's own segment.
 *
 * Segments rather than a single bar because the deck's LENGTH is the thing an
 * advisor wants before they start. Filled = finished, teal = where you are. The
 * film is tracked by its own Done chip above; this is the deck's own progress.
 */
function DeckProgress({
  index,
  cues,
  cardCount,
  done,
}: {
  index: number;
  cues: DeckItem[];
  cardCount: number;
  done: Set<string>;
}) {
  const completed = cues.filter((i) => done.has(i.id)).length;

  return (
    <div className="px-1">
      <div className="flex items-baseline justify-between">
        <p className="ediagd-numeral text-sm font-extrabold text-navy">
          {cues.length === 0 ? "No cues" : `${Math.min(index + 1, cues.length)} of ${cues.length}`}
        </p>
        <p className="ediagd-numeral text-xs text-ink-soft">
          {completed} of {cues.length} done
        </p>
      </div>

      <div
        className="mt-1.5 flex gap-1"
        role="img"
        aria-label={`${completed} of ${cues.length} finished`}
      >
        {cues.map((item, i) => {
          const isDone = done.has(item.id);
          const isHere = i === index;
          const background = isDone
            ? "rgb(var(--ediagd-palm))"
            : isHere
              ? "rgb(var(--ediagd-teal))"
              : "rgb(var(--ediagd-line) / 0.7)";
          return (
            <span
              key={item.id}
              className="h-1.5 flex-1 rounded-pill transition-all"
              style={{ background }}
            />
          );
        })}
        {/* The terminal card gets its own segment — the deck is longer than the
            cue count, and a bar that ended one card early would read as a bug. */}
        <span
          className="h-1.5 w-4 rounded-pill transition-all"
          style={{
            background:
              index === cardCount - 1
                ? "rgb(var(--ediagd-gold))"
                : "rgb(var(--ediagd-line) / 0.7)",
          }}
        />
      </div>
    </div>
  );
}

/* ---- One cue card -------------------------------------------------------- */

function CueCardDeck({
  item,
  n,
  of,
  isDone,
  isPending,
  justDone,
  onMarkDone,
}: {
  item: DeckItem;
  n: number;
  of: number;
  isDone: boolean;
  isPending: boolean;
  justDone: boolean;
  onMarkDone: () => void;
}) {
  return (
    <article
      aria-label={`Cue ${n} of ${of}: ${item.title}`}
      className="flex h-full w-full shrink-0 snap-center flex-col rounded-card border border-line bg-surface-card p-5 shadow-card"
    >
      {/* Title block — fixed, so the card never appears to jump while reading */}
      <header className="shrink-0">
        <div className="flex items-center gap-2">
          <span className="ediagd-eyebrow">Cue {n}</span>
          {item.tier && (
            <span className="text-xs uppercase tracking-wide text-ink-soft">
              {item.tier}
            </span>
          )}
          {item.isSample && <SampleChip />}
          {isDone && (
            <span
              className="ml-auto rounded-pill px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-wide"
              style={{
                background:
                  "color-mix(in srgb, rgb(var(--ediagd-palm)) 16%, transparent)",
                color: "rgb(var(--ediagd-palm))",
              }}
            >
              Done
            </span>
          )}
        </div>
        <h3 className="mt-2 text-lg font-extrabold leading-snug text-navy">
          {item.title}
        </h3>
      </header>

      {/* The body scrolls on its own — see the note at the top of the file */}
      <div className="ediagd-cue-body mt-3 min-h-0 flex-1 overflow-y-auto">
        <p className="whitespace-pre-line text-[15px] leading-relaxed text-navy">
          {item.body}
        </p>
      </div>

      <footer className="mt-4 shrink-0">
        {isDone ? (
          <p className="flex min-h-[3rem] items-center justify-center gap-2 rounded-xl border border-line text-sm font-extrabold text-ink-soft">
            <Check /> Finished — swipe on
          </p>
        ) : (
          <button
            type="button"
            onClick={onMarkDone}
            disabled={isPending}
            className="flex min-h-[3rem] w-full items-center justify-center gap-2 rounded-xl bg-gold px-4 text-sm font-extrabold text-navy transition hover:brightness-95 disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            {justDone ? (
              <>
                <Check /> Got it
              </>
            ) : isPending ? (
              "Saving…"
            ) : (
              "Mark done"
            )}
          </button>
        )}
      </footer>
    </article>
  );
}

/** A play mark that is visibly not a button. Muted, ringed, no fill. */
function InactivePlayer() {
  return (
    <span
      aria-hidden="true"
      className="mx-auto flex h-16 w-16 items-center justify-center rounded-pill border-2 border-dashed"
      style={{
        borderColor: "rgb(var(--ediagd-line))",
        background: "color-mix(in srgb, rgb(var(--ediagd-teal)) 6%, transparent)",
      }}
    >
      <svg viewBox="0 0 24 24" className="ml-1 h-6 w-6" aria-hidden="true">
        <path d="M8 5.5v13l11-6.5z" fill="rgb(var(--ediagd-line))" />
      </svg>
    </span>
  );
}

function SampleChip() {
  return (
    <span
      className="rounded-pill px-2 py-0.5 text-xs font-extrabold uppercase tracking-wide"
      style={{
        background: "color-mix(in srgb, rgb(var(--ediagd-clay)) 14%, transparent)",
        color: "rgb(var(--ediagd-clay))",
      }}
    >
      Sample
    </span>
  );
}

/* ---- The last card ------------------------------------------------------- */

/**
 * The deck must not end on a wall.
 *
 * Swiping past the final card into nothing reads as a broken page, so the last
 * card always says something: take the quiz, the quiz is waiting on the cues,
 * or the module is finished. Which one is decided by the same facts the page
 * header uses, so the card and the gate can never disagree. `remaining` and
 * `allDone` still count the film, so a module whose film is unwatched still
 * waits here even though the film is not in the deck.
 */
function TerminalCard({
  moduleId,
  hasQuiz,
  quizPassed,
  allDone,
  remaining,
  completedAt,
  nextStep,
}: {
  moduleId: string;
  hasQuiz: boolean;
  quizPassed: boolean;
  allDone: boolean;
  remaining: number;
  completedAt: string | null;
  nextStep: NextStep;
}) {
  return (
    <article
      aria-label="End of the deck"
      className="flex h-full w-full shrink-0 snap-center flex-col justify-center rounded-card border border-line bg-surface-card p-6 text-center shadow-card"
    >
      <span aria-hidden="true" className="mx-auto">
        <Sunrise />
      </span>

      {hasQuiz ? (
        quizPassed ? (
          <>
            <h3 className="mt-4 text-xl font-extrabold text-navy">
              Lesson complete
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              Quiz passed. You can take it again any time — the review is worth
              re-reading.
            </p>
            <Link
              href={nextStep.href}
              className="mt-5 inline-flex min-h-[3rem] items-center justify-center rounded-xl bg-gold px-5 text-center text-sm font-extrabold text-navy transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              {nextStep.kind === "library"
                ? "Back to the Lesson Library"
                : `Next: ${nextStep.label}`}
            </Link>
            <Link
              href={`/library/m/${moduleId}/quiz`}
              className="mt-2 inline-flex min-h-[2.75rem] items-center justify-center rounded-xl border border-line px-5 text-sm font-extrabold text-navy transition hover:bg-teal-soft/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              Take the quiz again
            </Link>
          </>
        ) : allDone ? (
          <>
            <h3 className="mt-4 text-xl font-extrabold text-navy">
              That&apos;s everything
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              Nice work. A few questions on what you just read — unlimited
              retries, and it&apos;s here to make it stick, not to trip you up.
            </p>
            <Link
              href={`/library/m/${moduleId}/quiz`}
              className="mt-5 inline-flex min-h-[3rem] items-center justify-center rounded-xl bg-gold px-5 text-sm font-extrabold text-navy transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              Start the quiz
            </Link>
          </>
        ) : (
          <>
            <h3 className="mt-4 text-xl font-extrabold text-navy">
              Quiz is waiting
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              {remaining} {remaining === 1 ? "item" : "items"} still to finish —
              the film and the cues. The quiz opens once you&apos;ve been through
              them.
            </p>
          </>
        )
      ) : allDone || completedAt ? (
        <>
          <h3 className="mt-4 text-xl font-extrabold text-navy">
            Lesson complete
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Everything in this one is behind you.
          </p>
          <Link
            href={nextStep.href}
            className="mt-5 inline-flex min-h-[3rem] items-center justify-center rounded-xl bg-gold px-5 text-center text-sm font-extrabold text-navy transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            {nextStep.kind === "library"
              ? "Back to the Lesson Library"
              : `Next: ${nextStep.label}`}
          </Link>
        </>
      ) : remaining === 0 ? (
        <>
          <h3 className="mt-4 text-xl font-extrabold text-navy">
            Nothing here yet
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            This lesson hasn&apos;t had its material added. It&apos;ll fill in.
          </p>
          <Link
            href={nextStep.href}
            className="mt-5 inline-flex min-h-[3rem] items-center justify-center rounded-xl bg-gold px-5 text-center text-sm font-extrabold text-navy transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            {nextStep.kind === "library"
              ? "Back to the Lesson Library"
              : `Next: ${nextStep.label}`}
          </Link>
        </>
      ) : (
        <>
          <h3 className="mt-4 text-xl font-extrabold text-navy">
            {remaining} still to finish
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Swipe back for the cues you haven&apos;t marked, and watch the film
            above if you haven&apos;t.
          </p>
        </>
      )}
    </article>
  );
}

/* ---- Small parts --------------------------------------------------------- */

function DeckButton({
  label,
  glyph,
  onClick,
  disabled,
}: {
  label: string;
  glyph: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-pill border border-line bg-surface-card text-lg font-extrabold text-navy transition hover:bg-teal-soft/20 disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
    >
      <span aria-hidden="true">{glyph}</span>
    </button>
  );
}

function Check() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 12.5l5.5 5.5L20 7" />
    </svg>
  );
}

/** The brand's sun over the horizon — the deck's quiet full stop. */
function Sunrise() {
  return (
    <svg viewBox="0 0 64 40" className="h-12 w-20" aria-hidden="true">
      <circle cx="32" cy="24" r="11" fill="rgb(var(--ediagd-gold) / 0.9)" />
      <path
        d="M4 30h56M10 36h44"
        stroke="rgb(var(--ediagd-teal))"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
}
