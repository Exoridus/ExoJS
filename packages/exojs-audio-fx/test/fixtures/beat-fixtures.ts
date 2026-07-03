/**
 * Deterministic synthetic audio fixtures for BeatDetector Stage-1 testbench.
 *
 * Each generator returns a BeatFixture with:
 *   - samples: mono Float32Array @ 48000 Hz, peak-normalised to |x| <= 0.99
 *   - beatTimesSec: ground-truth onset times in seconds
 *   - bpm: constant BPM or function returning instantaneous BPM at time t
 *   - label: human-readable fixture name
 *
 * All randomness uses a seeded xorshift32 so results are bit-identical across runs.
 */

export const SAMPLE_RATE = 48000;

export interface BeatFixture {
  samples: Float32Array;
  /** Ground-truth onset times in seconds (anchors for beat-offset metrics). */
  beatTimesSec: number[];
  /** True BPM (constant) or function returning instantaneous BPM at time t (seconds). */
  bpm: number | ((t: number) => number);
  label: string;
  /**
   * Alternative BPM for octave-ambiguity fixtures (halfTime / doubleTime).
   * The detector would be wrong if it reports this BPM instead of `bpm`.
   */
  octavePartnerBpm?: number;
}

// ── Seeded RNG ─────────────────────────────────────────────────────────────────

function xorshift32(seed: number): () => number {
  let s = (seed >>> 0) || 1; // state must never be 0
  return () => {
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    return (s >>> 0) / 0x100000000;
  };
}

// ── Click shapes ───────────────────────────────────────────────────────────────

const CLICK_DURATION_SEC = 0.006; // ~6 ms

/**
 * Short (~6 ms) percussive burst: exponentially-decaying white noise.
 * Decays to ~1/e of peak amplitude in 500 samples (~10 ms @ 48 kHz).
 * Excites the mel/flux pipeline similarly to a real drum hit.
 */
function makeNoiseBurst(rand: () => number): Float32Array {
  const len = Math.round(CLICK_DURATION_SEC * SAMPLE_RATE);
  const buf = new Float32Array(len);
  const decayConst = 500; // 1/e time in samples
  for (let i = 0; i < len; i++) {
    buf[i] = (rand() * 2 - 1) * Math.exp(-i / decayConst);
  }
  return buf;
}

/**
 * Pure unit impulse — single 1.0 sample at position 0.
 * Spectrally flat; used as a controlled sanity fixture only.
 */
function makeImpulse(): Float32Array {
  const buf = new Float32Array(1);
  buf[0] = 1.0;
  return buf;
}

// ── Hat burst and soft-swell shapes ───────────────────────────────────────────

const HAT_DURATION_SEC = 0.003; // 3 ms — shorter than click for hi-hat ticks
const SWELL_DURATION_SEC = 0.3; // 300 ms slow-attack swell
const SWELL_ATTACK_SEC = 0.08; // 80 ms linear ramp-up (no sharp transient at t=0)

/** Very short (~3 ms) percussive burst for simulated hi-hat ticks. */
function makeHatBurst(rand: () => number): Float32Array {
  const len = Math.round(HAT_DURATION_SEC * SAMPLE_RATE);
  const buf = new Float32Array(len);
  const decayConst = 80; // faster 1/e decay (~1.7 ms)
  for (let i = 0; i < len; i++) {
    buf[i] = (rand() * 2 - 1) * Math.exp(-i / decayConst);
  }
  return buf;
}

// ── Spectral drum synth (spectrally-realistic kit shapes) ──────────────────────
//
// These three shapes replace the white-noise bursts used in djMix / djMixDrift.
// The white-noise hat (3 ms, 80-sample decay) produced HIGHER spectral flux than
// the white-noise kick (6 ms, 500-sample decay) because the tighter transient
// caused a larger per-frame delta in every mel bin — even though both were
// peak-normalised to roughly the same amplitude.  That made the off-beat 8th-note
// position the dominant onset, bootstrapping the phase tracker half-a-beat off.
//
// The fix concentrates the kick's onset energy in the lowest mel bins (180→80 Hz
// FM sweep, cosine start = peak at sample 0) while keeping the hat at 8 % of the
// kick's peak amplitude.  The mel filterbank covers 80–8000 Hz: the kick occupies
// mel bins 0–1 at high per-bin flux; the hat (first-difference HP noise in the
// 4–8 kHz region) reaches only the top ~6 bins at much lower per-bin flux.

