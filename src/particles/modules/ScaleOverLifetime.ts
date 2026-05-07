import { UpdateModule } from './UpdateModule';
import type { ParticleSystem } from '@/particles/ParticleSystem';
import type { Curve } from '@/particles/distributions/Curve';

/**
 * Sets every live particle's scale to a curve sampled at the particle's
 * current lifetime ratio. Both axes share one curve — for non-uniform
 * scaling layer two ScaleOverLifetime modules with separate `axis` filters
 * (or extend with a per-axis variant).
 *
 * Common patterns: shrink-to-zero (start at 1, end at 0), pulse (sine-like
 * curve up to peak then down), slow-grow (linear ramp).
 */
export class ScaleOverLifetime extends UpdateModule {
    public curve: Curve;

    public constructor(curve: Curve) {
        super();
        this.curve = curve;
    }

    public override apply(system: ParticleSystem, _dt: number): void {
        const { scaleX, scaleY, elapsed, lifetime, liveCount } = system;
        const curve = this.curve;

        for (let i = 0; i < liveCount; i++) {
            const t = elapsed[i] / lifetime[i];
            const s = curve.evaluate(t);

            scaleX[i] = s;
            scaleY[i] = s;
        }
    }
}
