/* ============================================================================
   EDIAGD — every word that can reach somebody's lock screen

   ┌──────────────────────────────────────────────────────────────────────────┐
   │  PLACEHOLDER COPY. MARKED FOR MITCH'S VOICE PASS.                        │
   │                                                                          │
   │  The STRUCTURE here is the deliverable — which triggers exist, what each │
   │  one is allowed to say, what it interpolates, where it lands. The WORDS  │
   │  are Mitch's to write. Rewrite the strings freely; changing the shape    │
   │  means changing the generator in 0056 too.                               │
   └──────────────────────────────────────────────────────────────────────────┘

   WHY A SEPARATE FILE FROM THE IN-APP COPY. A notification is read on a lock
   screen by somebody who did not ask for it, one line at a time, possibly while
   driving to work. It is the least forgiving surface in the product, and the
   only one where a bad sentence costs the app's permission to speak at all.

   THE RULES, WHICH ARE NOT STYLE PREFERENCES
   ------------------------------------------
   1. NEVER RED-FLAVOURED. Not the colour — the tone. No "falling behind", no
      "you missed", no "last chance", no urgency manufactured out of nothing.
      README.md's "never use red" is a brand rule about attention, and this is
      the same rule applied to language.
   2. NEVER A COMPARISON TO A TEAMMATE. Not by name, not by rank, not by
      implication. "You're 4th on the board" is forbidden. The store average is
      allowed, because a benchmark is not a person.
   3. ADVISORS RECEIVE WINS AND INVITATIONS ONLY — 0030's rule 2, and enforced
      as a database trigger in 0056, not left to whoever edits this file.
   4. THE STREAK KEEPER IS AN INVITATION, NEVER A WARNING. It fires only while
      the streak is ALIVE and never to report one broken. "One session keeps it
      going" — never "don't lose your streak".
   5. ONE THOUGHT PER NOTIFICATION. Title is the news; body is the reason to
      tap. If it needs a third sentence it is a screen, not a notification.

   KEEP IN STEP WITH SQL. The generator runs in Postgres and reads the same
   strings from push_copy() in 0056. Two copies of a string is a drift risk, so
   `npm run preview:push` asserts these agree and fails loudly if they do not.
   ============================================================================ */

export type PushKind =
  | "daily_numbers"
  | "eddies_pick"
  | "personal_best"
  | "streak_keeper"
  | "manager_digest";

export type PushCopy = {
  kind: PushKind;
  /** Lock-screen headline. Short — iOS truncates around 40 characters. */
  title: string;
  /** One sentence. The reason to tap. */
  body: string;
  /** In-app route a tap lands on. Never an external URL, never /login. */
  deepLink: string;
  /** Tokens the generator substitutes. Empty means the string is literal. */
  tokens: string[];
  /** Why this trigger exists at all — the argument for interrupting somebody. */
  why: string;
};

export const PUSH_COPY: Record<PushKind, PushCopy> = {
  daily_numbers: {
    kind: "daily_numbers",
    title: "Aloha — yesterday's numbers are in",
    body: "Take three minutes and see where you landed.",
    deepLink: "/advisor",
    tokens: [],
    why:
      "The daily habit is the product. This is the knock on the door, and it " +
      "carries no verdict — the numbers are simply in, good or bad.",
  },

  eddies_pick: {
    kind: "eddies_pick",
    title: "Eddie's Pick is ready",
    body: "{family} is your biggest opportunity today. Here's the word track.",
    deepLink: "/advisor",
    tokens: ["{family}"],
    why:
      "The pick is the single most useful thing the app knows about somebody's " +
      "day. Named as an opportunity with a word track attached, never as a gap.",
  },

  personal_best: {
    kind: "personal_best",
    title: "That's a personal best",
    body: "Your best month yet. Take the win — you earned it.",
    deepLink: "/advisor",
    tokens: [],
    why:
      "The gold moment. The only kind allowed to stack, because a second best " +
      "in one day is a better day and not a louder app.",
  },

  streak_keeper: {
    kind: "streak_keeper",
    title: "Your streak is still going",
    body: "{days} days so far. One three-minute session keeps it going.",
    deepLink: "/today",
    tokens: ["{days}"],
    why:
      "Fires only while the Swell is ALIVE, on a day they were scheduled to " +
      "work, before they have completed it. Never fires to report a broken " +
      "streak — that is a notification whose only content is disappointment.",
  },

  manager_digest: {
    kind: "manager_digest",
    title: "Your team's week",
    body: "A look at how your {n} advisors finished the week.",
    deepLink: "/manager",
    tokens: ["{n}"],
    why:
      "One per week, to a coach. Coaches get team-shaped information; advisors " +
      "never do, because a team summary read by an advisor is a leaderboard.",
  },
};

/** Words that must never appear in a notification. Checked by the preview. */
export const FORBIDDEN_TONE = [
  "behind", "missed", "last chance", "don't lose", "dont lose", "failing",
  "worst", "bottom", "lowest", "beat ", "ahead of", "rank", "leaderboard",
  "urgent", "warning", "alert", "problem", "poor",
] as const;

/**
 * Structural lint over the copy above. Not a unit test — there is no test
 * runner in this repo — but the preview script runs it, so a bad string is
 * caught before anybody sees it on a phone.
 */
export function lintPushCopy(): string[] {
  const problems: string[] = [];

  for (const c of Object.values(PUSH_COPY)) {
    const hay = `${c.title} ${c.body}`.toLowerCase();
    for (const word of FORBIDDEN_TONE) {
      if (hay.includes(word)) {
        problems.push(`${c.kind}: contains forbidden tone "${word.trim()}"`);
      }
    }
    if (c.title.length > 48) {
      problems.push(`${c.kind}: title is ${c.title.length} chars — iOS truncates near 40`);
    }
    if (!c.deepLink.startsWith("/")) {
      problems.push(`${c.kind}: deepLink "${c.deepLink}" is not an in-app route`);
    }
    if (c.deepLink.startsWith("/login")) {
      problems.push(`${c.kind}: deepLink lands on the login page`);
    }
    for (const t of c.tokens) {
      if (!c.body.includes(t) && !c.title.includes(t)) {
        problems.push(`${c.kind}: declares token ${t} but never uses it`);
      }
    }
    // A body that interpolates nothing and repeats the title is one thought
    // stretched over two lines.
    if (c.body.toLowerCase() === c.title.toLowerCase()) {
      problems.push(`${c.kind}: body repeats the title`);
    }
  }
  return problems;
}