/**
 * Kick drum: cosine FM synthesis sweeping from 180 Hz down to 80 Hz over 30 ms,
 * with a 130 ms amplitude decay.  Starts at maximum (cos(0) = 1) so the onset
 * is a clean, high-energy transient.  All pitch content stays within the mel
 * filterbank range (80–8000 Hz), concentrating the onset energy in the lowest
 * 1–2 mel bins and dominating the spectral flux at every beat position.
 *
 * `_rand` is accepted for API consistency with the other shapes but is not used
 * in the main synthesis (the kick is fully deterministic FM).
 */
function makeKickDrum(_rand: () => number): Float32Array {
  const len = Math.round(0.18 * SAMPLE_RATE); // 180 ms total
  const buf = new Float32Array(len);
  const pitchDecay = 0.030 * SAMPLE_RATE; // 30 ms pitch drop (1/e time constant)
  const ampDecay = 0.130 * SAMPLE_RATE; // 130 ms amplitude 1/e decay
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const freq = 80 + (180 - 80) * Math.exp(-i / pitchDecay); // 180 → 80 Hz
    buf[i] = Math.cos(2 * Math.PI * phase) * Math.exp(-i / ampDecay);
    phase += freq / SAMPLE_RATE;
  }
  return buf;
}

/**
 * Snare drum: white-noise body (80 ms decay) blended with a 220 Hz body
 * resonance (30 ms decay), at 50 % of kick peak amplitude.  Layers with the
 * kick on beats 2 & 4 for a realistic acoustic texture without raising the
 * combined onset above the kick's flux contribution.
 */
function makeSnareDrum(rand: () => number): Float32Array {
  const len = Math.round(0.14 * SAMPLE_RATE); // 140 ms total
  const buf = new Float32Array(len);
  const noiseDecay = 0.080 * SAMPLE_RATE; // 80 ms noise (1/e)
  const toneDecay = 0.030 * SAMPLE_RATE; // 30 ms tone (1/e)
  let tonePhase = 0;
  for (let i = 0; i < len; i++) {
    const noise = rand() * 2 - 1;
    const noiseAmp = 0.65 * Math.exp(-i / noiseDecay);
    const toneAmp = 0.35 * Math.exp(-i / toneDecay);
    buf[i] = (noise * noiseAmp + Math.cos(2 * Math.PI * tonePhase) * toneAmp) * 0.50;
    tonePhase += 220 / SAMPLE_RATE; // 220 Hz snare body resonance
  }
  return buf;
}

/**
 * Hi-hat: first-difference high-pass filtered noise (attenuates energy below
 * ~Nyquist/2, emphasises the high-frequency region) with a 12 ms decay and
 * intentionally low peak amplitude (×0.08 before mixing).  Within the mel
 * filterbank (80–8000 Hz) the hat energy reaches only the top ~6 bins at
 * per-bin flux well below the kick's concentrated low-bin onset — so the
 * beat detector always bootstraps to the kick grid.
 */
function makeHiHatDrum(rand: () => number): Float32Array {
  const len = Math.round(0.040 * SAMPLE_RATE); // 40 ms total
  const buf = new Float32Array(len);
  const decaySamples = 0.012 * SAMPLE_RATE; // 12 ms 1/e decay
  let prevX = 0;
  for (let i = 0; i < len; i++) {
    const x = rand() * 2 - 1;
    const hp = x - prevX; // first-difference: zero at DC, gain = 2 at Nyquist
    prevX = x;
    buf[i] = hp * Math.exp(-i / decaySamples) * 0.08; // 8 % of kick peak
  }
  return buf;
}

/**
 * Slow-attack band-limited swell (~300 ms):
 * 80 ms linear ramp-up then 120 ms 1/e exponential decay.
 * Amplitude at sample 0 is exactly 0 — there is no sharp transient at the onset.
 */
function makeSoftSwell(rand: () => number): Float32Array {
  const swellLen = Math.round(SWELL_DURATION_SEC * SAMPLE_RATE);
  const attackLen = Math.round(SWELL_ATTACK_SEC * SAMPLE_RATE);
  const decayConst = 0.12 * SAMPLE_RATE; // 120 ms 1/e decay after the attack peak
  const buf = new Float32Array(swellLen);
  for (let i = 0; i < swellLen; i++) {
    const noise = rand() * 2 - 1;
    const env =
      i < attackLen
        ? i / attackLen
        : Math.exp(-(i - attackLen) / decayConst);
    buf[i] = noise * env;
  }
  return buf;
}

