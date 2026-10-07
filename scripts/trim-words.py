#!/usr/bin/env python3
"""
EDIAGD — where the greeting starts and the sign-off ends, to the word

    .venv-whisper/bin/python3 scripts/trim-words.py \
        --manifest=<jobs.json> --out=<results.json>

WHY WORDS AND NOT SEGMENTS, AT BOTH ENDS
----------------------------------------
This is the third time the same lesson has been paid for. slate-timings.py
records it for the head: the slate is SPOKEN — "Get the hell out of here
speech. Multi-Point Inspection setup part one." — and Whisper's segmenter puts
that whole opening in one segment with the "Aloha" that follows it, so a
segment timestamp for "Aloha" is the timestamp of the SLATE. Cutting there
keeps the thing the cut exists to remove.

signoff-timings.py records the same mistake at the tail, plus a second one: the
whole-film transcripts were made with vad_filter=True, which strips silence
before the model sees the audio, so its timestamps drift from real time by
however much silence there was. That is how a film whose sign-off is 2.7s from
the end got reported as "Mahalo, then 21.6 seconds of nothing".

So: word timestamps, VAD off, both ends. Two ends, one mistake, made twice
already.

WHAT THIS ADDS OVER signoff-timings.py, AND WHY IT IS A DIFFERENT SCRIPT
------------------------------------------------------------------------
That script reads files ON DISK in `02 - Published`. For the 165 films already
head-trimmed by trim:slates, the file on disk is the UNTRIMMED original — so
its timestamps describe a film that is not the one being served, and a cut
computed from them would be wrong by the length of the trim already taken. It
also records `mahalo_at`, the START of the word, where a tail cut needs the
END of it.

This one takes wavs already pulled from the asset that will actually be cut,
and reports the start of the first "Aloha" and the END of the last "Mahalo".

IT DECIDES NOTHING. It converts audio to timestamps. Which films are cut, by
how much, and whether a cut is proposed at all is decided in TypeScript with
the library in hand — see scripts/trim-measure.ts.
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile


def strip_word(w: str) -> str:
    return w.strip().lower().strip(".,!?—-\"'")


def pad_tail(src: str) -> str:
    """A copy with a second of silence on the end.

    WHY THIS IS NEEDED AT ALL, AND WHY IT IS SAFE
    ---------------------------------------------
    faster-whisper raises

        boolean index did not match indexed array along axis 0;
        size of axis is 0 but size of corresponding boolean axis is 1

    on some windows during word alignment — a degenerate final segment with no
    frames. It is a property of the audio, not of call order or of model state:
    the same wav fails alone on a freshly constructed model, while a wav pulled
    from the same film at an offset 11 milliseconds away succeeds. Six of the
    first thirty-five tail windows hit it.

    Appending silence changes the frame count and the final segment stops being
    degenerate. It is safe for THIS measurement because the padding goes after
    every spoken word, so no word's position within the window moves — the
    caller's `offset + w.start` arithmetic is untouched. Verified on
    "Diesel, Part 1": the padded window puts the end of "Mahalo" at 110.192s
    absolute, against 110.169s measured independently from a separately pulled
    window. Two routes, 0.02s apart.
    """
    fd, dest = tempfile.mkstemp(suffix="-pad.wav")
    os.close(fd)
    subprocess.run(
        ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error",
         "-i", src, "-af", "apad=pad_dur=1.0", "-ac", "1", "-ar", "16000",
         "-y", dest],
        check=True,
    )
    return dest


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--model", default="small.en")
    args = ap.parse_args()

    from faster_whisper import WhisperModel

    with open(args.manifest) as fh:
        jobs = json.load(fh)["jobs"]

    model = WhisperModel(args.model, device="cpu", compute_type="int8")
    out = {}

    def transcribe(wav: str, offset: float):
        segments, _ = model.transcribe(
            wav, beam_size=1, word_timestamps=True, vad_filter=False
        )
        return [
            {
                "word": w.word.strip(),
                "start": round(offset + w.start, 3),
                "end": round(offset + w.end, 3),
            }
            for s in segments
            for w in (s.words or [])
        ]

    def words_of(wav: str, offset: float, rec: dict):
        """Transcribe, and on the alignment fault retry the padded copy once.

        The retry is RECORDED rather than silent: a measurement that needed a
        second attempt is still a measurement, but the next person reading a
        surprising number should be able to see that the window was unusual.
        """
        try:
            return transcribe(wav, offset)
        except Exception as first:  # noqa: BLE001
            padded = None
            try:
                padded = pad_tail(wav)
                words = transcribe(padded, offset)
                rec.setdefault("notes", []).append(f"padded-retry ({str(first)[:80]})")
                return words
            finally:
                if padded and os.path.exists(padded):
                    os.unlink(padded)

    for job in jobs:
        key = job["key"]
        rec = {
            "alohaAt": None,
            "mahaloEnd": None,
            "headHeard": "",
            "tailHeard": "",
            "errors": [],
        }

        # ---- head: the FIRST "Aloha" ------------------------------------
        # It recurs mid-lesson in some scripts and only the greeting is a cut
        # point; the caller bounds the window so a later one cannot be reached.
        if job.get("headWav"):
            try:
                words = words_of(job["headWav"], 0.0, rec)
                # ---- NOTHING DECODED IS A FAILED MEASUREMENT, NOT A RULING --
                # An empty word list and "this film has no greeting" are the
                # same value here and completely different facts. Reporting the
                # first as the second hands Ryan a confident ruling about a film
                # the measurement never actually read — which is what a
                # truncated pull used to produce, silently, before the caller
                # started verifying window length.
                if not words:
                    rec["errors"].append("head: no audio decoded (0 words)")
                else:
                    hit = next(
                        (w for w in words if strip_word(w["word"]).startswith("aloha")), None
                    )
                    if hit:
                        rec["alohaAt"] = hit["start"]
                    # The words in front of the cut, so a person can check a
                    # trim without opening the video. When no Aloha was found,
                    # this is the evidence for the no-greeting ruling.
                    rec["headHeard"] = " ".join(w["word"] for w in words[:40])
                    # The FIRST words with their timings. trim-verify.ts asks a
                    # different question from the measure pass — not "where is
                    # Aloha" but "is the first word of the finished film Aloha,
                    # and does it start after a beat of air" — and only the
                    # words themselves can answer it.
                    rec["headWords"] = words[:10]
            except Exception as exc:  # noqa: BLE001 — one bad file must not end the run
                rec["errors"].append(f"head: {str(exc)[:160]}")

        # ---- tail: the LAST "Mahalo", and its END ------------------------
        # Some films say it twice. The END of the word is the cut point: the
        # START would clip the sign-off in half, which is the one failure a
        # viewer notices instantly.
        if job.get("tailWav"):
            try:
                words = words_of(job["tailWav"], float(job["tailOffset"]), rec)
                if not words:
                    rec["errors"].append("tail: no audio decoded (0 words)")
                else:
                    hit = None
                    for w in words:
                        if strip_word(w["word"]).startswith("mahalo"):
                            hit = w
                    if hit:
                        rec["mahaloEnd"] = hit["end"]
                        rec["mahaloStart"] = hit["start"]
                    rec["tailHeard"] = " ".join(w["word"] for w in words[-40:])
                    rec["tailWords"] = words[-10:]
            except Exception as exc:  # noqa: BLE001
                rec["errors"].append(f"tail: {str(exc)[:160]}")

        out[key] = rec
        mark = []
        mark.append(f"aloha {rec['alohaAt']}" if rec["alohaAt"] is not None else "NO ALOHA")
        mark.append(f"mahalo-end {rec['mahaloEnd']}" if rec["mahaloEnd"] is not None else "NO MAHALO")
        print(f"    {key[:8]}  {'  '.join(mark)}", flush=True)

    with open(args.out, "w") as fh:
        json.dump(out, fh, indent=1)

    failed = sum(1 for v in out.values() if v["errors"])
    padded = sum(1 for v in out.values() if v.get("notes"))
    print(
        f"    batch done: {len(out)} films, {failed} with errors"
        + (f", {padded} needed a padded retry" if padded else ""),
        flush=True,
    )
    # The exit code is a function of the failure count, not a constant.
    #
    # ONE FILM IS NOT THE BATCH. This used to exit 1 whenever every film in the
    # batch had an error, which for a single-film batch meant one alignment
    # fault failed the process — and the caller then discarded the whole batch,
    # losing the HEAD measurement that had succeeded in the same run. The
    # per-film errors are in the output file; the caller reads them from there.
    # A non-zero exit is reserved for not having done the job at all.
    return 1 if out and failed == len(out) and len(out) > 1 else 0


if __name__ == "__main__":
    raise SystemExit(main())
