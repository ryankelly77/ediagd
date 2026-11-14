/* ============================================================================
   EDIAGD — THE SWIPE DETECTOR. Offline; no database, no network, no browser.

     npm run test:swipe

   ---------------------------------------------------------------------------
   WHAT THIS PROVES
   ---------------------------------------------------------------------------
   t63: on an onboarding screen long enough to scroll, scrolling down changed
   the screen. The phone tester's recording has it going BACK three times.

   The old rule was one line — `Math.abs(endX - startX) < 48` — and the whole
   defect is in what it did not measure. So every refusal below is also run
   through that old rule, and the count it would have accepted is printed. A
   test of a fix that the old code also passes is not evidence of anything.

   BOTH DIRECTIONS, EVERY TIME. A gate that refuses looks like it is working
   whether it is right or wrong. Every refusal here is paired with the
   acceptance that would catch the gate being broken shut — most importantly in
   the opt-out section, where a selector list that matched EVERYTHING would
   sail through all four refusals and leave the app with no swipe at all.

   ---------------------------------------------------------------------------
   SCOPE, STATED BEFORE THE FINDINGS
   ---------------------------------------------------------------------------
   This is the DETECTOR, in node. `classifySwipe` is the whole decision and
   takes four numbers, so it is tested exactly as the app runs it. The opt-out
   walk needs an `Element`, and there is no DOM in this repo's test runner, so
   it runs against a stand-in object and a 40-line selector matcher that knows
   nothing about OPT_OUT's contents — it parses whatever string it is given and
   THROWS on a selector it cannot parse, so a future entry it does not
   understand fails loudly rather than quietly matching nothing.

   What that covers: that OPT_OUT still names the controls it claims to, and
   that the walk goes up the tree. What it does not: shadow-DOM retargeting,
   and whether a real `<mux-player>` is the element a real touch reports. Both
   of those are settled in the browser and on the emulator, not here.
   ============================================================================ */
import {
  DIRECTION_RATIO,
  EDGE_ZONE,
  MAX_DURATION_MS,
  MIN_DISTANCE,
  OPT_OUT,
  classifySwipe,
  ownsTheDrag,
  swipeAnchor,
  type SwipeDirection,
} from "@/lib/swipe";