// ── Buffer assembly ────────────────────────────────────────────────────────────

function peakNormalize(buf: Float32Array): Float32Array {
  let peak = 0;
  for (const v of buf) {
    const abs = Math.abs(v);
    if (abs > peak) peak = abs;
  }
  if (peak === 0) return new Float32Array(buf.length);
  const gain = 0.99 / peak;
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] * gain;
  return out;
}

function buildBuffer(
  onsetTimesSec: number[],
  clickShape: Float32Array,
  durationSec: number,
): Float32Array {
  const totalSamples = Math.ceil(durationSec * SAMPLE_RATE);
  const buf = new Float32Array(totalSamples);
  for (const t of onsetTimesSec) {
    const startIdx = Math.round(t * SAMPLE_RATE);
    for (let i = 0; i < clickShape.length; i++) {
      const idx = startIdx + i;
      if (idx < totalSamples) buf[idx] += clickShape[i];
    }
  }
  return peakNormalize(buf);
}

// ── Kit buffer builder ─────────────────────────────────────────────────────────

/**
 * Builds a 4-on-the-floor drum-kit pattern from a list of beat times:
 *   - Kick on every beat
 *   - Snare on beats 2 & 4 of each bar (beat index mod 4 ∈ {1, 3})
 *   - Hi-hat halfway between each consecutive beat pair (8th notes)
 * Returns a peak-normalised Float32Array.
 */
function buildKitBuffer(
  beatTimesSec: number[],
  kickShape: Float32Array,
  snareShape: Float32Array,
  hatShape: Float32Array,
  durationSec: number,
): Float32Array {
  const totalSamples = Math.ceil(durationSec * SAMPLE_RATE);
  const buf = new Float32Array(totalSamples);

  const write = (timeSec: number, shape: Float32Array): void => {
    const start = Math.round(timeSec * SAMPLE_RATE);
    for (let i = 0; i < shape.length; i++) {
      const idx = start + i;
      if (idx < totalSamples) buf[idx] += shape[i];
    }
  };

  for (let i = 0; i < beatTimesSec.length; i++) {
    const beatTime = beatTimesSec[i];
    const beatInBar = (i % 4) + 1; // 1-based position within a 4/4 bar

    write(beatTime, kickShape);

    if (beatInBar === 2 || beatInBar === 4) {
      write(beatTime, snareShape);
    }

    // 8th-note hi-hat: midpoint to the next beat.
    // For the final beat, estimate using the last known inter-beat interval.
    const nextTime =
      i + 1 < beatTimesSec.length
        ? beatTimesSec[i + 1]
        : beatTimesSec[i] + (i > 0 ? beatTimesSec[i] - beatTimesSec[i - 1] : 60 / 180);
    const hatTime = (beatTime + nextTime) / 2;
    if (hatTime < durationSec) write(hatTime, hatShape);
  }

  return peakNormalize(buf);
}

// ── Public generators ──────────────────────────────────────────────────────────

export const DEFAULT_DURATION_SEC = 15;

/**
 * Metronome clicktrack at a constant BPM.
 * Uses noise burst clicks by default; pass `useImpulse=true` for unit impulses.
 */
export function clicktrack(
  bpm: number,
  durationSec = DEFAULT_DURATION_SEC,
  useImpulse = false,
): BeatFixture {
  const rand = xorshift32(Math.round(bpm * 997 + 1));
  const shape = useImpulse ? makeImpulse() : makeNoiseBurst(rand);
  const ibi = 60 / bpm;
  const count = Math.floor(durationSec * bpm / 60);
  const beatTimesSec = Array.from({ length: count }, (_, i) => i * ibi);
  return {
    samples: buildBuffer(beatTimesSec, shape, durationSec),
    beatTimesSec,
    bpm,
    label: `clicktrack_${bpm}bpm${useImpulse ? '_impulse' : ''}`,
  };
}

/**
 * Half-time: kick on every 2nd pulse of `baseBpm` grid.
 * Ground truth = baseBpm/2 (what the detector should lock to).
 * `octavePartnerBpm` = baseBpm (the octave-double that would be wrong).
 */
