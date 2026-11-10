/* ============================================================================
   EDIAGD — what opens a module's quiz

   THE FILM. NOT THE CUES. Ryan's ruling, 10 November 2026.

   ---------------------------------------------------------------------------
   WHY THIS IS A FUNCTION IN lib/ AND NOT THREE LINES IN THE DECK
   ---------------------------------------------------------------------------
   Because it was three lines in the deck, and they disagreed with the server.

   The quiz ROUTE (app/(app)/library/m/[module]/quiz/page.tsx) gates on
   `my_module_progress.items_done`, which counts GATING types only — a cue has
   never been in it, since 0143. The deck's terminal card gated on `allDone`,
   which counted every completable card including the cues, and so refused a
   quiz the server would have served. The advisor saw "Quiz is waiting, N items
   still to finish" and no button, with nothing telling them which N or that the
   quiz was in fact already theirs. Valerie Patterson reported it on Name Tag on
   10 November.

   Two definitions of one gate, in two layers, with nothing comparing them. So
   the deck's half lives here, named, with the rule it must agree with written
   beside it and a test that holds it there.

   ---------------------------------------------------------------------------
   THE AGREEMENT THIS FUNCTION OWES, STATED SO IT CAN BE CHECKED
   ---------------------------------------------------------------------------
   For the same module and the same advisor:

       quizGate(deck items).open   ===   my_module_progress.items_done

   The view computes it as "the module holds at least one published gating item
   AND every one of them has a completed content_progress row". This computes
   the same sentence over the cards the page was handed. `items_done` is false
   for a module with no gating item — a cue-only module cannot complete at all
   (moduleRequirementsMet refuses an empty gating set) — which is why `open` is
   false when `hasGatingItem` is false rather than vacuously true. A gate that
   opened on an empty set is the failure AGENTS.md names: a check satisfied by
   an empty catalog.

   `gates` comes from GATING_CONTENT_TYPES, which mirrors the database's
   gating_content_types() and which `npm run check:gating` asserts. It is NOT
   derived from a card's `kind`: kind is "video" for every type that is not a
   cue, so a manager_video would gate a module the database says it does not.
============================================================================ */

export type GateItem = {
  id: string;
  /** A synthesized placeholder is not a row and can never be completed. */
  completable: boolean;
  /** Type is in GATING_CONTENT_TYPES. Set from content.type, never from kind. */
  gates: boolean;
};

export type QuizGate = {
  /** The module holds at least one real, published, gating item. */
  hasGatingItem: boolean;
  /** Every gating item is done — the quiz route will serve the quiz. */
  open: boolean;
  /** Unmarked cues. Reinforcement, and reported so they can be INVITED. */
  cuesLeft: number;
};

/**
 * The gate, over the cards a deck was handed and the ids it believes are done.
 *
 * `done` is the deck's optimistic set, which is the right input: it holds the
 * server's completed ids at first render and gains the film the moment the
 * player credits it, so the button appears when the advisor finishes watching
 * rather than one `router.refresh()` later.
 */
export function quizGate(items: readonly GateItem[], done: ReadonlySet<string>): QuizGate {
  const completable = items.filter((i) => i.completable);
  const gating = completable.filter((i) => i.gates);
  const hasGatingItem = gating.length > 0;

  return {
    hasGatingItem,
    open: hasGatingItem && gating.every((i) => done.has(i.id)),
    /* A cue is anything that does not gate. Defined as the complement rather
       than as `kind === "cue"` so the two halves cannot overlap or leave a
       gap — every completable card is in exactly one of them. */
    cuesLeft: completable.filter((i) => !i.gates && !done.has(i.id)).length,
  };
}
