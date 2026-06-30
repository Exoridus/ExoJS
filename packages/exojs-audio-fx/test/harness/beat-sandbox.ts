/**
 * Eval-sandbox driver for the BeatDetectorProcessor worklet.
 *
 * Mirrors the pattern established by pitch-shift-processor.test.ts:
 *   1. Stub AudioWorkletProcessor / registerProcessor / sampleRate / currentFrame.
 *   2. eval(beatDetectorWorkletSource) — captures the real production class.
 *   3. Restore globals.
 *   4. Instantiate and drive process() in configurable block sizes.
 *   5. Capture all port.postMessage output synchronously.
 *
 * Why this works:
 *   - The worklet reads sampleRate + currentFrame only in the constructor.
 *   - process() drives everything off per-sample _hopAccum / _sampleCount.
 *   - All messages are sent synchronously during process() — no macrotask race.
 *   - Block-size independence: _hopAccum counts individual samples regardless of
 *     block boundaries, so hops fire at the same positions for any block size.
 */

import { beatDetectorWorkletSource } from '../../src/worklets/beat-detector.worklet';

export const SAMPLE_RATE = 48000;

// ── WorkletMessage types ───────────────────────────────────────────────────────

export interface BeatMessage {
  type: 'beat';
  /** Approximate audio time (seconds from start) when this message was posted. */
  _audioTimeSec: number;
  audioTime: number;
  tempo: number;
  confidence: number;
  beatPhase: number;
  energy: number;
  isDownbeat: boolean;
  beatInBar: number;
}

export interface StateMessage {
  type: 'state';
  _audioTimeSec: number;
  tempo: number;
  beatPhase: number;
  confidence: number;
  gridStability: number;
  tempoCandidates: { bpm: number; score: number }[];
  rms: number;
  onsetStrength: number;
  bandEnergy: { low: number; mid: number; high: number };
  barPosition: number;
  barLength: number;
  timeSignature: { numerator: number; denominator: number };
  lookahead: { audioTime: number; tempo: number; isDownbeat: boolean; beatInBar: number }[];
  nextBeatTime: number;
  nextDownbeatTime: number;
}

export interface TempoChangeMessage {
  type: 'tempoChange';
  _audioTimeSec: number;
  newTempo: number;
  oldTempo: number;
}

export interface BarStartMessage {
  type: 'barStart';
  _audioTimeSec: number;
  audioTime: number;
  tempo: number;
  confidence: number;
  barNumber: number;
}

export type WorkletMessage = BeatMessage | StateMessage | TempoChangeMessage | BarStartMessage;

// ── Internal processor type ────────────────────────────────────────────────────

interface BeatProcessorLike {
  port: { postMessage: (m: unknown) => void };
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}

type BeatProcessorCtor = new (options: {
  processorOptions?: Record<string, unknown>;
}) => BeatProcessorLike;

// ── Module-level cache — eval runs once per test session ───────────────────────

let _processorCtor: BeatProcessorCtor | null = null;

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Eval the real `beatDetectorWorkletSource` with minimal stubs and return the
 * captured `BeatDetectorProcessor` class.
 *
 * Mirrors the save/restore discipline from `pitch-shift-processor.test.ts`.
 * After this call all globals are restored; only the returned class retains a
 * reference to the stub AudioWorkletProcessor via its prototype chain.
 */
export function buildBeatProcessor(): BeatProcessorCtor {
  let klass: BeatProcessorCtor | null = null;
  const g = globalThis as Record<string, unknown>;

  // Save current globals
  const prev = {
    sampleRate: g['sampleRate'],
    currentFrame: g['currentFrame'],
    AudioWorkletProcessor: g['AudioWorkletProcessor'],
    registerProcessor: g['registerProcessor'],
  };

  // Install stubs
  g['sampleRate'] = SAMPLE_RATE;
  g['currentFrame'] = 0;
  g['AudioWorkletProcessor'] = class StubAWP {
    port: { postMessage: (m: unknown) => void };
    constructor() {
      this.port = { postMessage: () => {} };
    }
  };
  g['registerProcessor'] = (_name: string, cls: BeatProcessorCtor) => {
    klass = cls;
  };

  // Eval the real worklet source — captures the class via registerProcessor
  eval(beatDetectorWorkletSource);

  // Restore globals
  g['sampleRate'] = prev.sampleRate;
  g['currentFrame'] = prev.currentFrame;
  if (prev.AudioWorkletProcessor === undefined) {
    delete g['AudioWorkletProcessor'];
  } else {
    g['AudioWorkletProcessor'] = prev.AudioWorkletProcessor;
  }
  if (prev.registerProcessor === undefined) {
    delete g['registerProcessor'];
  } else {
    g['registerProcessor'] = prev.registerProcessor;
  }

  if (!klass) throw new Error('registerProcessor was not called — worklet source malformed');
  return klass;
}

/**
 * Run the BeatDetectorProcessor on `samples` and return every port.postMessage
 * call as an ordered WorkletMessage array.
 *
 * Each message is annotated with `_audioTimeSec` — the approximate audio time
 * (seconds from fixture start) at which the message was posted, computed from
 * the block start position. Accuracy: ±blockSize/sampleRate (e.g. ±2.7ms at
 * blockSize=128). Sufficient for lock-time measurements.
 *
 * @param samples     Mono Float32Array at SAMPLE_RATE (48 kHz).
 * @param options.processorOptions  Forwarded to the worklet constructor.
 * @param options.blockSize         Samples per process() call. Default 128.
 */
export function runDetector(
  samples: Float32Array,
  options: {
    processorOptions?: Record<string, unknown>;
    blockSize?: number;
  } = {},
): { messages: WorkletMessage[] } {
  const { blockSize = 128, processorOptions = {} } = options;

  // Build (or reuse cached) processor class
  if (!_processorCtor) _processorCtor = buildBeatProcessor();
  const Processor = _processorCtor;

  // Ensure sampleRate + currentFrame are correct for construction
  const g = globalThis as Record<string, unknown>;
  const prevSR = g['sampleRate'];
  const prevCF = g['currentFrame'];
  g['sampleRate'] = SAMPLE_RATE;
  g['currentFrame'] = 0;

  const messages: WorkletMessage[] = [];
  const proc = new Processor({ processorOptions });

  // Replace the stub's placeholder postMessage with our collector.
  // The collector closes over `blockStartSec` which is updated per block.
  let blockStartSec = 0;
  proc.port.postMessage = (m: unknown) => {
    messages.push({ ...(m as Record<string, unknown>), _audioTimeSec: blockStartSec } as WorkletMessage);
  };

  const n = samples.length;
  for (let off = 0; off < n; off += blockSize) {
    blockStartSec = off / SAMPLE_RATE;
    const end = Math.min(off + blockSize, n);
    proc.process([[samples.subarray(off, end)]], [], {});
  }

  // Restore globals
  g['sampleRate'] = prevSR;
  g['currentFrame'] = prevCF;

  return { messages };
}
