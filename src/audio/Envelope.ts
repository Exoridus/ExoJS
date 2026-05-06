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

    public constructor(options: EnvelopeOptions = {}) {
        this.attackMs = Math.max(0, options.attackMs ?? 10);
        this.decayMs = Math.max(0, options.decayMs ?? 100);
        this.sustainLevel = Math.max(0, Math.min(1, options.sustainLevel ?? 0.7));
        this.releaseMs = Math.max(0, options.releaseMs ?? 200);
    }

    /**
     * Schedule attack → decay → sustain on the target gain param starting
     * at `atTime` (audioContext.currentTime).
     */
    public trigger(gainParam: AudioParam, atTime: number): void {
        const attackEnd = atTime + this.attackMs / 1000;
        const decayEnd = attackEnd + this.decayMs / 1000;

        gainParam.cancelScheduledValues(atTime);
        gainParam.setValueAtTime(0, atTime);
        gainParam.linearRampToValueAtTime(1.0, attackEnd);
        gainParam.linearRampToValueAtTime(this.sustainLevel, decayEnd);
        // Sustain held at sustainLevel until release()
    }

    /**
     * Schedule release → 0 starting at `atTime`. Call this when the note
     * should stop (e.g., key release, sound dismissed).
     */
    public release(gainParam: AudioParam, atTime: number): void {
        const releaseEnd = atTime + this.releaseMs / 1000;
        void releaseEnd; // computed for documentation purposes; setTargetAtTime handles the curve
        gainParam.cancelScheduledValues(atTime);
        // Don't snap to current value; assume gainParam.value is at sustain.
        gainParam.setTargetAtTime(0, atTime, this.releaseMs / 1000 / 3);
        // setTargetAtTime is exponential; tau = releaseMs/3 reaches ~95% of target in releaseMs.
    }

    /** Total time from trigger to fully-released (attack + decay + release). */
    public get totalDurationMs(): number {
        return this.attackMs + this.decayMs + this.releaseMs;
    }

    public destroy(): void {
        // no-op — Envelope is a configuration value, holds no resources
    }
}
