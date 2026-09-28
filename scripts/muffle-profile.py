"""Measure how muffled a film is, and where.

THE MEASURE, AND WHAT IT THROWS AWAY
------------------------------------

High-frequency ratio on VOICED frames only:

    HF = 10 * log10( E[4-8 kHz] / E[0.3-4 kHz] )

Consonant energy lives above 4 kHz. A cloth-covered or off-axis mic loses it
first, so a falling HF ratio is a proxy for "sounds muffled" that tracks what a
listener hears. Voiced frames only, because silence has no ratio worth reading
and room tone would dominate it.

SMOOTHED WITH A 2.5-SECOND MEDIAN, AND THE CHOICE IS THE WHOLE POINT.

The first version of this used a 1-second MEAN. Bright consonants are brief and
loud, so every plosive lifted the window that was meant to reveal sustained
dullness: +13.9 dB of upward bias at 2:30 of CAF-002, the exact passage Ryan had
named by ear. That film came back 1.0% muffled — a clean answer, which is why
nobody questioned it. On 2.5-second medians, which a plosive cannot drag, the
same film reads 26.9% muffled, worst -63.5 dB at 2:09, and agrees with what he
heard.

A mean throws away the extremes. When the extremes are what hides the defect, the
mean reports that there is no defect — and it was wrong in the direction that
looks like good news. The median is the choice this measure needs; it is named
here because it is an assumption, not arithmetic.

CALIBRATION, so the thresholds are not invented
-----------------------------------------------

  -30 dB   a clean film (MINDSET — Stay in a Great Mood measures -30.5)
  -48 dB   MUFFLED. Passages below this are what Ryan identified by ear.
  -55 dB   badly muffled
  -64 dB   the worst measured anywhere in the library

Absolute values depend on the mic and the room, so this is for COMPARING takes of
the same lesson shot on the same rig — which is what a reshoot decision needs.
Between two takes, lower is worse, and the gap is the answer.
"""
import argparse
import os
import re
import subprocess
import sys
import tempfile
import wave

import numpy as np

MUFFLED_DB = -48.0
WINDOW = 1024
HOP = 512
SMOOTH_SEC = 2.5


def voiced_spans(path: str, model: str) -> list[tuple[float, float]]:
    """Speech spans, from the transcriber rather than from an energy gate.

    An energy gate cannot tell speech from a door closing, and a door is exactly
    the broadband event that would read as bright.
    """
    from faster_whisper import WhisperModel

    m = WhisperModel(model, device="cpu", compute_type="int8")
    segs, _ = m.transcribe(path, beam_size=1)
    return [(s.start, s.end) for s in segs]


def profile(video: str, model: str = "small.en") -> dict | None:
    fd, wav = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    try:
        r = subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-i", video, "-vn", "-ac", "1",
             "-ar", "16000", wav],
            capture_output=True,
        )
        if r.returncode != 0 or not os.path.getsize(wav):
            print(f"  {os.path.basename(video)}: ffmpeg failed", file=sys.stderr)
            return None

        spans = voiced_spans(wav, model)

        wf = wave.open(wav)
        sr = wf.getframerate()
        x = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16)
        x = x.astype(np.float32) / 32768.0
        wf.close()
        dur = len(x) / sr

        if not spans:
            """
            NO SPEECH IS 'CHECK THE AUDIO', NEVER 'NOT A FILM'.

            Ryan's ruling, and it matters: a silent or unintelligible file is the
            most likely thing to be a broken recording of a real lesson. Calling
            it 'not a film' discards exactly the case that needs a human ear.
            """
            return {"file": os.path.basename(video), "seconds": round(dur, 1),
                    "no_speech": True}

        win = np.hanning(WINDOW)
        freqs = np.fft.rfftfreq(WINDOW, 1 / sr)
        lo_b = (freqs >= 300) & (freqs < 4000)
        hi_b = (freqs >= 4000) & (freqs < 8000)

        ts, db = [], []
        for i in range(0, len(x) - WINDOW, HOP):
            t = i / sr
            if not any(a <= t <= b for a, b in spans):
                continue
            S = np.abs(np.fft.rfft(x[i:i + WINDOW] * win)) ** 2
            lo = S[lo_b].sum()
            if lo <= 0:
                continue
            ts.append(t)
            db.append(10 * np.log10(max(S[hi_b].sum(), 1e-12) / lo))

        if not ts:
            return {"file": os.path.basename(video), "seconds": round(dur, 1),
                    "no_speech": True}

        ts = np.array(ts)
        raw = np.array(db)
        half = SMOOTH_SEC / 2
        sm = np.array([np.median(raw[(ts >= t - half) & (ts <= t + half)]) for t in ts])

        bad = sm < MUFFLED_DB
        frame_sec = HOP / sr
        # Contiguous muffled passages, merged across gaps under a second.
        spans_bad, start = [], None
        for k, flag in enumerate(bad):
            if flag and start is None:
                start = ts[k]
            elif not flag and start is not None:
                if ts[k] - start >= 1.0:
                    spans_bad.append((start, ts[k], float(sm[(ts >= start) & (ts <= ts[k])].min())))
                start = None
        if start is not None:
            spans_bad.append((start, ts[-1], float(sm[ts >= start].min())))

        return {
            "file": os.path.basename(video),
            "seconds": round(dur, 1),
            "hf_median_db": round(float(np.median(sm)), 1),
            "worst_db": round(float(sm.min()), 1),
            "worst_at": round(float(ts[sm.argmin()]), 1),
            "muffled_sec": round(float(bad.sum()) * frame_sec, 1),
            "muffled_pct": round(100.0 * float(bad.sum()) / len(sm), 1),
            "passages": [(round(a, 1), round(b, 1), round(w, 1)) for a, b, w in spans_bad],
            "no_speech": False,
        }
    finally:
        if os.path.exists(wav):
            os.unlink(wav)


def mmss(t: float) -> str:
    return f"{int(t) // 60}:{t % 60:04.1f}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("videos", nargs="+")
    ap.add_argument("--model", default="small.en")
    ap.add_argument("--passages", action="store_true", help="list muffled in/out points")
    args = ap.parse_args()

    rows, failed = [], []
    for v in args.videos:
        if not os.path.exists(v):
            print(f"  NOT FOUND  {v}", file=sys.stderr)
            failed.append(v)
            continue
        r = profile(v, args.model)
        if r is None:
            failed.append(v)
            continue
        rows.append(r)

        if r["no_speech"]:
            print(f"  {r['file'][:52]:54} {r['seconds']:>6.1f}s   NO SPEECH DETECTED "
                  f"— check the audio, this is not evidence it is not a film")
            continue
        print(f"  {r['file'][:52]:54} {r['seconds']:>6.1f}s  "
              f"median {r['hf_median_db']:>6.1f} dB   worst {r['worst_db']:>6.1f} dB "
              f"at {mmss(r['worst_at']):>6}   muffled {r['muffled_sec']:>5.1f}s "
              f"({r['muffled_pct']:>4.1f}%)")
        if args.passages and r["passages"]:
            for a, b, w in r["passages"]:
                print(f"       {mmss(a)}–{mmss(b)}  worst {w:>6.1f} dB")

    """
    THE SUMMARY AND THE EXIT CODE ARE DERIVED. A closing line that prints on the
    failure path unchanged is decoration, not a result.
    """
    print(f"\n  profiled {len(rows)} of {len(args.videos)} requested"
          + (f", {len(failed)} FAILED" if failed else ""))
    for v in failed:
        print(f"    FAILED  {v}", file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
