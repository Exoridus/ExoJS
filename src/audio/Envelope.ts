export interface EnvelopeOptions {
  /** Attack time in ms — gain ramps from 0 to peak (1.0). Default 10. */
  attackMs?: number;
  /** Decay time in ms — gain ramps from peak to sustain level. Default 100. */
  decayMs?: number;
  /** Sustain level, 0..1. Default 0.7. */
  sustainLevel?: number;
  /** Release time in ms — gain ramps from current to 0 on release(). Default 200. */
  releaseMs?: number;
}

/**
 * ADSR (Attack-Decay-Sustain-Release) envelope generator. Schedules a gain
 * curve on a target `AudioParam`:
 *
 *   attack:  0 → 1.0 (peak) over attackMs
 *   decay:   1.0 → sustainLevel over decayMs
 *   sustain: held at sustainLevel
 *   release: current → 0 over releaseMs (triggered by `release()`)
 *
 * Use `trigger()` to start the attack/decay/sustain phase, and `release()`
 * to start the release phase. Multiple envelopes can target the same
 * AudioParam; the latest schedule wins (cancel via
 * `gain.cancelScheduledValues` if needed).
 */
export class Envelope {
  public attackMs: number;
  public decayMs: number;
  public sustainLevel: number;
  public releaseMs: number;

  /**
   * The time each currently-scheduled param was triggered at, so
   * {@link Envelope.release} can reconstruct the running envelope value on
   * browsers without `cancelAndHoldAtTime`. Keyed per param rather than stored
   * once, because a single Envelope is shared across every voice of an
   * {@link AudioGenerator} and those voices trigger at different times.
   */
  private readonly _triggeredAt = new WeakMap<AudioParam, number>();

  public constructor(options: EnvelopeOptions = {}) {
    this.attackMs = Math.max(0, options.attackMs ?? 10);
    this.decayMs = Math.max(0, options.decayMs ?? 100);
    this.sustainLevel = Math.max(0, Math.min(1, options.sustainLevel ?? 0.7));
    this.releaseMs = Math.max(0, options.releaseMs ?? 200);
  }

  /**
   * Schedule attack → decay → sustain on the target gain parameter starting
   * at `atTime` (audioContext.currentTime).
   */
  public trigger(gainParam: AudioParam, atTime: number): void {
    const attackEnd = atTime + this.attackMs / 1000;
    const decayEnd = attackEnd + this.decayMs / 1000;

    gainParam.cancelScheduledValues(atTime);
    gainParam.setValueAtTime(0, atTime);
    gainParam.linearRampToValueAtTime(1, attackEnd);
    gainParam.linearRampToValueAtTime(this.sustainLevel, decayEnd);
    // Sustain held at sustainLevel until release()

    this._triggeredAt.set(gainParam, atTime);
  }

  /**
   * Schedule release → 0 starting at `atTime`. Call this when the note
   * should stop (e.g., key release, sound dismissed).
   *
   * The release starts from wherever the envelope actually is, including
   * mid-attack and mid-decay. A bare `cancelScheduledValues` would drop the
   * in-flight ramp and snap the parameter back to the previous event's value
   * (0 during attack) — an audible click.
   */
  public release(gainParam: AudioParam, atTime: number): void {
    // `cancelAndHoldAtTime` freezes the automation at its current value in one
    // step. Firefox still does not implement it, hence the analytical fallback:
    // reconstruct the value from the attack/decay geometry and pin it there
    // before the release ramp starts.
    if (typeof gainParam.cancelAndHoldAtTime === 'function') {
      gainParam.cancelAndHoldAtTime(atTime);
    } else {
      const held = this._valueAt(gainParam, atTime);
      gainParam.cancelScheduledValues(atTime);
      gainParam.setValueAtTime(held, atTime);
    }

    this._triggeredAt.delete(gainParam);

    gainParam.setTargetAtTime(0, atTime, this.releaseMs / 1000 / 3);
    // setTargetAtTime is exponential; tau = releaseMs/3 reaches ~95% of target in releaseMs.
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

    const attackEnd = triggeredAt + this.attackMs / 1000;
    const decayEnd = attackEnd + this.decayMs / 1000;

    if (time >= decayEnd) return this.sustainLevel;
    if (time >= attackEnd) return 1 + (this.sustainLevel - 1) * ((time - attackEnd) / (decayEnd - attackEnd));
    if (time <= triggeredAt) return 0;

    return (time - triggeredAt) / (attackEnd - triggeredAt);
  }

  /** Total time from trigger to fully-released (attack + decay + release). */
  public get totalDurationMs(): number {
    return this.attackMs + this.decayMs + this.releaseMs;
  }

  public destroy(): void {
    // no-op — Envelope is a configuration value, holds no resources
  }
}
