import type { Seconds } from '#core/units';

import { getAudioContext } from './audioContext';

/** One correlated reading of the audio clock against the `performance.now()` timeline. */
export interface AudioOutputClockSnapshot {
  /** Audio-context seconds, on the same scale as `AudioContext.currentTime`. */
  readonly contextTime: number;

  /** Milliseconds on the `performance.now()` timeline, naming the same instant as {@link contextTime}. */
  readonly performanceTime: number;

  /** Processing latency the context adds between a rendered quantum and the audio subsystem, or `null` where the environment does not report it. */
  readonly baseLatency: Seconds | null;

  /** Latency between the audio subsystem and the output device, or `null` where the environment does not report it - most browsers other than Chromium. */
  readonly outputLatency: Seconds | null;

  /**
   * How the pair was obtained. `'output-timestamp'` comes from
   * `AudioContext.getOutputTimestamp()` and names the sample the device is
   * actually playing. `'estimated'` pairs `currentTime` with `performance.now()`
   * read back to back, which is what the environment allows when
   * `getOutputTimestamp()` is missing or has not produced a usable pair yet;
   * it leads the true output by roughly the output latency.
   */
  readonly source: 'output-timestamp' | 'estimated';
}

const finiteOrNull = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/**
 * Converts between audio-context time and the `performance.now()` timeline, so
 * that audio scheduled in one can be lined up with rendering, input or
 * animation measured in the other.
 *
 * ```ts
 * const clock = new AudioOutputClock();
 * const beatAt = clock.contextToPerformanceTime(nextBeatContextTime);
 * ```
 *
 * Where the environment offers `AudioContext.getOutputTimestamp()`, the
 * correlation names the sample the output device is playing right now, so a
 * context time converted through this class already accounts for the output
 * path: a beat scheduled for `contextTime` maps to the `performance.now()`
 * instant a listener hears it, with no latency arithmetic of your own.
 * {@link AudioOutputClockSnapshot.baseLatency} and `outputLatency` are
 * telemetry, not a correction to apply on top.
 *
 * Nothing here knows about display latency. Aligning a beat with the frame that
 * shows it is the caller's decision, because only the caller knows how far
 * ahead of the photons its render loop runs.
 *
 * Every reading is taken fresh, so long-lived instances track drift between the
 * two clocks rather than accumulating it. Two conversions therefore need not
 * use the identical correlation; where exactness matters more than currency,
 * take one {@link snapshot} and do the arithmetic against it.
 *
 * The wall clock is never consulted - a user changing the system time cannot
 * move an ExoJS audio correlation.
 */
export class AudioOutputClock {
  private readonly _explicitContext: AudioContext | null;
  private _anchorContext: AudioContext | null = null;
  private _anchor: AudioOutputClockSnapshot | null = null;

  /**
   * @param context Context to correlate against. Defaults to the one ExoJS
   *   shares, which the first reading creates if it does not exist yet.
   */
  public constructor(context?: AudioContext) {
    this._explicitContext = context ?? null;
  }

  /**
   * The context this clock reads. Resolving the shared context creates it when
   * none exists, the same as any other entry point into ExoJS audio.
   */
  public get context(): AudioContext {
    return this._explicitContext ?? getAudioContext();
  }

  /** Take a fresh correlated reading. */
  public snapshot(): AudioOutputClockSnapshot {
    return this._refresh();
  }

  /** The `performance.now()` instant matching `contextTime`, in milliseconds. */
  public contextToPerformanceTime(contextTime: number): number {
    const anchor = this._refresh();

    return anchor.performanceTime + (contextTime - anchor.contextTime) * 1000;
  }

  /** The audio-context instant matching `performanceTime`, in seconds. */
  public performanceToContextTime(performanceTime: number): number {
    const anchor = this._refresh();

    return anchor.contextTime + (performanceTime - anchor.performanceTime) / 1000;
  }

  private _refresh(): AudioOutputClockSnapshot {
    const context = this.context;
    const next = this._read(context);
    const anchor = this._anchor;

    // A context swap invalidates the correlation outright, and so does a change
    // of source: an estimate leads the output timestamp by the output latency,
    // so the two scales are not comparable and the newer one simply wins.
    // Within one source the reading is a clock and may only move forward, which
    // keeps a stale or repeated platform reading from dragging the anchor back.
    if (anchor === null || this._anchorContext !== context || anchor.source !== next.source || next.contextTime >= anchor.contextTime) {
      this._anchorContext = context;
      this._anchor = next;

      return next;
    }

    return anchor;
  }

  private _read(context: AudioContext): AudioOutputClockSnapshot {
    const baseLatency = finiteOrNull(context.baseLatency) as Seconds | null;
    const outputLatency = finiteOrNull((context as { outputLatency?: unknown }).outputLatency) as Seconds | null;
    const timestamp = typeof context.getOutputTimestamp === 'function' ? context.getOutputTimestamp() : undefined;
    const contextTime = finiteOrNull(timestamp?.contextTime);
    const performanceTime = finiteOrNull(timestamp?.performanceTime);

    // A context that has not rendered a quantum yet reports contextTime 0 next
    // to whatever `performance.now()` happens to be, which is a placeholder and
    // not a correlation: anchoring on it would map every later context time to
    // roughly the moment of the reading, off by the whole suspended period.
    if (contextTime !== null && performanceTime !== null && contextTime > 0) {
      return { contextTime, performanceTime, baseLatency, outputLatency, source: 'output-timestamp' };
    }

    return { contextTime: context.currentTime, performanceTime: performance.now(), baseLatency, outputLatency, source: 'estimated' };
  }
}
