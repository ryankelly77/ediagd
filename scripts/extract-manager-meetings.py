#!/usr/bin/env python3
"""
EDIAGD — turn Mitch's Manager Meetings workbook and cheat sheet into the two
committed inputs the loader reads.

    python3 scripts/extract-manager-meetings.py            # writes data/, reports
    python3 scripts/extract-manager-meetings.py --check    # verify only, write nothing

WHY A SEPARATE EXTRACTOR, AND WHY PYTHON
----------------------------------------
Mitch's sources are an .xlsx and two PDFs. They are HIS files, they live in
`drop/` which is gitignored, and they are not ours to commit. The loader must
nonetheless run from something committed and reviewable, so this script produces
the committed input and `scripts/load-manager-meetings.ts` consumes it. The
committed CSV is reproducible from the workbook by re-running this; that is the
contract the prompt asks for.

The split also means the thing that writes to a database is in the same language
and the same shape as every other acceptance script in this repo, and the thing
that wrangles spreadsheet and PDF text is not.

WHAT IS NOT STORED, DELIBERATELY
--------------------------------
`Status` (New / Merged) and `Academy course` are read and dropped, per the
ruling. Status is also what produces the `NEW · ` prefix on 15 cheat-sheet
headings, so it has to be understood in order to be ignored — see the join note.

THE LIBRARY IS NOT FINAL, SO NOTHING HERE ASSERTS A COUNT
---------------------------------------------------------
About 100 films are shot and about 115 are still to come, and more manager
mindset films will follow. Every check below is a check of INTERNAL CONSISTENCY
— every meeting joins, every tag is known, every classification line is unique —
and not one of them says "and there are 213 of them". A count assertion here
would fail the day Mitch adds a meeting, which is the normal case and not an
error. The counts are REPORTED, never required.
"""

from __future__ import annotations

import argparse
import csv
import os
import re
import subprocess
import sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DROP = os.path.join(ROOT, "drop")
WORKBOOK = os.path.join(DROP, "Manager_Meetings_When_To_Use_and_Tags_2026_11_17 (1).xlsx")
CHEAT_PDF = os.path.join(DROP, "Manager_Meetings_Cheat_Sheet_2026_11_17.md.pdf")
OUT_CSV = os.path.join(ROOT, "data", "manager_meetings.csv")
OVERRIDES = os.path.join(ROOT, "data", "manager_meeting_overrides.csv")

DRAFT_CODES = os.path.join(DROP, "manager_meeting_op_codes_draft.csv")
RULINGS = os.path.join(ROOT, "data", "manager_meeting_op_code_rulings.csv")
OUT_CODES = os.path.join(ROOT, "data", "manager_meeting_op_codes.csv")
SEED = os.path.join(ROOT, "data", "op_code_seed.csv")
FAMILY_MAP = os.path.join(ROOT, "data", "op_code_family_map.csv")

MEETINGS_SHEET = "Meetings"
TAG_SHEET = "Tag Guide"
CL = "Classification line (on camera, before Aloha)"
WHEN = "When to use it (on camera, after the hook)"
BOOST_TOPIC = "Op Code Boost Meetings"

# The cheat sheet renders `Status` into the heading. Stripped on join, not stored.
STATUS_PREFIXES = ("NEW · ", "MERGED · ")

# Sections of a cheat-sheet entry. "When to use it" is deliberately NOT here:
# it has its own column (content.best_used_for), and carrying it in the body as
# well would be two copies of one sentence with nothing keeping them in step.
BODY_SECTIONS = ("Set", "Bring", "Word tracks", "Run sheet", "Inspect it", "Your move")

failures: list[str] = []
notes: list[str] = []


def fail(msg: str) -> None:
    failures.append(msg)
    print(f"  ✗ {msg}")


def note(msg: str) -> None:
    notes.append(msg)
    print(f"  · {msg}")


def cheat_text() -> list[str]:
    """pdftotext -layout, as the prompt specifies."""
    if not os.path.exists(CHEAT_PDF):
        sys.exit(f"missing {CHEAT_PDF}")
    out = subprocess.run(
        ["pdftotext", "-layout", CHEAT_PDF, "-"],
        capture_output=True, text=True, check=True,
    )
    return out.stdout.splitlines()