export function halfTime(baseBpm = 128, durationSec = DEFAULT_DURATION_SEC): BeatFixture {
  const rand = xorshift32(0x48414c46); // "HALF"
  const shape = makeNoiseBurst(rand);
  const ibi = 60 / baseBpm;
  const totalPulses = Math.floor(durationSec * baseBpm / 60);
  const beatTimesSec = Array.from(
    { length: Math.floor(totalPulses / 2) },
    (_, i) => i * 2 * ibi,
  );
  const trueBpm = baseBpm / 2;
  return {
    samples: buildBuffer(beatTimesSec, shape, durationSec),
    beatTimesSec,
    bpm: trueBpm,
    octavePartnerBpm: baseBpm,
    label: `halfTime_${trueBpm}bpm`,
  };
}

/**
 * Double-time: kick on every half-pulse of `baseBpm` grid.
 * Ground truth = baseBpm*2 (what the detector should lock to).
 * `octavePartnerBpm` = baseBpm (the octave-half that would be wrong).
 */
export function doubleTime(baseBpm = 64, durationSec = DEFAULT_DURATION_SEC): BeatFixture {
  const rand = xorshift32(0x44424c45); // "DBLE"
  const shape = makeNoiseBurst(rand);
  const trueBpm = baseBpm * 2;
  const ibi = 60 / trueBpm;
  const count = Math.floor(durationSec * trueBpm / 60);
  const beatTimesSec = Array.from({ length: count }, (_, i) => i * ibi);
  return {
    samples: buildBuffer(beatTimesSec, shape, durationSec),
    beatTimesSec,
    bpm: trueBpm,
    octavePartnerBpm: baseBpm,
    label: `doubleTime_${trueBpm}bpm`,
  };
}

/**
 * Linear tempo ramp from `fromBpm` to `toBpm` over `durationSec`.
 * Beat times follow the instantaneous tempo (integrated forward in time).
 * `bpm` is a function returning instantaneous BPM at time t.
 */
export function tempoRamp(fromBpm = 120, toBpm = 135, durationSec = 20): BeatFixture {
  const rand = xorshift32(0x52414d50); // "RAMP"
  const shape = makeNoiseBurst(rand);
  const instBpm = (t: number): number =>
    fromBpm + (toBpm - fromBpm) * Math.min(1, t / durationSec);

  // Integrate instantaneous tempo to get beat positions
  const beatTimesSec: number[] = [];
  let t = 0;
  while (t < durationSec) {
    beatTimesSec.push(t);
    t += 60 / instBpm(t);
  }

  return {
    samples: buildBuffer(beatTimesSec, shape, durationSec),
    beatTimesSec,
    bpm: instBpm,
    label: `tempoRamp_${fromBpm}_to_${toBpm}bpm`,
  };
}

/**
 * 4-bar groove → 4-bar silence (break) → groove resumes until end.
 * Tests grid coast + re-lock after the break.
 * beatTimesSec covers only the groove and post-drop sections (not the break).
 */
export function breakDrop(bpm = 128, durationSec = 24): BeatFixture {
  const rand = xorshift32(0x42524b44); // "BRKD"
  const shape = makeNoiseBurst(rand);
  const ibi = 60 / bpm;
  const barDur = 4 * ibi;
  const grooveEnd = 4 * barDur; // first 4 bars
  const breakEnd = 8 * barDur; // break = next 4 bars

  const beatTimesSec: number[] = [];

  // First groove section
  for (let t = 0; t < grooveEnd - 1e-9; t += ibi) {
    beatTimesSec.push(t);
  }
  // Drop section (silence during break — no GT beats)
  for (let t = breakEnd; t < durationSec - 1e-9; t += ibi) {
    beatTimesSec.push(t);
  }

  return {
    samples: buildBuffer(beatTimesSec, shape, durationSec),
    beatTimesSec,
    bpm,
    label: `breakDrop_${bpm}bpm`,
  };
}

/**
 * Swung 8th-note pattern. Main beats (quarter notes) sit on the grid;
 * swung 8th notes are inserted at `swingPct * IBI` after each main beat.
 * Ground truth = main beat times only (what the detector should lock to).
 */
