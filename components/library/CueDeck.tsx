"use client";

/* ============================================================================
   EDIAGD — a module's cues as a card deck

   ONE CARD FILLS THE VIEW, swipe to advance. The list this replaces was honest
   but inert: eight cues stacked down a page read as homework. A deck reads as
   something you move through, and the thing an advisor is actually doing —
   taking one idea at a time onto the drive — is a card, not a row.

   NO CAROUSEL LIBRARY, AND NONE NEEDED. The whole mechanism is CSS scroll-snap
   on a horizontally scrolling flex row. That buys native touch momentum, native
   snapping, native accessibility of a scroll container, and correct behaviour
   under rubber-banding on iOS — all of it tuned by the platform rather than
   re-implemented in JS. Buttons and arrow keys call scrollTo() against the same
   container, so there is ONE source of truth for position: the scroll offset.
   A JS-transform carousel would have to own that state and then fight the
   browser for it. Bundle cost here is zero.

   COMPLETION LOGIC IS UNTOUCHED. This calls completeLibraryItem, the same
   server action the old rows used. Payment, the daily cap, the pay-once unique
   index, and module completion all still live in lib/library-actions.ts.
   Nothing about what an item is worth is decided here — the deck only decides
   what to show and when to move.

   THREE KINDS OF CARD, one shell:
     * cue     — title and body, "Mark done"
     * video   — a real player; watching past the threshold completes it
     * missing — a branded placeholder where a module's video hasn't landed yet

   The placeholder OCCUPIES A REAL SLOT in the deck and in the "3 of 8" count,
   so the deck's shape is what the module will actually look like once the video
   arrives. It cannot be completed and never claims to be: a placeholder that
   counted toward progress would be a lie about work nobody has done.

   LONG BODIES SCROLL INSIDE THE CARD. The card is a fixed-height column: a
   title block that does not move, a body that scrolls on its own, and the
   action pinned beneath it. Some cues run past 900 characters; letting the card
   grow would push "Mark done" off a phone screen, and shrinking the type to fit
   would punish the longest — which is to say the most important — cues.
   ============================================================================ */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { completeLibraryItem } from "@/lib/library-actions";
import type { NextStep } from "@/lib/lms";

export type DeckItemKind = "cue" | "video" | "video_placeholder";

export type DeckItem = {
  /** For a placeholder this is a sentinel, not a content id. Never submitted. */
  id: string;
  kind: DeckItemKind;
  title: string;
  body: string | null;
  tier: string | null;
  durationSec: number | null;
  videoUrl: string | null;
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
  /** game_settings.video_complete_pct — the bar a video has to clear. */
  videoThreshold: number;
  /** Where finishing this module sends them — the next lesson, usually. */
  nextStep: NextStep;
  /** Deep link from a failed quiz question: open the deck on this cue. */
  initialCueId?: string | null;
};

/** How long the check sits before the deck moves on. Long enough to register. */
const CONFIRM_MS = 650;