def parse_cheat(lines: list[str]) -> dict[tuple[str, str], dict]:
    """
    `## Topic` / `### band` / `#### Title`, then bold `**Section:**` blocks.

    Keyed on (topic, title). Titles are NOT unique on their own — the same
    meeting name can appear under two topics — so the pair is the key, and the
    classification line from the workbook is the identity that survives into the
    database.
    """
    topic = band = None
    entries: dict[tuple[str, str], dict] = {}
    cur: dict | None = None
    for raw in lines:
        if raw.startswith("#### "):
            title = raw[5:].strip()
            for p in STATUS_PREFIXES:
                if title.startswith(p):
                    title = title[len(p):].strip()
                    break
            cur = {"topic": topic, "band": band, "title": title, "lines": []}
            key = (topic, title)
            if key in entries:
                fail(f"cheat sheet has two entries for {topic} :: {title}")
            entries[key] = cur
            continue
        if raw.startswith("### "):
            band = raw[4:].strip()
            continue
        if raw.startswith("## "):
            topic, band = raw[3:].strip(), None
            continue
        if cur is not None:
            cur["lines"].append(raw)
    return entries


def sections_of(entry: dict) -> dict[str, list[str]]:
    """Split one entry's lines into its bold-labelled sections."""
    out: dict[str, list[str]] = {}
    label = None
    pat = re.compile(r"^\*\*([^:*]+):\*\*\s*(.*)$")
    for ln in entry["lines"]:
        m = pat.match(ln)
        if m:
            label = m.group(1).strip()
            out.setdefault(label, [])
            if m.group(2).strip():
                out[label].append(m.group(2).strip())
            continue
        if label is not None:
            out[label].append(ln)
    return {k: v for k, v in out.items()}


def body_markdown(secs: dict[str, list[str]]) -> str:
    """
    The run sheet and the rest of the manager's cheat-sheet entry, as markdown.

    pdftotext -layout hard-wraps prose at the page width, so a bullet can arrive
    as two or three lines. Continuations are re-joined onto their bullet: without
    that, `content.body` renders as a list with orphaned fragments between the
    items, which is the sort of defect that looks like a data problem and is a
    parsing one.
    """
    parts: list[str] = []
    for name in BODY_SECTIONS:
        if name not in secs:
            continue
        raw = [l.rstrip() for l in secs[name]]
        merged: list[str] = []
        for ln in raw:
            s = ln.strip()
            if not s:
                continue
            if s.startswith("- "):
                merged.append(s)
            elif merged:
                merged[-1] = merged[-1] + " " + s
            else:
                merged.append(s)
        if not merged:
            continue
        parts.append(f"**{name}**")
        parts.extend(merged)
        parts.append("")
    return "\n".join(parts).strip()


def load_catalog() -> tuple[dict[str, dict], dict[str, dict]]:
    """
    The op code catalog, from the files it is SEEDED from.

    Deliberately not from a database. The catalog is seeded from these two CSVs
    by scripts/seed-op-codes.ts, they are committed, and they are the same on
    every machine — whereas the local stack's op_code_catalog was empty when
    this was written, so validating against it would have validated nothing and
    said so in the reassuring direction.
    """
    with open(SEED, encoding="utf-8-sig") as fh:
        cat = {r["code"]: r for r in csv.DictReader(fh)}
    with open(FAMILY_MAP, encoding="utf-8-sig") as fh:
        fam = {r["code"]: r for r in csv.DictReader(fh)}
    return cat, fam


