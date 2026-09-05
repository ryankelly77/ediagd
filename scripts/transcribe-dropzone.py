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
A run that loses its work because the network hiccuped at file 40 is a run
nobody starts again. Existing entries in the output file are kept and skipped.

PARALLEL ON THE PULL, SERIAL ON THE MODEL
Measured on the first two files: 187 seconds to stream a 954MB master out of
Drive, 8 seconds to transcribe it. The cost is almost entirely network, and
network waits in parallel — so the pulls run on a small thread pool while a lock
keeps one transcription in flight at a time. Whisper is the only CPU-bound part
and running several would contend for the same cores; the lock is barely
contended anyway at a 20:1 ratio.
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor

DEFAULT_MODEL = "small.en"
PROMPT_FILE = "data/whisper-prompt.txt"


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
    ap.add_argument("--workers", type=int, default=6,
                    help="concurrent Drive pulls; transcription stays serial")
    ap.add_argument("--model", default=DEFAULT_MODEL, help="faster-whisper model")
    ap.add_argument("--audio-cache", default="",
                    help="keep extracted wavs here so a model change costs no re-pull")
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
    model = WhisperModel(args.model, device="cpu", compute_type="int8")

    """
    THE VOCABULARY, HANDED TO THE DECODER.

    base.en heard "pre-writes" as "pre-rights", "pre-orites" and "pre-ride",
    "Arctic Blast" as "Arctic Glass", "engine air filter" as "engineer filters"
    and "cowl" as "cow". Every one of those is a word the matcher reads, and the
    deck NAME is its strongest signal — so a mangled name is a film that cannot
    be identified.

    initial_prompt biases decoding toward the words it contains. The file is
    generated from the deck map and the op-code catalog by
    scripts/build-deck-vocabulary.ts, so a new deck brings its own spelling
    rather than needing this list edited.
    """
    prompt = None
    if os.path.exists(PROMPT_FILE):
        with open(PROMPT_FILE) as fh:
            prompt = fh.read().strip()
        print(f"  vocabulary prompt: {len(prompt.split())} words", flush=True)
    else:
        print(f"  no {PROMPT_FILE} — running without a vocabulary prompt", flush=True)

    todo = [n for n in files if n not in done]
    if args.limit:
        todo = todo[: args.limit]
    print(f"  {len(todo)} to do, {args.workers} concurrent pulls, model {args.model}\n",
          flush=True)
    if args.audio_cache:
        os.makedirs(args.audio_cache, exist_ok=True)

    # One transcription at a time; one writer at a time.
    asr_lock = threading.Lock()
    io_lock = threading.Lock()
    counter = {"n": 0}

    def flush() -> None:
        os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
        with open(args.out, "w") as fh:
            json.dump(
                {"source": args.dir, "model": args.model,
                 "files": [done[k] for k in sorted(done)]},
                fh, indent=1,
            )

    def handle(name: str) -> None:
        src = os.path.join(args.dir, name)
        size_mb = os.path.getsize(src) / 1e6
        wav = None
        cached = bool(args.audio_cache)
        try:
            if cached:
                """
                CACHED AUDIO, BECAUSE THE PULL IS THE WHOLE COST.

                187 seconds to stream a 954MB master out of Drive; 30 to
                transcribe it. Changing the model should not mean re-reading
                33GB — 48 wavs are about 150MB and make the next run instant.
                """
                wav = os.path.join(args.audio_cache, name + ".wav")
                pull = 0.0 if os.path.exists(wav) else extract_audio(src, wav)
            else:
                fd, wav = tempfile.mkstemp(suffix=".wav")
                os.close(fd)
                pull = extract_audio(src, wav)

            t0 = time.time()
            with asr_lock:
                segments, info = model.transcribe(
                    wav, beam_size=1, vad_filter=True, initial_prompt=prompt
                )
                text = " ".join(s.text.strip() for s in segments).strip()
            asr = time.time() - t0

            row = {"file": name, "seconds": round(info.duration, 1),
                   "transcript": text, "words": len(text.split())}
        except Exception as exc:  # noqa: BLE001 — one bad file must not end the run
            row = {"file": name, "error": str(exc)[:300], "transcript": ""}
            print(f"  {name}  FAILED: {exc}", file=sys.stderr, flush=True)
        finally:
            # The video bytes were never copied; this is the 3MB of audio.
            # Kept only when a cache was asked for.
            if wav and not cached and os.path.exists(wav):
                os.unlink(wav)

        with io_lock:
            done[name] = row
            counter["n"] += 1
            n = counter["n"]
            flush()  # after EVERY file — see the resumability note
        if row.get("transcript"):
            print(f"  [{n}/{len(todo)}] {name} ({size_mb:.0f} MB) "
                  f"{row['seconds']:.0f}s audio · {row['words']} words", flush=True)
            print(f"      {row['transcript'][:110]}…\n", flush=True)

    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        list(pool.map(handle, todo))

    ok = sum(1 for r in done.values() if r.get("transcript"))
    print(f"\n  {ok} of {len(done)} transcribed -> {args.out}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
