"""Master alignment — the doctrine's check, for films the correlator cannot read.

WHY A SECOND INSTRUMENT EXISTS AT ALL. scripts/sync-instrument.py aligns the
published film to its master by matching PICTURE HASHES against the master's
frames and requiring the matches to be unambiguous. On a short Mindset quote —
one static shot of one person, forty seconds long — almost every frame matches
almost every other frame, so no frame can identify itself and the instrument
honestly returns no verdict. That is the right behaviour: 11 films came back
unreadable rather than being given a number nobody could stand behind.

WHAT THIS DOES INSTEAD. The doctrine's own check: shift the published AUDIO
against the master's audio, shift the published PICTURE against the master's
picture, and compare the two shifts. If a film is in sync, both halves were cut
at the same instant and the two shifts agree. The quantity is the SAME quantity
the correlator reports — picture lag minus audio lag — reached by a route that
does not need any single frame to be unique.

The picture shift is found by correlating the frame-difference signal rather
than by matching individual frames. A static shot has almost no frame-to-frame
difference, so this is noisy where the hash was ambiguous — which is why the
agreement between the two shifts is reported alongside the number, and why a
weak correlation refuses rather than rounds.

IT CAN STILL REFUSE, and that is the point. A film whose audio will not
correlate with its own master's audio is not a film this can measure, and it
says so rather than returning zero.

GEOMETRY, for the same reason sync-instrument.py checks it. This instrument is
only ever handed landscape against landscape today, so it never needed the
guard — which is exactly why it gets one now. The picture half correlates a
frame-difference signal, and a 9:16 crop against a full frame would produce a
weak-but-present correlation rather than an obvious refusal: the failure would
arrive as a plausible number, not an error.
"""
import numpy as np, sys, json, os

RATE = 25.0
MIN_AUDIO_Q = 0.50
MIN_PIC_Q   = 0.30     # lower than the hash instrument's floor: this signal is
                       # weaker by construction, so the guard is the AGREEMENT
                       # between the two shifts, not the strength of one.
MAX_ABS_MS  = 2000.0

def frames(path):
    a = np.fromfile(path, dtype=np.uint8)
    n = 64 * 36
    return a[:len(a)//n*n].reshape(-1, 36, 64).astype(np.float64)

def picture_signal(path):
    """Frame-to-frame absolute difference: motion and cuts, which survive even
    when individual frames are indistinguishable."""
    f = frames(path)
    return np.abs(np.diff(f, axis=0)).mean(axis=(1, 2))

def audio_signal(path):
    a = np.fromfile(path, dtype=np.int16).astype(np.float64)
    w = int(8000 / RATE)
    a = a[:len(a)//w*w].reshape(-1, w)
    return np.sqrt((a ** 2).mean(axis=1))

def norm(x):
    x = x - x.mean()
    s = x.std()
    return x / s if s > 0 else x

def shift(ref, test, maxlag=int(RATE * 40)):
    """Lag in frames where `test` best matches `ref`, with a parabolic fit for
    sub-frame precision, plus the peak's normalised height."""
    a, b = norm(ref), norm(test)
    if len(a) < 4 or len(b) < 4:
        return None, 0.0
    n = 1 << int(np.ceil(np.log2(len(a) + len(b))))
    c = np.fft.irfft(np.fft.rfft(a, n) * np.conj(np.fft.rfft(b, n)), n)
    c = np.concatenate([c[-maxlag:], c[:maxlag + 1]])
    i = int(np.argmax(c))
    if 0 < i < len(c) - 1:
        y0, y1, y2 = c[i - 1], c[i], c[i + 1]
        den = y0 - 2 * y1 + y2
        d = (y0 - y2) / (2 * den) if den != 0 else 0.0
    else:
        d = 0.0
    return (i - maxlag + d), float(c[i] / len(a))

GEOM_TOL = 0.02


def geom(path):
    f = path + ".geom"
    if not os.path.exists(f):
        return None
    try:
        return float(open(f).read().strip())
    except ValueError:
        return None


m, p = sys.argv[1], sys.argv[2]

# GEOMETRY BEFORE MEASUREMENT, so a mismatch cannot produce a number.
_mg, _pg = geom(m), geom(p)
if _mg is None or _pg is None or abs(_mg - _pg) > GEOM_TOL:
    _why = ("no geometry sidecar — re-extract with scripts/sync-signals.sh"
            if _mg is None or _pg is None
            else f"geometry mismatch: master {_mg:.2f} vs probe {_pg:.2f}")
    _out = {"method": "master-alignment", "status": "unmeasurable", "offset_ms": None,
            "rejected_offset_ms": None, "audio_corr": None, "picture_corr": None,
            "audio_lag_s": None, "picture_lag_s": None, "within_40ms": False, "why": _why}
    if "--json" in sys.argv:
        print(json.dumps(_out))
    else:
        for k, v in _out.items():
            print(f"  {k:20} {v}")
    sys.exit(0)

alag, aq = shift(audio_signal(m + ".pcm"), audio_signal(p + ".pcm"))
plag, pq = shift(picture_signal(m + ".luma"), picture_signal(p + ".luma"))

off = None
if alag is not None and plag is not None:
    off = (plag - alag) / RATE * 1000.0

ok = (alag is not None and plag is not None
      and aq >= MIN_AUDIO_Q and pq >= MIN_PIC_Q
      and abs(off) <= MAX_ABS_MS)

out = {
    "method": "master-alignment",
    "status": "ok" if ok else "unmeasurable",
    "offset_ms": round(off, 1) if ok else None,
    "rejected_offset_ms": None if ok else (None if off is None else round(off, 1)),
    "audio_corr": round(aq, 3),
    "picture_corr": round(pq, 3),
    "audio_lag_s": None if alag is None else round(-alag / RATE, 3),
    "picture_lag_s": None if plag is None else round(-plag / RATE, 3),
    # The thing the caller actually judges on: do the two halves agree?
    "within_40ms": bool(ok and abs(off) <= 40.0),
}
if "--json" in sys.argv:
    print(json.dumps(out))
else:
    for k, v in out.items():
        print(f"  {k:20} {v}")