export function swing(bpm = 120, swingPct = 0.67, durationSec = DEFAULT_DURATION_SEC): BeatFixture {
  const rand = xorshift32(0x5357494e); // "SWIN"
  const shape = makeNoiseBurst(rand);
  const ibi = 60 / bpm;
  const count = Math.floor(durationSec * bpm / 60);
  const beatTimesSec = Array.from({ length: count }, (_, i) => i * ibi);

  // All onset times: main beats + swung 8th notes
  const allOnsets: number[] = [...beatTimesSec];
  for (let i = 0; i < count; i++) {
    const swungTime = i * ibi + swingPct * ibi;
    if (swungTime < durationSec) allOnsets.push(swungTime);
  }
  allOnsets.sort((a, b) => a - b);

  return {
    samples: buildBuffer(allOnsets, shape, durationSec),
    beatTimesSec, // ground truth = main beats only
    bpm,
    label: `swing_${bpm}bpm_${Math.round(swingPct * 100)}pct`,
  };
}

/**
 * Beat grid with per-beat uniform timing jitter in ±`jitterMs` ms.
 * Ground truth = the actual (jittered) onset times.
 */
export function grooveOffset(bpm = 120, jitterMs = 10, durationSec = DEFAULT_DURATION_SEC): BeatFixture {
  const rand = xorshift32(0x47524f56); // "GROV"
  const shape = makeNoiseBurst(rand);
  const ibi = 60 / bpm;
  const jitterSec = jitterMs * 0.001;
  const count = Math.floor(durationSec * bpm / 60);

  // Second rand for jitter so it doesn't consume the click-shape RNG sequence
  const jitterRand = xorshift32(0x4a495454); // "JITT"
  const beatTimesSec = Array.from({ length: count }, (_, i) => {
    const grid = i * ibi;
    const jitter = (jitterRand() * 2 - 1) * jitterSec;
    return Math.max(0, grid + jitter);
  });

  return {
    samples: buildBuffer(beatTimesSec, shape, durationSec),
    beatTimesSec,
    bpm,
    label: `grooveOffset_${bpm}bpm_${jitterMs}ms`,
  };
}

/**
 * Realistic drum-kit pattern at a constant `startBpm`.
 * Kick on every beat (quarter notes), snare on beats 2 & 4, hi-hats on
 * 8th notes — a standard 4/4 dance-floor pattern.
 *
 * **Canonical octave-half regression guard** when called with `startBpm=180`:
 * a correct detector must lock to 180, NOT 90 (= startBpm / 2).
 *
 * `octavePartnerBpm` = startBpm / 2 (the sub-harmonic the buggy biased ACF
 * would lock to instead of the true tempo).
 */
export function djMix(startBpm = 180, durationSec = 30): BeatFixture {
  const ibi = 60 / startBpm;
  const beatCount = Math.floor((durationSec * startBpm) / 60);
  const beatTimesSec = Array.from({ length: beatCount }, (_, i) => i * ibi);

  const kickShape = makeKickDrum(xorshift32(Math.round(startBpm * 997 + 7)));
  const snareShape = makeSnareDrum(xorshift32(Math.round(startBpm * 997 + 13)));
  const hatShape = makeHiHatDrum(xorshift32(Math.round(startBpm * 997 + 31)));

  return {
    samples: buildKitBuffer(beatTimesSec, kickShape, snareShape, hatShape, durationSec),
    beatTimesSec,
    bpm: startBpm,
    octavePartnerBpm: startBpm / 2,
    label: `djMix_${startBpm}bpm`,
  };
}

/**
 * Triangle-ramp tempo drift: fromBpm → toBpm at the midpoint, then back to
 * fromBpm at the end (V-shaped tempo curve over `durationSec`).
 * Ground-truth beat times are integrated from the piecewise instantaneous tempo.
 *
 * Generalises `tempoRamp` to a full fall-and-rise cycle, exercising the
 * dual-tempo-window tracker across both slope directions.
 */
export function tempoDrift(fromBpm = 150, toBpm = 128, durationSec = 30): BeatFixture {
  const rand = xorshift32(0x44524946); // "DRIF"
  const shape = makeNoiseBurst(rand);

  const instBpm = (t: number): number => {
    const x = Math.min(1, Math.max(0, t / durationSec));
    // Triangle wave: x ∈ [0, 0.5] → [0, 1]; x ∈ [0.5, 1] → [1, 0]
    const tri = x <= 0.5 ? x * 2 : (1 - x) * 2;
    return fromBpm + (toBpm - fromBpm) * tri;
  };

  // Integrate instantaneous tempo to produce beat positions
  const beatTimesSec: number[] = [];
  let t = 0;
  while (t < durationSec) {
    beatTimesSec.push(t);
    t += 60 / instBpm(t);
  }

  return {
    samples: buildBuffer(beatTimesSec, shape, durationSec),
    beatTimesSec,
    bpm: instBpm,
    label: `tempoDrift_${fromBpm}_to_${toBpm}bpm`,
  };
}