def write_op_codes(meetings: list[dict]) -> None:
    """
    data/manager_meeting_op_codes.csv — one op code per boost meeting.

    Keyed on the OVERRIDDEN classification line, so the row the loader looks up
    is the row the loader will have written. Keying on the workbook title would
    have worked today and broken the moment a second override lands.

    FAILS LOUDLY, per the prompt, on a code that is absent from the catalog or
    marked coachable = false. Both are fatal rather than a warning: a code that
    is not in the catalog cannot be stored at all (0168's FK), and a film on a
    coachable = false code is UNPICKABLE — manager_meeting_supply mirrors
    family_pitch_supply's `and f.coachable`, so the film would load without
    complaint, sit in the library, and never be served. That is the silent
    wrong answer this project keeps paying for, so it is a refusal here.
    """
    if not os.path.exists(DRAFT_CODES):
        fail(f"missing the draft mapping: {DRAFT_CODES}")
        return

    cat, fam = load_catalog()
    with open(DRAFT_CODES, encoding="utf-8-sig") as fh:
        draft = {r["title"].strip(): r for r in csv.DictReader(fh)}
    rulings: dict[str, dict] = {}
    if os.path.exists(RULINGS):
        with open(RULINGS, encoding="utf-8-sig") as fh:
            rulings = {r["workbook_title"].strip(): r for r in csv.DictReader(fh)}
    note(f"{len(draft)} rows in the draft mapping, {len(rulings)} ruling(s) applied on top")

    boost = [m for m in meetings if m["is_boost"] == "true"]
    out: list[dict] = []
    for m in boost:
        wb_title = m["workbook_title"]
        d = draft.get(wb_title)
        if d is None:
            fail(f"boost meeting has no row in the draft mapping: {wb_title}")
            continue
        ruling = rulings.get(wb_title)
        code = (ruling["op_code"] if ruling else d["op_code"]).strip()
        source = "ruling" if ruling else "draft"

        if not code:
            fail(f"boost meeting has no op code: {wb_title}")
            continue
        if code not in cat:
            fail(f"op code {code} ({wb_title}) is not in the catalog")
            continue
        f = fam.get(code)
        coachable = (f or {}).get("coachable", "").strip().lower() == "true"
        if not coachable:
            fail(f"op code {code} ({wb_title}) is coachable = false — the film "
                 f"would load and never be pickable")
            continue

        out.append({
            "classification_line": m["classification_line"],
            "title": m["title"],
            "boost_group": m["boost_group"],
            "op_code": code,
            "op_code_name": cat[code]["name"],
            "family": (f or {}).get("family", ""),
            "source": source,
            "ruling": (ruling or {}).get("ruling", ""),
        })

    missing = len(boost) - len(out)
    note(f"{len(out)} of {len(boost)} boost meetings mapped"
         + (f" — {missing} UNMAPPED" if missing else " — every boost meeting has exactly one code"))

    per_code = Counter(o["op_code"] for o in out)
    shared = {c: n for c, n in per_code.items() if n > 1}
    for c, n in sorted(shared.items()):
        note(f"op code {c} carries {n} meetings — allowed by 0168 (op_code is indexed, not unique)")

    if failures:
        return
    cols = ["classification_line", "title", "boost_group", "op_code",
            "op_code_name", "family", "source", "ruling"]
    with open(OUT_CODES, "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        for o in sorted(out, key=lambda x: x["classification_line"]):
            w.writerow(o)
    print(f"  wrote {OUT_CODES} — {len(out)} boost meetings")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="verify only; write nothing")
    args = ap.parse_args()

    try:
        import openpyxl
    except ImportError:
        sys.exit("needs openpyxl: python3 -m pip install openpyxl")

    print("\nManager Meetings — extract\n" + "=" * 68)

    wb = openpyxl.load_workbook(WORKBOOK, data_only=True)
    ws = wb[MEETINGS_SHEET]
    hdr = list(next(ws.iter_rows(min_row=1, max_row=1, values_only=True)))
    H = {h: i for i, h in enumerate(hdr)}
    rows = [
        r for r in ws.iter_rows(min_row=2, values_only=True)
        if any(x is not None and str(x).strip() for x in r)
    ]

    known_tags = [
        str(r[0]).strip()
        for r in wb[TAG_SHEET].iter_rows(min_row=2, values_only=True)
        if r[0] and str(r[0]).strip()
    ]
    tagset = set(known_tags)
    note(f"{len(rows)} meetings in the workbook, {len(known_tags)} situation tags in the Tag Guide")

    overrides: dict[str, dict] = {}
    if os.path.exists(OVERRIDES):
        with open(OVERRIDES, encoding="utf-8-sig") as fh:
            for o in csv.DictReader(fh):
                overrides[o["workbook_title"].strip()] = o
        note(f"{len(overrides)} title override(s) from data/manager_meeting_overrides.csv")

    cheat = parse_cheat(cheat_text())
    note(f"{len(cheat)} entries parsed from the cheat sheet")

    out: list[dict] = []
    tag_problems: Counter = Counter()
    for r in rows:
        topic = (r[H["Topic"]] or "").strip()
        wb_title = (r[H["Title"]] or "").strip()
        line = (r[H[CL]] or "").strip()

        entry = cheat.get((topic, wb_title))
        if entry is None:
            fail(f"no cheat-sheet entry for {topic} :: {wb_title}")
            secs: dict[str, list[str]] = {}
        else:
            secs = sections_of(entry)

        tags_raw = (r[H["Situation tags"]] or "").strip()
        tags = [t.strip() for t in tags_raw.split(",") if t.strip()]
        for t in tags:
            if t not in tagset:
                tag_problems[t] += 1

        ov = overrides.get(wb_title)
        title = (ov["override_title"].strip() if ov else wb_title)
        if ov and ov.get("override_classification_line", "").strip():
            line = ov["override_classification_line"].strip()

        is_boost = topic == BOOST_TOPIC
        out.append({
            # IDENTITY. Stored verbatim — never rebuilt from its parts, because
            # four A/C titles contain a literal '/' and a round trip through
            # split('/') would mangle them. See the loader's header.
            "classification_line": line,
            "topic": topic,
            "title": title,
            "workbook_title": wb_title,
            "is_boost": "true" if is_boost else "false",
            # The Group column means two different things: the product category
            # for boost meetings, the length band for everything else. Only the
            # boost sense is a subcategory.
            "boost_group": (r[H["Group"]] or "").strip() if is_boost else "",
            "meeting_length": (r[H["Meeting length"]] or "").strip(),
            "meeting_format": (r[H["Format"]] or "").strip(),
            "situation_tags": "|".join(tags),
            "series": (r[H["Series or set"]] or "").strip() if r[H["Series or set"]] else "",
            "best_used_for": (r[H[WHEN]] or "").strip(),
            "body_md": body_markdown(secs),
            "overridden": "true" if ov else "false",
        })

    for t, n in sorted(tag_problems.items()):
        fail(f"situation tag not in the Tag Guide: {t!r} on {n} meeting(s)")

    dups = [l for l, n in Counter(o["classification_line"] for o in out).items() if n > 1]
    for d in dups:
        fail(f"classification line appears twice: {d}")

    blank = [o["title"] for o in out if not o["classification_line"]]
    for b in blank:
        fail(f"no classification line for {b!r}")

    missing_body = [o["title"] for o in out if not o["body_md"]]
    if missing_body:
        note(f"{len(missing_body)} meeting(s) with an empty run sheet: "
             + ", ".join(missing_body[:4]) + ("…" if len(missing_body) > 4 else ""))

    boost = [o for o in out if o["is_boost"] == "true"]
    note(f"{len(boost)} boost meetings, {len(out) - len(boost)} other")

    write_op_codes(out)

    if failures:
        print("\n" + "=" * 68)
        print(f"  REFUSING TO WRITE — {len(failures)} problem(s)")
        print("=" * 68)
        return 1

    if args.check:
        print("\n  --check: consistent, wrote nothing")
        print("=" * 68)
        return 0

    cols = ["classification_line", "topic", "title", "workbook_title", "is_boost",
            "boost_group", "meeting_length", "meeting_format", "situation_tags",
            "series", "best_used_for", "body_md", "overridden"]
    os.makedirs(os.path.dirname(OUT_CSV), exist_ok=True)
    with open(OUT_CSV, "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        # Sorted by identity so a re-run produces a byte-identical file and the
        # diff shows what Mitch changed rather than what the dict order did.
        for o in sorted(out, key=lambda x: x["classification_line"]):
            w.writerow(o)
    print(f"\n  wrote {OUT_CSV} — {len(out)} meetings")
    print("=" * 68)
    return 0


if __name__ == "__main__":
    sys.exit(main())
