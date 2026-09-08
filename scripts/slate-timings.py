#!/usr/bin/env python3
"""
EDIAGD — where the slate ends, to the word

    python3 scripts/slate-timings.py --dir="<Drop Zone>" --out=reports/slate-timings.json

WHY THIS EXISTS SEPARATELY FROM transcribe-dropzone.py
------------------------------------------------------
That script gets the words out of a whole film so the film can be named. This
one answers a much smaller question about the first few seconds, and the two
cannot be the same pass because they need different things from Whisper.

The slate in this batch is SPOKEN: "Doubt is a strange thing by Kobe Bryant."
and then "Aloha". Whisper's segmenter puts that whole opening in one segment, so
a segment-level timestamp for "Aloha" is actually the timestamp of the SLATE —
about a second earlier, and on the wrong side of the thing being cut. Trimming
there keeps the slate, which is the one outcome this whole job exists to avoid.

Word timestamps fix it, and they are expensive over three minutes of audio and
free over thirty seconds. So this reads only the head of each file.

THE HEAD IS CHEAP. `ffmpeg -t 30` pulls a fraction of a 200MB master — measured
at 0.17s per file against the Drive mount, against roughly three minutes for a
full pull. That is the whole reason this is a second pass rather than a flag on
the first one.

IT DECIDES NOTHING. Output is a timestamp and the words in front of it. What the
film is called, and whether it replaces something, is decided in TypeScript with
the library in hand — see scripts/slate-plan.ts.
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile

HEAD_SECONDS = 30
MODEL = "small.en"


def head_audio(src: str, dest: str) -> None:
    """Sixteen-kilohertz mono of the first thirty seconds. Whisper wants no more."""
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-t", str(HEAD_SECONDS),
         "-i", src, "-vn", "-ac", "1", "-ar", "16000", "-y", dest],
        check=True,
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--model", default=MODEL)
    args = ap.parse_args()

    from faster_whisper import WhisperModel

    files = sorted(
        f for f in os.listdir(args.dir)
        if f.lower().endswith((".mov", ".mp4", ".m4v")) and not f.startswith(".")
    )
    print(f"\n  {len(files)} files, reading the first {HEAD_SECONDS}s of each\n")

    model = WhisperModel(args.model, device="cpu", compute_type="int8")
    out = {}

    for i, name in enumerate(files, 1):
        wav = None
        try:
            fd, wav = tempfile.mkstemp(suffix=".wav")
            os.close(fd)
            head_audio(os.path.join(args.dir, name), wav)

            segments, _ = model.transcribe(
                wav, beam_size=1, word_timestamps=True, vad_filter=False
            )

            words = []
            for s in segments:
                for w in (s.words or []):
                    words.append({"word": w.word.strip(), "start": round(w.start, 3)})

            # The FIRST "Aloha". It recurs in some scripts and only the greeting
            # is a cut point.
            aloha = next(
                (w for w in words if w["word"].lower().strip(".,!?—-").startswith("aloha")),
                None,
            )

            slate = ""
            if aloha:
                slate = " ".join(
                    w["word"] for w in words if w["start"] < aloha["start"]
                ).strip()

            out[name] = {
                "file": name,
                "aloha_at": aloha["start"] if aloha else None,
                "slate": slate,
                # Kept for the report: seeing the words either side of the cut is
                # how a person checks a trim without opening the video.
                "opening": " ".join(w["word"] for w in words[:40]),
            }
            mark = f"{aloha['start']:.2f}s" if aloha else "NO ALOHA"
            print(f"  [{i}/{len(files)}] {name:<20} {mark:>9}   {slate[:56]}", flush=True)

        except Exception as exc:  # noqa: BLE001 — one bad file must not end the run
            out[name] = {"file": name, "aloha_at": None, "slate": "", "error": str(exc)[:200]}
            print(f"  [{i}/{len(files)}] {name}  FAILED: {exc}", file=sys.stderr, flush=True)
        finally:
            if wav and os.path.exists(wav):
                os.unlink(wav)

        # After every file: this is cheap and a run that loses its work is a run
        # nobody starts again.
        with open(args.out, "w") as fh:
            json.dump({"source": args.dir, "model": args.model, "files": out}, fh, indent=1)

    found = sum(1 for v in out.values() if v.get("aloha_at") is not None)
    print(f"\n  {found}/{len(files)} located an Aloha -> {args.out}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
