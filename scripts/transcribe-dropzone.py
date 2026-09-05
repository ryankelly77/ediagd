#!/usr/bin/env python3
"""
EDIAGD — turn the Drop Zone's audio into text

    python3 scripts/transcribe-dropzone.py --dir="<Drop Zone>" --out=reports/dropzone-transcripts.json

Forty-eight camera-roll files, same presenter, same setting, same framing,
sequential numbers. Nothing on screen says which is which — the identity is
entirely in the words. This is the half that gets the words out; the half that
decides what they mean is lib/video/transcript-match.ts, in TypeScript, because
the self-naming ingest will call that same matcher against Mux transcripts and
it must not exist twice.

WHY PYTHON FOR THIS HALF AND ONLY THIS HALF
faster-whisper is a Python library. Shelling out to it from TypeScript would put
a process boundary in the middle of the loop and buy nothing; putting the
MATCHER in Python would buy a second implementation of the thing that must stay
single. So the boundary is a JSON file: audio in, transcripts out, nothing
decided.

AUDIO ONLY, AND DELETED AS IT GOES
The videos are ~700MB each and 33GB in total, streamed on demand through Google
Drive for Desktop. The wav for a three-minute film is about 3MB. Each one is
extracted, transcribed and unlinked before the next file is touched, so this
never holds more than one at a time.

RESUMABLE, BECAUSE IT TAKES AN HOUR
Roughly a minute per file to stream and extract, ten seconds to transcribe. A
run that loses its work because the network hiccuped at file 40 is a run nobody
starts again. Existing entries in the output file are kept and skipped.
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time

MODEL = "base.en"  # one clear scripted speaker; small buys nothing here


def extract_audio(src: str, dest: str) -> float:
    """16kHz mono PCM — what whisper wants, and nothing else."""
    started = time.time()
    result = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", src,
         "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", "-y", dest],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip()[:400] or "ffmpeg failed")
    return time.time() - started


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True, help="folder of masters (the Drop Zone)")
    ap.add_argument("--out", required=True, help="JSON file to write/extend")
    ap.add_argument("--limit", type=int, default=0, help="stop after N new files")
    args = ap.parse_args()

    if not os.path.isdir(args.dir):
        print(f"  not a folder: {args.dir}", file=sys.stderr)
        return 1

    files = sorted(
        f for f in os.listdir(args.dir)
        if f.lower().endswith((".mov", ".mp4", ".m4v")) and not f.startswith(".")
    )
    print(f"\n  {len(files)} video files in {args.dir}\n")

    done = {}
    if os.path.exists(args.out):
        with open(args.out) as fh:
            done = {row["file"]: row for row in json.load(fh).get("files", [])}
        print(f"  {len(done)} already transcribed — skipping those\n")

    # Loaded once. The model costs a few seconds to construct and nothing to reuse.
    from faster_whisper import WhisperModel
    model = WhisperModel(MODEL, device="cpu", compute_type="int8")

    written = 0
    for name in files:
        if name in done:
            continue
        if args.limit and written >= args.limit:
            break

        src = os.path.join(args.dir, name)
        size_mb = os.path.getsize(src) / 1e6
        print(f"  {name}  ({size_mb:.0f} MB)", flush=True)

        wav = None
        try:
            fd, wav = tempfile.mkstemp(suffix=".wav")
            os.close(fd)
            pull = extract_audio(src, wav)

            t0 = time.time()
            segments, info = model.transcribe(wav, beam_size=1, vad_filter=True)
            text = " ".join(s.text.strip() for s in segments).strip()
            transcribe_secs = time.time() - t0

            done[name] = {
                "file": name,
                "seconds": round(info.duration, 1),
                "transcript": text,
                "words": len(text.split()),
            }
            written += 1
            print(f"      {info.duration:.0f}s audio · {len(text.split())} words "
                  f"· pull {pull:.0f}s · asr {transcribe_secs:.0f}s", flush=True)
            print(f"      {text[:110]}…\n", flush=True)

        except Exception as exc:  # noqa: BLE001 — one bad file must not end the run
            done[name] = {"file": name, "error": str(exc)[:300], "transcript": ""}
            print(f"      FAILED: {exc}\n", file=sys.stderr, flush=True)
        finally:
            # The video bytes were never copied; this is the 3MB of audio.
            if wav and os.path.exists(wav):
                os.unlink(wav)

        # Written after EVERY file, not at the end — see the resumability note.
        os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
        with open(args.out, "w") as fh:
            json.dump(
                {"source": args.dir, "model": MODEL,
                 "files": [done[k] for k in sorted(done)]},
                fh, indent=1,
            )

    ok = sum(1 for r in done.values() if r.get("transcript"))
    print(f"\n  {ok} of {len(done)} transcribed -> {args.out}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
