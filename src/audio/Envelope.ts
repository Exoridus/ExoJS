import { type Seconds, seconds } from '#core/units';

export interface EnvelopeOptions {
  /** Attack time - gain ramps from 0 to peak (1.0). Default 0.01. */
  attack?: Seconds;
  /** Decay time - gain ramps from peak to sustain level. Default 0.1. */
  decay?: Seconds;
  /** Sustain level, 0..1. Default 0.7. */
  sustainLevel?: number;
  /** Release time - gain ramps from current to 0 on release(). Default 0.2. */
  release?: Seconds;
}

/**
 * ADSR (Attack-Decay-Sustain-Release) envelope generator. Schedules a gain
 * curve on a target `AudioParam`:
 *
 *   attack:  0 → 1.0 (peak) over attack
 *   decay:   1.0 → sustainLevel over decay
 *   sustain: held at sustainLevel
 *   release: current → 0 over release (triggered by `release()`)
 *
 * Use `trigger()` to start the attack/decay/sustain phase, and `release()`
 * to start the release phase. Multiple envelopes can target the same
 * AudioParam; the latest schedule wins (cancel via
 * `gain.cancelScheduledValues` if needed).
 */
export class Envelope {
  /** Attack time - gain ramps from 0 to peak (1.0). */
  public attack: Seconds;
  /** Decay time - gain ramps from peak to sustain level. */
  public decay: Seconds;
  /** Sustain level, 0..1. */
  public sustainLevel: number;
  /** Release time - gain ramps from current to 0 on {@link Envelope.release}. */
  public release: Seconds;

  /**
   * The time each currently-scheduled param was triggered at, so
   * {@link Envelope.release} can reconstruct the running envelope value on
   * browsers without `cancelAndHoldAtTime`. Keyed per param rather than stored
   * once, because a single Envelope is shared across every voice of an
   * {@link AudioGenerator} and those voices trigger at different times.
   */
  private readonly _triggeredAt = new WeakMap<AudioParam, number>();

  public constructor(options: EnvelopeOptions = {}) {
    this.attack = seconds(Math.max(0, options.attack ?? 0.01));
    this.decay = seconds(Math.max(0, options.decay ?? 0.1));
    this.sustainLevel = Math.max(0, Math.min(1, options.sustainLevel ?? 0.7));
    this.release = seconds(Math.max(0, options.release ?? 0.2));
  }

  /**
   * Schedule attack → decay → sustain on the target gain parameter starting
   * at `atTime` (audioContext.currentTime).
   *
   * `elapsed` resumes an envelope that had already run for that long when it
   * was frozen (see {@link Envelope.hold}): the schedule is laid out as if the
   * note had been triggered `elapsed` ago, so the parameter is pinned to the
   * value the envelope had reached and only the stages still ahead are
   * scheduled. A stage already behind the resume point is skipped rather than
   * replayed - that is what keeps a paused voice from starting its attack over,
   * and equally from finding the envelope run out against a clock that kept
   * ticking while it was silent.
   */
  public trigger(gainParam: AudioParam, atTime: number, elapsed: Seconds = seconds(0)): void {
    // Bookkeeping records the *virtual* trigger point, so the geometry below -
    // and every later `release()` - reads the same as for a note that really
    // started there.
    const triggeredAt = atTime - Math.max(0, elapsed);
    const attackEnd = triggeredAt + this.attack;
    const decayEnd = attackEnd + this.decay;

    gainParam.cancelScheduledValues(atTime);
    gainParam.setValueAtTime(this._valueSince(triggeredAt, atTime), atTime);

    if (attackEnd > atTime) {
      gainParam.linearRampToValueAtTime(1, attackEnd);
    }

    if (decayEnd > atTime) {
      gainParam.linearRampToValueAtTime(this.sustainLevel, decayEnd);
    }
    // Sustain held at sustainLevel until release()

    this._triggeredAt.set(gainParam, triggeredAt);
  }

  /**
   * Freeze the running automation at its current value without releasing the
   * note. Used when a voice is paused: the scheduled ramps must not keep
   * advancing against `audioContext.currentTime` while nothing is audible.
   *
   * Unlike {@link Envelope.release} this keeps the trigger bookkeeping, so the
   * envelope can be picked up again with `trigger(param, now, elapsed)`.
   */
  public hold(gainParam: AudioParam, atTime: number): void {
    if (typeof gainParam.cancelAndHoldAtTime === 'function') {
      gainParam.cancelAndHoldAtTime(atTime);

      return;
    }

    const held = this._valueAt(gainParam, atTime);
    gainParam.cancelScheduledValues(atTime);
    gainParam.setValueAtTime(held, atTime);
  }

  /**
   * Schedule release → 0 starting at `atTime`. Call this when the note
   * should stop (e.g., key release, sound dismissed).
   *
   * The release starts from wherever the envelope actually is, including
   * mid-attack and mid-decay. A bare `cancelScheduledValues` would drop the
   * in-flight ramp and snap the parameter back to the previous event's value
   * (0 during attack) - an audible click.
   */
  public releaseAt(gainParam: AudioParam, atTime: number): void {
    // `cancelAndHoldAtTime` freezes the automation at its current value in one
    // step. Firefox still does not implement it, hence the analytical fallback:
    // reconstruct the value from the attack/decay geometry and pin it there
    // before the release ramp starts.
    this.hold(gainParam, atTime);

    this._triggeredAt.delete(gainParam);

    gainParam.setTargetAtTime(0, atTime, this.release / 3);
    // setTargetAtTime is exponential; tau = release/3 reaches ~95% of target in `release`.
  }

  /**
   * The envelope value this schedule reaches at `time`, derived from the
   * attack/decay geometry recorded by {@link Envelope.trigger}. Falls back to
   * the parameter's live value when this envelope never scheduled it (or has
   * already released it), which is the best available reading.
   */
  private _valueAt(gainParam: AudioParam, time: number): number {
    const triggeredAt = this._triggeredAt.get(gainParam);

    if (triggeredAt === undefined) return gainParam.value;

    return this._valueSince(triggeredAt, time);
  }

  /** The envelope value at `time` for a schedule triggered at `triggeredAt`. */
  private _valueSince(triggeredAt: number, time: number): number {
    const attackEnd = triggeredAt + this.attack;
    const decayEnd = attackEnd + this.decay;

    if (time >= decayEnd) return this.sustainLevel;
    if (time >= attackEnd) return 1 + (this.sustainLevel - 1) * ((time - attackEnd) / (decayEnd - attackEnd));
    if (time <= triggeredAt) return 0;

    return (time - triggeredAt) / (attackEnd - triggeredAt);
  }

  /** Total time from trigger to fully-released (attack + decay + release). */
  public get totalDuration(): Seconds {
    return seconds(this.attack + this.decay + this.release);
  }

  public destroy(): void {
    // no-op - Envelope is a configuration value, holds no resources
  }
}
