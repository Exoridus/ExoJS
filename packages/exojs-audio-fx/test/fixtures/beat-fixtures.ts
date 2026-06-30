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

// ── Public generators ──────────────────────────────────────────────────────────

const DEFAULT_DURATION_SEC = 15;

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

// ── Fixture catalogue ──────────────────────────────────────────────────────────

export const CLICKTRACK_BPMS = [50, 60, 90, 120, 128, 140, 180, 220, 250] as const;
export type ClicktrackBpm = (typeof CLICKTRACK_BPMS)[number];

export function allClicktracks(durationSec = DEFAULT_DURATION_SEC): BeatFixture[] {
  return CLICKTRACK_BPMS.map((bpm) => clicktrack(bpm, durationSec));
}

/** Complete fixture suite for the Stage-1 testbench. */
export function allFixtures(durationSec = DEFAULT_DURATION_SEC): BeatFixture[] {
  return [
    ...allClicktracks(durationSec),
    halfTime(128, durationSec),
    doubleTime(64, durationSec),
    tempoRamp(120, 135, Math.max(durationSec, 20)),
    breakDrop(128, Math.max(durationSec, 24)),
    swing(120, 0.67, durationSec),
    grooveOffset(120, 10, durationSec),
  ];
}
