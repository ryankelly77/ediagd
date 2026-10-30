"""A/V offset by aligning picture and sound to the master SEPARATELY.

PICTURE: perceptual frame hashes (dHash, 8x8 -> 64 bits) matched against the
master's frames. Deliberately NOT motion energy — on a static menu screen the
frame-to-frame difference is noise, which is why 123 films came back with no
verdict. A hash matches a PICTURE, so a slide that holds still for ten seconds
still identifies itself.

AMBIGUITY IS THE REAL ENEMY HERE, not noise. A frame from a static run matches
a whole run of master frames equally well, and picking any one of them would
invent precision. So each sampled frame is only allowed a vote when its best
match is clearly better than the best match OUTSIDE a guard band around it.
The number of frames that earned a vote is reported, and a verdict needs
enough of them.

SOUND: unchanged — RMS envelope cross-correlation, which already works.

OFFSET = picture lag - sound lag.
"""
import numpy as np, sys, json

RATE = 25.0
MIN_AUDIO_Q = 0.50      # audio correlation floor (unchanged)
MIN_VOTES   = 3         # frames that must earn a vote
# 3, not 12. 85 films came back with no verdict on vote count alone while
# their audio correlation was ~0.9 and every vote they DID earn agreed
# exactly. 12 was a guess, and it was rejecting good measurements.
# 3 is the floor at which SPREAD becomes evidence: with one vote a spread of
# 0.0 is arithmetic, not agreement, and that is the trap this guards.
MAX_SPREAD  = 1.0       # frames; median absolute deviation of the votes
# Tightened from 3 to 1 BECAUSE the vote floor dropped. Fewer votes are
# accepted, so each one must agree harder: at 25fps one frame is 40ms, which
# is the gate's own tolerance.

def frames(path):
    a = np.fromfile(path, dtype=np.uint8)
    n = 64*36
    return a[:len(a)//n*n].reshape(-1, 36, 64).astype(np.int16)

def dhash(fr):
    """64-bit row-gradient hash per frame, as a bool array (N,64)."""
    # 16x17 -> 256 bits. At 64 bits the hash could not tell frames apart.
    rows = np.linspace(0, fr.shape[1]-1, 16).astype(int)
    cols = np.linspace(0, fr.shape[2]-1, 17).astype(int)
    small = fr[:, rows][:, :, cols]                        # -> (N,16,17)
    bits = small[:, :, :-1] > small[:, :, 1:]              # -> (N,16,16) = 256 bits
    return bits.reshape(len(fr), 256)

def audio_env(path):
    a = np.fromfile(path, dtype=np.int16).astype(np.float64)
    w = int(8000/RATE)
    a = a[:len(a)//w*w].reshape(-1, w)
    return np.sqrt((a**2).mean(axis=1))

def norm(x):
    x = x - x.mean(); s = x.std()
    return x/s if s > 0 else x

def audio_lag(ref, test, maxlag=int(RATE*30)):
    a, b = norm(ref), norm(test)
    n = 1 << int(np.ceil(np.log2(len(a)+len(b))))
    c = np.fft.irfft(np.fft.rfft(a,n)*np.conj(np.fft.rfft(b,n)), n)
    c = np.concatenate([c[-maxlag:], c[:maxlag+1]])
    i = int(np.argmax(c))
    if 0 < i < len(c)-1:
        y0,y1,y2 = c[i-1],c[i],c[i+1]
        den = y0 - 2*y1 + y2
        d = (y0-y2)/(2*den) if den != 0 else 0.0
    else: d = 0.0
    return (i - maxlag + d), c[i]/len(a)

def picture_lag(mh, ph, guard=int(RATE*1.5)):
    """Median lag over frames whose match is unambiguous."""
    votes = []
    # EVERY frame, not a 200-frame sample. Sampling ~1 frame in 5 was the
    # other half of the vote shortage: a film with few distinctive frames can
    # easily have none of them land on the sampling grid.
    step = 1
    for j in range(0, len(ph), step):
        d = np.count_nonzero(mh != ph[j], axis=1)   # Hamming to every master frame
        i = int(np.argmin(d)); best = d[i]
        mask = np.ones(len(d), bool)
        mask[max(0,i-guard):i+guard+1] = False      # ignore the run around the match
        if not mask.any(): continue
        rival = d[mask].min()
        # Unambiguous = clearly better than anything elsewhere in the film.
        if rival - best >= 12:   # 256-bit hash; scaled from the 64-bit margin
            votes.append(i - j)
    if not votes: return None, 0, None
    v = np.array(votes, float)
    med = float(np.median(v))
    spread = float(np.median(np.abs(v - med)))
    return med, len(v), spread

m, p = sys.argv[1], sys.argv[2]
mh, ph = dhash(frames(m+".luma")), dhash(frames(p+".luma"))
vlag, votes, spread = picture_lag(mh, ph)
alag, aq = audio_lag(audio_env(m+".pcm"), audio_env(p+".pcm"))

ok = (vlag is not None and votes >= MIN_VOTES and spread is not None
      and spread <= MAX_SPREAD and aq >= MIN_AUDIO_Q)
off = None if vlag is None else (vlag - alag)/RATE*1000
if ok and abs(off) > 2000: ok = False

out = {"status":"ok" if ok else "unmeasurable",
       "offset_ms": round(off,1) if ok else None,
       "rejected_offset_ms": None if ok else (None if off is None else round(off,1)),
       "picture_votes": votes, "picture_spread_frames": None if spread is None else round(spread,2),
       "audio_corr": round(float(aq),3),
       "picture_lag_s": None if vlag is None else round(float(-vlag/RATE),3),
       "audio_lag_s": round(float(-alag/RATE),3)}
if "--json" in sys.argv: print(json.dumps(out))
else:
    for k,v in out.items(): print(f"  {k:24} {v}")