let passed = 0;
let failed = 0;
function ok(label: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(t: string) {
  console.log(`\n${t}`);
}

/** The rule this replaces, exactly as it stood in OnboardingFlow.tsx. */
function oldRule(dx: number): SwipeDirection | null {
  if (Math.abs(dx) < 48) return null;
  return dx > 0 ? "right" : "left";
}

/* ---- A stand-in for the two Element methods the walk uses ----------------- */

type Fake = {
  tag: string;
  attrs: Record<string, string>;
  classes: string[];
  parentElement: Fake | null;
  scrollWidth: number;
  clientWidth: number;
  overflowX: string;
  ownerDocument: unknown;
  closest(selector: string): unknown;
};

/**
 * Enough CSS to evaluate OPT_OUT: a tag name, `.class`, `[attr]`, `[attr=val]`
 * and any combination of those.
 *
 * IT THROWS ON ANYTHING ELSE, on purpose. A matcher that silently fails to
 * understand `:not(...)` would report "not opted out" and the test would read
 * as a pass — which is this repo's standing rule about a check that is silent
 * when it meets something its list does not mention.
 */
function matchesSimple(node: Fake, sel: string): boolean {
  const shape = /^([a-z][a-z0-9-]*)?((?:\.[A-Za-z0-9_-]+|\[[A-Za-z0-9_-]+(?:=[^\]]+)?\])*)$/;
  const m = shape.exec(sel.trim());
  if (!m) {
    throw new Error(
      `the stand-in matcher cannot parse "${sel}" from OPT_OUT — extend it rather than letting it return false`
    );
  }
  if (m[1] && m[1] !== node.tag) return false;

  for (const part of (m[2] ?? "").match(/\.[A-Za-z0-9_-]+|\[[^\]]+\]/g) ?? []) {
    if (part.startsWith(".")) {
      if (!node.classes.includes(part.slice(1))) return false;
      continue;
    }
    const body = part.slice(1, -1);
    const eq = body.indexOf("=");
    if (eq === -1) {
      if (!(body in node.attrs)) return false;
    } else {
      const name = body.slice(0, eq);
      const want = body.slice(eq + 1).replace(/^["']|["']$/g, "");
      if (node.attrs[name] !== want) return false;
    }
  }
  return true;
}

const view = {
  getComputedStyle(el: unknown) {
    return { overflowX: (el as Fake).overflowX };
  },
};
/* `body` is filled in below — the walk stops at it, so it has to be the same
   object every node's ownerDocument reports. */
const doc: { defaultView: typeof view; body: Fake | null } = {
  defaultView: view,
  body: null,
};

type Spec = {
  tag: string;
  attrs?: Record<string, string>;
  classes?: string[];
  scrollWidth?: number;
  clientWidth?: number;
  overflowX?: string;
};

function makeNode(spec: Spec): Fake {
  const node: Fake = {
    tag: spec.tag,
    attrs: spec.attrs ?? {},
    classes: spec.classes ?? [],
    parentElement: null,
    scrollWidth: spec.scrollWidth ?? 100,
    clientWidth: spec.clientWidth ?? 100,
    overflowX: spec.overflowX ?? "visible",
    ownerDocument: doc,
    closest(selector: string) {
      const sels = selector
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      let n: Fake | null = this as Fake;
      while (n) {
        for (const s of sels) if (matchesSimple(n, s)) return n;
        n = n.parentElement;
      }
      return null;
    },
  };
  return node;
}

const body = makeNode({ tag: "body" });
doc.body = body;

/** Leaf first, ancestors after. Returns the leaf, wired to its parents. */
function chain(...specs: Spec[]): Fake {
  const nodes = specs.map(makeNode);
  for (let i = 0; i < nodes.length - 1; i++) nodes[i]!.parentElement = nodes[i + 1]!;
  nodes[nodes.length - 1]!.parentElement = body;
  return nodes[0]!;
}

/** The shell every onboarding touch lands inside. */
const SHELL: Spec[] = [{ tag: "div" }, { tag: "main", classes: ["ediagd-app"] }];

function touchStartOn(target: unknown, clientX = 200, clientY = 400) {
  return swipeAnchor(
    {
      touches: { length: 1, 0: { clientX, clientY } },
      changedTouches: { length: 1, 0: { clientX, clientY } },
      target,
    },
    1_000,
    390
  );
}

/* ==========================================================================
   1. A VERTICAL SCROLL WITH SIDEWAYS DRIFT IS NOT A SWIPE
   ========================================================================== */
section("1. A scroll that wandered — the t63 recording");

{
  /* Going DOWN the page means the finger goes UP, so dy is negative. The drift
     range is the one the brief names: 60 to 120px of sideways wander over the
     pull. */
  const drifts: number[] = [];
  for (let d = 60; d <= 120; d += 2) drifts.push(d, -d);
  const pulls = [-180, -240, -320, -400, -520, -640];

  let refusedByTheRatioAlone = 0;
  let refusedWithTheScrollFlag = 0;
  let oldRuleAccepted = 0;
  let total = 0;

  for (const dx of drifts) {
    for (const dy of pulls) {
      total++;
      /* The scroll flag off: the direction ratio has to carry it on its own,
         because a dropped scroll event must not re-open the bug. */
      if (classifySwipe({ dx, dy, elapsedMs: 420, scrolled: false }) === null) {
        refusedByTheRatioAlone++;
      }
      if (classifySwipe({ dx, dy, elapsedMs: 420, scrolled: true }) === null) {
        refusedWithTheScrollFlag++;
      }
      if (oldRule(dx) !== null) oldRuleAccepted++;
    }
  }

  ok(
    `${total} scroll-with-drift gestures, all refused on geometry alone (60–120px drift over 180–640px of pull)`,
    refusedByTheRatioAlone === total,
    `${total - refusedByTheRatioAlone} slipped through`
  );
  ok(
    `the same ${total} refused with the scroll flag set too`,
    refusedWithTheScrollFlag === total
  );
  ok(
    `the OLD rule accepted ${oldRuleAccepted} of those ${total} — which is the bug, and is why this file is not vacuous`,
    oldRuleAccepted === total,
    "the old rule refused some of them, so the reproduction above is wrong"
  );
}

{
  /*
   * THE CASE THE RATIO CANNOT REACH, AND THE REASON `scrolled` EXISTS.
   *
   * 30px down and 100px sideways passes the ratio (100 >= 60) and is still a
   * scroll — it is what a pull looks like on a screen with 30px of overflow
   * left. The ratio says swipe; the scroller says it moved. The scroller wins.
   */
  const flat = { dx: 100, dy: -30, elapsedMs: 300 };
  ok(
    "a short flat drag passes the direction ratio (so the ratio alone is NOT the whole fix)",
    classifySwipe({ ...flat, scrolled: false }) === "right"
  );
  ok(
    "…and is refused once the body reports it scrolled",
    classifySwipe({ ...flat, scrolled: true }) === null
  );
}

/* ==========================================================================
   2. A QUICK HORIZONTAL SWIPE IS STILL A SWIPE
   ========================================================================== */
section("2. The acceptance half — a deliberate swipe still works");

{
  let accepted = 0;
  let wrongWay = 0;
  let total = 0;
  for (const dx of [-200, -140, -110, -80, 80, 110, 140, 200]) {
    for (const dy of [-30, -12, 0, 12, 30]) {
      for (const elapsedMs of [90, 180, 300, 500, 690]) {
        total++;
        const dir = classifySwipe({ dx, dy, elapsedMs, scrolled: false });
        if (dir === null) continue;
        accepted++;
        if (dir !== (dx > 0 ? "right" : "left")) wrongWay++;
      }
    }
  }
  ok(
    `${accepted} of ${total} quick horizontal swipes accepted (80–200px, ≤30px of vertical slop, 90–690ms)`,
    accepted === total,
    `${total - accepted} refused — the gate is broken shut`
  );
  ok("every one reported the direction the thumb actually went", wrongWay === 0);

  ok(
    `${MIN_DISTANCE - 1}px is a tap, ${MIN_DISTANCE}px is a decision`,
    classifySwipe({ dx: MIN_DISTANCE - 1, dy: 0, elapsedMs: 200, scrolled: false }) === null &&
      classifySwipe({ dx: MIN_DISTANCE, dy: 0, elapsedMs: 200, scrolled: false }) === "right"
  );
  ok(
    `the ratio boundary: ${DIRECTION_RATIO}× vertical is in, a hair under is out`,
    classifySwipe({ dx: 100, dy: -50, elapsedMs: 200, scrolled: false }) === "right" &&
      classifySwipe({ dx: 100, dy: -51, elapsedMs: 200, scrolled: false }) === null
  );
}

/* ==========================================================================
   3. A SLOW DRAG IS NOT A SWIPE
   ========================================================================== */
section("3. A drag is not a fling");

{
  let refused = 0;
  let total = 0;
  for (const dx of [-300, -140, 140, 300]) {
    for (const elapsedMs of [701, 800, 1200, 2500, 9000]) {
      total++;
      if (classifySwipe({ dx, dy: 0, elapsedMs, scrolled: false }) === null) refused++;
    }
  }
  ok(`${total} slow drags refused (>${MAX_DURATION_MS}ms, any distance)`, refused === total);
  ok(
    `${MAX_DURATION_MS}ms is still a fling, ${MAX_DURATION_MS + 1}ms is a drag`,
    classifySwipe({ dx: 140, dy: 0, elapsedMs: MAX_DURATION_MS, scrolled: false }) === "right" &&
      classifySwipe({ dx: 140, dy: 0, elapsedMs: MAX_DURATION_MS + 1, scrolled: false }) === null
  );
  ok(
    `the old rule accepted all ${total} of them — it never looked at the clock`,
    [-300, -140, 140, 300].every((dx) => oldRule(dx) !== null)
  );
}

/* ==========================================================================
   4. A TOUCH THAT STARTS ON A CONTROL THAT OWNS THE DRAG
   ========================================================================== */
section("4. The opt-out list — what the finger came down on");

{
  ok(
    "a bare <video> is opted out",
    ownsTheDrag(chain({ tag: "video" }, ...SHELL)) === true
  );
  ok(
    "an <input type=range> is opted out",
    ownsTheDrag(chain({ tag: "input", attrs: { type: "range" } }, ...SHELL)) === true
  );
  ok(
    "<mux-player> is opted out — the entry that read `.mux-player` and matched nothing",
    ownsTheDrag(chain({ tag: "mux-player" }, ...SHELL)) === true
  );
  ok(
    "something inside a [data-no-swipe] ancestor is opted out (the welcome film, the schedule card)",
    ownsTheDrag(
      chain(
        { tag: "button" },
        { tag: "div", attrs: { "data-no-swipe": "" } },
        ...SHELL
      )
    ) === true
  );
  ok(
    "a container with somewhere horizontal to scroll is opted out",
    ownsTheDrag(
      chain(
        { tag: "td" },
        { tag: "div", scrollWidth: 900, clientWidth: 390, overflowX: "auto" },
        ...SHELL
      )
    ) === true
  );

  /* ---- THE ACCEPTANCE HALF OF THIS SECTION ------------------------------
     Four refusals above are all satisfied by a selector list that matches
     everything, which would turn the swipe off app-wide and look like a pass.
     These are what catch that. */
  ok(
    "ordinary copy is NOT opted out — a swipe on the body still starts",
    ownsTheDrag(chain({ tag: "p" }, { tag: "section" }, ...SHELL)) === false
  );
  ok(
    "an <input type=checkbox> is NOT opted out — `input[type=range]` is not matching every input",
    ownsTheDrag(chain({ tag: "input", attrs: { type: "checkbox" } }, ...SHELL)) === false
  );
  ok(
    "a day toggle in the schedule form, OUTSIDE the marked card, is NOT opted out",
    ownsTheDrag(chain({ tag: "button" }, { tag: "div", classes: ["ediagd-card"] }, ...SHELL)) ===
      false
  );
  ok(
    "a container with nothing to scroll to is NOT opted out, even with overflow-x auto",
    ownsTheDrag(
      chain(
        { tag: "span" },
        { tag: "div", scrollWidth: 390, clientWidth: 390, overflowX: "auto" },
        ...SHELL
      )
    ) === false
  );

  /* And the gesture is refused outright, not merely flagged. */
  ok(
    "swipeAnchor returns null for a touch starting on the scrubber",
    touchStartOn(chain({ tag: "mux-player" }, ...SHELL)) === null
  );
  ok(
    "swipeAnchor returns an anchor for a touch starting on copy",
    touchStartOn(chain({ tag: "p" }, { tag: "section" }, ...SHELL)) !== null
  );
}

/* ==========================================================================
   5. THE EDGE ZONE AND THE SECOND FINGER
   ========================================================================== */
section("5. Whose gesture is it");

{
  const copy = () => chain({ tag: "p" }, { tag: "section" }, ...SHELL);
  ok(
    `x=${EDGE_ZONE} belongs to the system, x=${EDGE_ZONE + 1} is ours (left edge)`,
    touchStartOn(copy(), EDGE_ZONE) === null && touchStartOn(copy(), EDGE_ZONE + 1) !== null
  );
  ok(
    `x=${390 - EDGE_ZONE} belongs to the system, x=${390 - EDGE_ZONE - 1} is ours (right edge)`,
    touchStartOn(copy(), 390 - EDGE_ZONE) === null &&
      touchStartOn(copy(), 390 - EDGE_ZONE - 1) !== null
  );
  ok(
    "two fingers is a pinch, never a swipe",
    swipeAnchor(
      {
        touches: { length: 2, 0: { clientX: 200, clientY: 400 }, 1: { clientX: 240, clientY: 420 } },
        changedTouches: { length: 1, 0: { clientX: 200, clientY: 400 } },
        target: copy(),
      },
      1_000,
      390
    ) === null
  );
}

/* ==========================================================================
   6. THE NUMBERS ARE SWIPENAVIGATION'S, NOT NEW ONES
   ========================================================================== */
section("6. One detector, one set of numbers");

{
  /* Locked deliberately. The point of the change was that onboarding stops
     having its own opinion about what a swipe is; if someone loosens these for
     onboarding's sake, they are loosening them for the whole app and should
     have to come through here. */
  ok(`MIN_DISTANCE is 80 (was 48 in onboarding)`, MIN_DISTANCE === 80);
  ok(`DIRECTION_RATIO is 2 (onboarding had no second axis at all)`, DIRECTION_RATIO === 2);
  ok(`MAX_DURATION_MS is 700 (onboarding had no clock)`, MAX_DURATION_MS === 700);
  ok(`EDGE_ZONE is 28 (onboarding had no edge zone)`, EDGE_ZONE === 28);
  ok(
    "OPT_OUT names the scrubber, the range input and the explicit hatch",
    OPT_OUT.includes("mux-player") &&
      OPT_OUT.includes("input[type=range]") &&
      OPT_OUT.includes("[data-no-swipe]")
  );
}

console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
