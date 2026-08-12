#!/usr/bin/env python3
"""
EDIAGD — turn curriculum_map.csv into the TSV that import.sql loads.

    python3 scripts/build-curriculum-tsv.py

Run from the repo root. Reads supabase/curriculum/curriculum_map.csv and writes
supabase/curriculum/curriculum.tsv.

WHY A SCRIPT AND NOT A ONE-LINER. The first import generated this file ad hoc,
which meant the only record of how the TSV was produced was a shell history.
Re-running the import after Mitch reshapes the curriculum needs the conversion
to be repeatable by someone who wasn't there.

WHY TSV AND NOT THE CSV DIRECTLY. \\copy needs a delimiter that cannot appear in
the data. Cue titles and bodies are full of commas; none of the seven columns
carried through here can contain a tab, so the ambiguity disappears. The two
free-text columns the CSV carries for human reading (cue_title,
cue_body_prefix) are deliberately dropped — the join is on match_key, and
carrying prose through \\copy is how a delimiter bug gets in.

WHY PYTHON. There is no CSV parser in the dependency tree and no tsx runner;
the bodies are quoted and contain commas and newlines, so a hand-rolled split
would corrupt them. This is build-time data prep, not application code.
"""

import csv
import os
import re
import sys

SRC = "supabase/curriculum/curriculum_map.csv"
DST = "supabase/curriculum/curriculum.tsv"

# Columns import.sql's _map expects, in this order.
COLUMNS = ["match_key", "track", "course", "module",
           "name_status", "module_order", "lesson_order"]

STATUS = {"NEEDS NAME": "needs_name", "OK": "ok"}

# Anything a tab or newline could smuggle through \copy.
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

    out = []
    bad_status = set()
    for r in rows:
        raw = clean(r.get("module_name_status", ""))
        status = STATUS.get(raw.upper())
        if status is None:
            # Unknown marker means the CSV's vocabulary changed. Treat it as
            # needing a name rather than silently claiming the name is fine —
            # a wrong 'ok' hides a module from the rename queue for good.
            bad_status.add(raw)
            status = "needs_name"

        out.append([
            clean(r["match_key"]),
            clean(r["track"]),
            clean(r["course"]),
            clean(r["module"]),
            status,
            clean(r["module_order"]),
            clean(r["lesson_order"]),
        ])

    with open(DST, "w", encoding="utf-8", newline="") as f:
        for row in out:
            f.write("\t".join(row) + "\n")

    modules = {(r[1], r[2], r[3]) for r in out}
    courses = {(r[1], r[2]) for r in out}
    print(f"wrote {DST}")
    print(f"  rows          {len(out)}")
    print(f"  distinct keys {len({r[0] for r in out})}")
    print(f"  courses       {len(courses)}")
    print(f"  modules       {len(modules)}")
    print(f"  needs_name    {sum(1 for r in out if r[4] == 'needs_name')} rows")
    if bad_status:
        print(f"  WARNING unrecognised module_name_status values, "
              f"treated as needs_name: {sorted(bad_status)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