export function CueDeck({
  moduleId,
  moduleName,
  items,
  hasQuiz,
  quizPassed,
  completedAt,
  videoThreshold,
  nextStep,
  initialCueId,
}: Props) {
  const router = useRouter();
  const scroller = useRef<HTMLDivElement | null>(null);

  const [index, setIndex] = useState(0);
  const [done, setDone] = useState<Set<string>>(
    () => new Set(items.filter((i) => i.completed).map((i) => i.id))
  );
  const [pending, setPending] = useState<string | null>(null);
  const [justDone, setJustDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The terminal card is a real card in the deck, so the scroll maths counts it.
  const cardCount = items.length + 1;
  // A placeholder is not work. It is excluded from every count that means
  // "how much is left", while still occupying a slot in the deck.
  const completable = items.filter((i) => i.kind !== "video_placeholder");
  const remaining = completable.filter((i) => !done.has(i.id)).length;
  const allDone = remaining === 0 && completable.length > 0;

  const reducedMotion = useRef(false);
  useEffect(() => {
    reducedMotion.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
  }, []);

  // Mirrors `index` for the callbacks that fire later than they were created —
  // see the completion timeout below, which must not act on a stale position.
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

    // Measured, not computed as clientWidth * i. Those agree today, and would
    // stop agreeing the moment the deck gains padding, a gap, or a peek of the
    // next card — the kind of change that looks purely visual and silently
    // breaks every jump.
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

  // A quiz miss links to /library/m/<id>?cue=<contentId>. Landing is a jump,
  // not a journey: animating the deep link would scroll past every card between
  // here and there and read as the app losing its place.
  const landed = useRef(false);
  useEffect(() => {
    if (landed.current || !initialCueId) return;
    const i = items.findIndex((it) => it.id === initialCueId);
    if (i < 0) return;
    landed.current = true;
    scrollToIndex(i, false);
  }, [initialCueId, items, scrollToIndex]);

  // Position comes FROM the scroll offset, so a finger-swipe, a button, and a
  // key press all converge on the same number instead of three sources drifting.
  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el || el.clientWidth === 0) return;

    // Nearest card by measured distance, for the same reason scrollToIndex
    // measures.
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
   * Finish an item and move along.
   *
   * `watchedPct` is only meaningful for a video — the server re-checks it
   * against the threshold, so a client that lied would simply be refused.
   */
  async function markDone(
    id: string,
    cardIndex: number,
    watchedPct?: number,
    /**
     * False for a video: it completes at the threshold, with up to a tenth of
     * the runtime still to play, and sliding the card away mid-sentence would
     * punish watching to the end. Videos advance from onEnded instead.
     */
    advance = true
  ) {
    if (pending || done.has(id)) return;
    setPending(id);
    setError(null);

    const result = await completeLibraryItem(id, watchedPct);
    setPending(null);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setDone((prev) => new Set(prev).add(id));
    setJustDone(id);

    // The confirmation beat, then the deck moves with them.
    window.setTimeout(() => {
      setJustDone(null);
      if (!advance) {
        router.refresh();
        return;
      }
      // Only advance if they are STILL on the card they just finished. Tapping
      // "Mark done" and immediately swiping ahead is ordinary behaviour, and
      // yanking them back one card later would feel like the deck fighting
      // them — the auto-advance is a convenience, not a claim on where they are.
      if (indexRef.current === cardIndex) goTo(cardIndex + 1);
      // Re-read the server so the quiz gate, the module completion and the
      // Sand Dollar balance are true rather than guessed. Deferred to here so
      // it never interrupts a card the advisor is still reading.
      router.refresh();
    }, CONFIRM_MS);
  }

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Cards in this module"
      className="mt-3"
    >
      <DeckProgress
        index={index}
        cardCount={cardCount}
        items={items}
        done={done}
      />

      {/* ---- The deck --------------------------------------------------- */}
      <div
        ref={scroller}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        tabIndex={0}
        className="ediagd-deck mt-3 flex snap-x snap-mandatory overflow-x-auto overflow-y-hidden rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
      >
        {items.map((item, i) => (
          <DeckCard
            key={item.id}
            item={item}
            n={i + 1}
            of={items.length}
            // Numbered among CUES, not among cards: with a video card at the
            // front, counting cards would open the deck on "Cue 2".
            cueNumber={
              items.slice(0, i + 1).filter((x) => x.kind === "cue").length
            }
            moduleName={moduleName}
            isDone={done.has(item.id)}
            isPending={pending === item.id}
            justDone={justDone === item.id}
            videoThreshold={videoThreshold}
            onMarkDone={(pct, advance) => markDone(item.id, i, pct, advance)}
            onAdvance={() => goTo(i + 1)}
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

      {/* ---- Controls ---------------------------------------------------- */}
      <div className="mt-3 flex items-center justify-between gap-3">
        <DeckButton
          label="Previous"
          glyph="‹"
          onClick={() => goTo(index - 1)}
          disabled={index === 0}
        />
        <p aria-live="polite" className="ediagd-numeral text-xs text-ink-soft">
          {index < items.length
            ? `${index + 1} of ${items.length}`
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
           spending a scrollbar on it. One rule for every card in the deck. */
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

/* ---- Progress ------------------------------------------------------------ */

/**
 * "3 of 8" and a segment per card.
 *
 * Segments rather than a single bar because the deck's LENGTH is the thing an
 * advisor wants before they start — a continuous bar at 37% doesn't say whether
 * two cards remain or twenty. Filled = finished, teal = where you are.
 */
function DeckProgress({
  index,
  cardCount,
  items,
  done,
}: {
  index: number;
  cardCount: number;
  items: DeckItem[];
  done: Set<string>;
}) {
  const completable = items.filter((i) => i.kind !== "video_placeholder");
  const completed = completable.filter((i) => done.has(i.id)).length;

  return (
    <div className="px-1">
      <div className="flex items-baseline justify-between">
        <p className="ediagd-numeral text-sm font-extrabold text-navy">
          {Math.min(index + 1, items.length)} of {items.length}
        </p>
        <p className="ediagd-numeral text-xs text-ink-soft">
          {completed} of {completable.length} done
        </p>
      </div>

      <div
        className="mt-1.5 flex gap-1"
        role="img"
        aria-label={`${completed} of ${completable.length} finished`}
      >
        {items.map((item, i) => {
          const isDone = done.has(item.id);
          const isHere = i === index;
          // A placeholder never fills — there is nothing there to finish.
          const background =
            item.kind === "video_placeholder"
              ? isHere
                ? "rgb(var(--ediagd-teal) / 0.45)"
                : "rgb(var(--ediagd-line) / 0.7)"
              : isDone
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
            item count, and a bar that ended one card early would read as a bug. */}
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

/* ---- One card ------------------------------------------------------------ */

function DeckCard({
  item,
  n,
  of,
  cueNumber,
  moduleName,
  isDone,
  isPending,
  justDone,
  videoThreshold,
  onMarkDone,
  onAdvance,
}: {
  item: DeckItem;
  n: number;
  of: number;
  /** Position among the cues, ignoring video cards. */
  cueNumber: number;
  moduleName: string;
  isDone: boolean;
  isPending: boolean;
  justDone: boolean;
  videoThreshold: number;
  onMarkDone: (watchedPct?: number, advance?: boolean) => void;
  /** Move to the next card — used when a video plays out. */
  onAdvance: () => void;
}) {
  const isPlaceholder = item.kind === "video_placeholder";
  const isVideo = item.kind === "video";
  // Rounding up to "1 min" would tell an advisor a nine-second clip is sixty
  // times longer than it is. Under a minute, say seconds.
  const mins =
    item.durationSec && item.durationSec > 0
      ? item.durationSec < 60
        ? `${item.durationSec} sec`
        : `${Math.round(item.durationSec / 60)} min`
      : null;

  const eyebrow = isVideo || isPlaceholder ? "Video" : `Cue ${cueNumber}`;

  return (
    <article
      aria-label={`${eyebrow}, card ${n} of ${of}: ${item.title}`}
      className="flex h-full w-full shrink-0 snap-center flex-col rounded-card border border-line bg-surface-card p-5 shadow-card"
    >
      {/* Title block — fixed, so the card never appears to jump while reading */}
      <header className="shrink-0">
        <div className="flex items-center gap-2">
          <span className="ediagd-eyebrow">{eyebrow}</span>
          {item.tier && (
            <span className="text-[11px] uppercase tracking-wide text-ink-soft">
              {item.tier}
            </span>
          )}
          {mins && (
            <span className="ediagd-numeral text-[11px] text-ink-soft">
              {mins}
            </span>
          )}
          {item.isSample && <SampleChip />}
          {isDone && (
            <span
              className="ml-auto rounded-pill px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide"
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
          {isPlaceholder ? moduleName : item.title}
        </h3>
      </header>

      {isPlaceholder ? (
        <VideoPlaceholderBody />
      ) : isVideo ? (
        <VideoBody
          item={item}
          isDone={isDone}
          isPending={isPending}
          justDone={justDone}
          threshold={videoThreshold}
          onReachedThreshold={(pct) => onMarkDone(pct, false)}
          onEnded={onAdvance}
        />
      ) : (
        <>
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
                onClick={() => onMarkDone()}
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
        </>
      )}
    </article>
  );
}

/* ---- The video ----------------------------------------------------------- */

/**
 * A real player, and an honest progress read-out.
 *
 * COMPLETION IS EARNED BY WATCHING. The furthest point reached is tracked and
 * the item completes once it passes game_settings.video_complete_pct. The
 * server re-checks that number against the same setting, so this is a
 * convenience for the advisor rather than the thing being trusted — a client
 * claiming 100% on a video it never played is refused in
 * completeLibraryItem.
 *
 * FURTHEST POINT, not current position: scrubbing backwards to re-watch
 * something must not undo credit that was already earned.
 */
function VideoBody({
  item,
  isDone,
  isPending,
  justDone,
  threshold,
  onReachedThreshold,
  onEnded,
}: {
  item: DeckItem;
  isDone: boolean;
  isPending: boolean;
  justDone: boolean;
  threshold: number;
  onReachedThreshold: (pct: number) => void;
  onEnded: () => void;
}) {
  const [watched, setWatched] = useState(0);
  const furthest = useRef(0);
  const fired = useRef(false);

  // Played out to the end: now the deck moves on, the same way finishing a cue
  // moves it on. Only when the item is actually finished — a video watched to
  // the end without clearing the bar (it was scrubbed) should not advance past
  // work that was never done.
  const handleEnded = () => {
    if (furthest.current >= threshold || isDone) onEnded();
  };

  const onTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    if (!v.duration || !Number.isFinite(v.duration)) return;
    const pct = Math.min(100, Math.round((v.currentTime / v.duration) * 100));
    if (pct > furthest.current) {
      furthest.current = pct;
      setWatched(pct);
      if (!fired.current && !isDone && pct >= threshold) {
        fired.current = true;
        onReachedThreshold(pct);
      }
    }
  };

  // A video row with no URL is a content gap, not a broken player. Say so.
  if (!item.videoUrl) {
    return (
      <>
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          <InactivePlayer />
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            This video hasn&apos;t been uploaded yet. It&apos;ll play here as
            soon as it lands.
          </p>
        </div>
        <footer className="mt-4 shrink-0">
          <p className="flex min-h-[3rem] items-center justify-center rounded-xl border border-line text-xs text-ink-soft">
            Nothing to mark yet
          </p>
        </footer>
      </>
    );
  }

  return (
    <>
      <div className="ediagd-cue-body mt-3 min-h-0 flex-1 overflow-y-auto">
        <video
          src={item.videoUrl}
          controls
          playsInline
          preload="metadata"
          onTimeUpdate={onTimeUpdate}
          onEnded={handleEnded}
          className="w-full rounded-card bg-navy"
        />
        {item.body && (
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-navy">
            {item.body}
          </p>
        )}
      </div>

      <footer className="mt-4 shrink-0">
        {isDone ? (
          <p className="flex min-h-[3rem] items-center justify-center gap-2 rounded-xl border border-line text-sm font-extrabold text-ink-soft">
            <Check /> Watched — swipe on
          </p>
        ) : justDone || isPending ? (
          <p className="flex min-h-[3rem] items-center justify-center gap-2 rounded-xl bg-gold text-sm font-extrabold text-navy">
            {isPending ? "Saving…" : <><Check /> Got it</>}
          </p>
        ) : (
          <div className="min-h-[3rem]">
            <div className="flex items-baseline justify-between">
              <span className="ediagd-numeral text-xs font-extrabold text-navy">
                Watched {watched}%
              </span>
              <span className="ediagd-numeral text-[11px] text-ink-soft">
                counts at {threshold}%
              </span>
            </div>
            <span className="mt-1.5 block h-1.5 w-full rounded-pill bg-line/60">
              <span
                aria-hidden="true"
                className="block h-full rounded-pill transition-all"
                style={{
                  width: `${Math.max(watched > 0 ? 4 : 0, watched)}%`,
                  background:
                    watched >= threshold
                      ? "rgb(var(--ediagd-palm))"
                      : "rgb(var(--ediagd-teal))",
                }}
              />
            </span>
          </div>
        )}
      </footer>
    </>
  );
}

/**
 * No video row exists for this module at all.
 *
 * Deliberately NOT a fake player: no thumbnail, no scrubber, no progress bar.
 * A control that looks operable and does nothing is worse than an honest gap,
 * because the advisor concludes the app is broken rather than that the video
 * is coming.
 */
function VideoPlaceholderBody() {
  return (
    <>
      <div className="mt-3 flex min-h-0 flex-1 flex-col items-center justify-center text-center">
        <InactivePlayer />
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">
          A video for this module is on the way. The cues are all here in the
          meantime — swipe on.
        </p>
      </div>
      <footer className="mt-4 shrink-0">
        <p className="flex min-h-[3rem] items-center justify-center rounded-xl border border-line text-xs text-ink-soft">
          Nothing to watch yet
        </p>
      </footer>
    </>
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
      className="rounded-pill px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide"
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
 * or the module is finished. Which one is decided by the same two facts the
 * page header uses, so the card and the gate can never disagree.
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
            {/*
              "That's the lot" and "catch anyone out" are both British idiom.
              The voice here is a Texas service drive, so the copy says the same
              thing the way Mitch would: name the win, then make the quiz sound
              like the last rep of the set rather than an exam.
            */}
            <h3 className="mt-4 text-xl font-extrabold text-navy">
              That&apos;s every cue
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
              {remaining} {remaining === 1 ? "card" : "cards"} still to finish.
              Swipe back and the quiz opens once you&apos;ve been through them.
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
          {/* Same rule as the passed-quiz screen: finishing hands you the next
              thing rather than sending you back up to look for it. */}
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
        // A module with nothing in it. The importer now refuses to create
        // these, but one can still exist until it has been re-run — and
        // "0 still to finish" is a nonsense sentence to end a deck on.
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
            Swipe back for the ones you haven&apos;t marked yet.
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
