#!/usr/bin/env python3
"""
EDIAGD — where the lesson actually ends

    python3 scripts/signoff-timings.py --dir="<Published/Mindset>" --out=reports/signoff-timings.json

Every film signs off with "Mahalo". That word is where the teaching stops, and
it is what the Continue gate should wait for — not a percentage of the file,
which on a two-minute film opens the button thirteen seconds early.

WHY THIS IS A SEPARATE PASS, AND WHY VAD IS OFF
-----------------------------------------------
The whole-film transcripts were made with vad_filter=True. That strips silence
before the model sees the audio, so the timestamps it returns drift from real
time — increasingly, the more silence there is. Using them here produced an
answer of "Mahalo, then 21.6 seconds of nothing" for a film whose sign-off is
actually 2.7 seconds from the end. Ryan said flatly that there should not be
twenty seconds of silence, and he was right.

This is the same lesson as the slate at the other end of the film, where word
timestamps with VAD off replaced segment timestamps that were a second and a
half out. Two ends, one mistake, made twice.

THE LAST FORTY-FIVE SECONDS ONLY. The sign-off is at the end by definition, and
reading the tail keeps this cheap enough to re-run whenever a batch lands.
"""

import argparse, json, os, subprocess, sys, tempfile

TAIL_SECONDS = 45


def tail_audio(src: str, dest: str) -> None:
    subprocess.run(
        ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error",
         "-sseof", f"-{TAIL_SECONDS}", "-i", src,
         "-vn", "-ac", "1", "-ar", "16000", "-y", dest],
        check=True,
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--model", default="small.en")
    args = ap.parse_args()

    from faster_whisper import WhisperModel

    files = sorted(f for f in os.listdir(args.dir)
                   if f.lower().endswith((".mov", ".mp4")) and not f.startswith("."))
    print(f"\n  {len(files)} files, reading the last {TAIL_SECONDS}s of each\n")
    model = WhisperModel(args.model, device="cpu", compute_type="int8")
    out = {}

    for i, name in enumerate(files, 1):
        wav = None
        try:
            src = os.path.join(args.dir, name)
            dur = float(subprocess.run(
                ["ffprobe", "-v", "error", "-show_entries", "format=duration",
                 "-of", "csv=p=0", src], capture_output=True, text=True).stdout.strip())

            fd, wav = tempfile.mkstemp(suffix=".wav"); os.close(fd)
            tail_audio(src, wav)
            offset = max(0.0, dur - TAIL_SECONDS)

            segments, _ = model.transcribe(wav, beam_size=1, word_timestamps=True,
                                           vad_filter=False)
            words = [{"word": w.word.strip(), "start": round(offset + w.start, 3)}
                     for s in segments for w in (s.words or [])]

            # The LAST one: some films say it twice.
            hit = None
            for w in words:
                if w["word"].lower().strip(".,!?—-").startswith("mahalo"):
                    hit = w
            out[name] = {
                "file": name, "duration": round(dur, 3),
                "mahalo_at": hit["start"] if hit else None,
                "tail": round(dur - hit["start"], 2) if hit else None,
            }
            mark = f"{hit['start']:.2f}s (tail {dur - hit['start']:.2f}s)" if hit else "NO MAHALO"
            print(f"  [{i}/{len(files)}] {name[:52]:<52} {mark}", flush=True)
        except Exception as exc:  # noqa: BLE001
            out[name] = {"file": name, "mahalo_at": None, "error": str(exc)[:200]}
            print(f"  [{i}/{len(files)}] {name}  FAILED: {exc}", file=sys.stderr, flush=True)
        finally:
            if wav and os.path.exists(wav):
                os.unlink(wav)
        with open(args.out, "w") as fh:
            json.dump({"source": args.dir, "files": out}, fh, indent=1)

    found = sum(1 for v in out.values() if v.get("mahalo_at") is not None)
    print(f"\n  {found}/{len(files)} located a sign-off -> {args.out}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
