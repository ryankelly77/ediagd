#!/usr/bin/env python3
"""
EDIAGD — turn quiz_seed.csv into the TSV that import_quiz.sql loads.

    python3 scripts/build-quiz-tsv.py

Run from the repo root. Reads supabase/curriculum/quiz_seed.csv and writes
supabase/curriculum/quiz.tsv.

Companion to build-curriculum-tsv.py, and the same reasoning applies: the first
quiz import generated its TSV ad hoc, so the conversion existed only in a shell
history. It also now has to carry a column it did not carry before.

SOURCE_CUE_TITLE IS THE POINT OF THIS REVISION. Each question names the cue it
was drawn from; import_quiz.sql resolves that title to a content id within the
same module, which is what turns "have another look through this module's cues"
into a link to the actual card. The title is carried as text and resolved in
SQL rather than resolved here, because only the database knows which content
rows exist and which module they landed in.

sort_order is assigned by position within a module, so the authored sequence
survives rather than being alphabetised by the insert.
"""

import csv
import os
import re
import sys

SRC = "supabase/curriculum/quiz_seed.csv"
DST = "supabase/curriculum/quiz.tsv"

# Columns import_quiz.sql's _quiz table expects, in this order.
COLUMNS = ["course", "module", "question", "option_a", "option_b", "option_c",
           "option_d", "answer", "explanation", "sort_order", "source_cue_title"]

WS = re.compile(r"\s+")


def clean(value: str) -> str:
    """Collapse whitespace so no field can carry a tab or a newline."""
    return WS.sub(" ", (value or "").strip())


def main() -> int:
    if not os.path.exists(SRC):
        print(f"error: {SRC} not found — run from the repo root", file=sys.stderr)
        return 1

    with open(SRC, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))

    if not rows:
        print(f"error: {SRC} is empty", file=sys.stderr)
        return 1

    seen_per_module: dict[tuple[str, str], int] = {}
    out = []
    bad_answers = []
    missing_source = 0

    for r in rows:
        course = clean(r["course"])
        module = clean(r["module"])
        answer = clean(r.get("answer", "")).lower()

        if answer not in {"a", "b", "c", "d"}:
            # Refuse rather than guess: a bad key silently marks everyone wrong.
            bad_answers.append((module, clean(r["question"])[:50], answer))
            continue

        key = (course, module)
        seen_per_module[key] = seen_per_module.get(key, 0) + 1

        source_cue = clean(r.get("source_cue_title", ""))
        if not source_cue:
            missing_source += 1

        out.append([
            course,
            module,
            clean(r["question"]),
            clean(r["option_a"]),
            clean(r["option_b"]),
            clean(r["option_c"]),
            clean(r["option_d"]),
            answer,
            clean(r.get("explanation", "")),
            str(seen_per_module[key]),
            source_cue,
        ])

    if bad_answers:
        print("error: rows with an answer key that is not a/b/c/d:", file=sys.stderr)
        for m, q, a in bad_answers:
            print(f"  {m} :: {q}  answer={a!r}", file=sys.stderr)
        return 1

    with open(DST, "w", encoding="utf-8", newline="") as f:
        for row in out:
            f.write("\t".join(row) + "\n")

    print(f"wrote {DST}")
    print(f"  questions        {len(out)}")
    print(f"  modules          {len(seen_per_module)}")
    print(f"  with source cue  {len(out) - missing_source}")
    if missing_source:
        print(f"  WITHOUT source cue {missing_source} "
              f"(these fall back to a link to the start of the deck)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
