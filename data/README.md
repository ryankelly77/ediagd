# data/ — source workbooks

What Mitch and Doggett actually sent, kept as delivered. Nothing here is read at
runtime; the importers in `scripts/` read these files once and write to Postgres,
and the copy on disk is the record of what a row came from.

Filenames are left exactly as received, parentheses and all. A file renamed on
the way in is a file nobody can match against the email it arrived in.

---

## The quiz bank — September 2026

    EDIAGD_Master_Quiz_Bank.xlsx     THE IMPORT SOURCE. 485 questions.
    EDIAGD_Quiz_Bank_Vol1.xlsx       reference only — superseded
    EDIAGD_Quiz_Bank_Vol2.xlsx       reference only — superseded
    EDIAGD_Quiz_Bank_Vol5.xlsx       reference only — superseded

**The Master supersedes the Vol files.** It contains every question from them
verbatim — Ryan checked Vols 1, 2 and 5 by text, and Vols 3 and 4 are accounted
for by the Master's own `Volume` column. So the Master is the single import
source and the Vols are here as the paper trail, not as input. Importing both
would produce duplicates keyed to different ids, which is exactly the failure
the `Question ID` column exists to prevent.

Only Vols 1, 2 and 5 were delivered. 3 and 4 were never sent as separate files;
their questions are in the Master and are marked as such.

    EDIAGD_Teleprompter_Vol2.docx    FILM SCRIPTS — production input, not library content.

The teleprompter document is what Mitch reads to camera. It is not content the
app serves and it is not imported anywhere: the videos it produces become
`content` rows through the Mux ingest, and the script itself is the raw material
for those. It lives here so the words behind a film can be found later.

---

## The deck map — September 2026

    EDIAGD_Doggett_OpCode_Deck_Map (1).xlsx

Five sheets, and they are not all the same kind of thing:

  `Doggett to Deck Map`  Mitch's PROPOSALS: Doggett sub-category -> EDIAGD op
                         code, with the volume evidence behind each one (Aug
                         2026 ROs, labor, store count). Imported as proposed
                         `mapping_alias` rows — inert until confirmed. They do
                         not touch confirmed `sub_category_map` rows.

  `Deck Inventory`       Deck -> op codes covered. The quiz importer reads this
                         to resolve a deck to an op code. Also LMS structure.

  `Film Index`           LMS structure. Nothing imports it yet.

  `What's Missing`       Gap analysis, for reading.

  `Open Items`           Questions for Ryan and Mitch, including the two op-code
                         slot requests that belong to the 055-057 conversation.
                         Nothing here is imported; it is a to-do list.

`Deck Inventory` and `Film Index` describe an LMS that has not been built. They
are committed now so the build has them, and deliberately not imported: inventing
modules and films from a spreadsheet before the thing that consumes them exists
is how a schema ends up shaped by a guess.

---

## Older files

    Ediagd_master_2026_08_17_v2.xlsx          the knowledge/content master
    Ediagd_master_2026_May_19 Non truncated.xlsx
    op_code_seed.csv, op_code_family_map.csv  op code catalog seeds