/**
 * DJ-mix kit pattern with a slow sinusoidal tempo drift of ±`driftBpm` around
 * `baseBpm`. Combines the realistic 4/4 kit texture from `djMix` with gradual
 * tempo variation to exercise the dual-tempo-window tracker directly.
 *
 * Beat times are integrated from the instantaneous tempo; `bpm` is a function.
 */
export function djMixDrift(baseBpm = 180, driftBpm = 5, durationSec = 30): BeatFixture {
  const driftPeriodSec = durationSec / 2; // 2 complete sinusoidal drift cycles
  const instBpm = (t: number): number =>
    baseBpm + driftBpm * Math.sin((2 * Math.PI * t) / driftPeriodSec);

  // Integrate instantaneous tempo to produce beat positions
  const beatTimesSec: number[] = [];
  let t = 0;
  while (t < durationSec) {
    beatTimesSec.push(t);
    t += 60 / instBpm(t);
  }

  const kickShape = makeKickDrum(xorshift32(Math.round(baseBpm * 997 + 43)));
  const snareShape = makeSnareDrum(xorshift32(Math.round(baseBpm * 997 + 79)));
  const hatShape = makeHiHatDrum(xorshift32(Math.round(baseBpm * 997 + 127)));

  return {
    samples: buildKitBuffer(beatTimesSec, kickShape, snareShape, hatShape, durationSec),
    beatTimesSec,
    bpm: instBpm,
    label: `djMixDrift_${baseBpm}bpm_d${driftBpm}`,
  };
}

/**
 * Soft-onset fixture: slow-attack amplitude swells at a steady tempo.
 * Each swell begins with an 80 ms linear ramp-up (amplitude = 0 at t=0,
 * rising to peak over 80 ms) followed by a ~120 ms exponential decay.
 * There is no sharp transient — the spectral-flux novelty peak is broad
 * and delayed relative to the notional onset time.
 *
 * Tests whether the detector can recall onsets when the novelty curve
 * lacks a sharp spike, validating the onset normalisation.
 *
 * Ground truth = swell start times (the notional onset, before the peak).
 */
export function softOnset(bpm = 90, durationSec = DEFAULT_DURATION_SEC): BeatFixture {
  const rand = xorshift32(0x534f4654); // "SOFT"
  const shape = makeSoftSwell(rand);
  const ibi = 60 / bpm;
  const count = Math.floor((durationSec * bpm) / 60);
  const beatTimesSec = Array.from({ length: count }, (_, i) => i * ibi);

  return {
    samples: buildBuffer(beatTimesSec, shape, durationSec),
    beatTimesSec,
    bpm,
    label: `softOnset_${bpm}bpm`,
  };
}

// ── Fixture catalogue ──────────────────────────────────────────────────────────

export const CLICKTRACK_BPMS = [50, 60, 90, 120, 128, 140, 180, 220, 250, 300] as const;
export type ClicktrackBpm = (typeof CLICKTRACK_BPMS)[number];

export function allClicktracks(durationSec = DEFAULT_DURATION_SEC): BeatFixture[] {
  return CLICKTRACK_BPMS.map((bpm) => clicktrack(bpm, durationSec));
}

/** Complete fixture suite for the Stage-1 + Stage-2 testbench. */
export function allFixtures(durationSec = DEFAULT_DURATION_SEC): BeatFixture[] {
  return [
    ...allClicktracks(durationSec),
    halfTime(128, durationSec),
    doubleTime(64, durationSec),
    tempoRamp(120, 135, Math.max(durationSec, 20)),
    breakDrop(128, Math.max(durationSec, 24)),
    swing(120, 0.67, durationSec),
    grooveOffset(120, 10, durationSec),
    // Stage-2 fixtures
    djMix(180, Math.max(durationSec, 30)),
    tempoDrift(150, 128, Math.max(durationSec, 30)),
    djMixDrift(180, 5, Math.max(durationSec, 30)),
    softOnset(90, durationSec),
  ];
}
