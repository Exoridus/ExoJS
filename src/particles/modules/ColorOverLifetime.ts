import { UpdateModule } from './UpdateModule';
import type { ParticleSystem } from '@/particles/ParticleSystem';
import type { Gradient } from '@/particles/distributions/Gradient';

/**
 * Per-frame, per-particle color sampler. Each live particle's tint is set
 * to the gradient evaluated at the particle's current `elapsed / lifetime`
 * ratio, packed RGBA. Replaces the per-particle blend of `ColorAffector`
 * (legacy) with a multi-keyframe gradient.
 */
export class ColorOverLifetime extends UpdateModule {
    public gradient: Gradient;

    public constructor(gradient: Gradient) {
        super();
        this.gradient = gradient;
    }

    public override apply(system: ParticleSystem, _dt: number): void {
        const { color, elapsed, lifetime, liveCount } = system;
        const gradient = this.gradient;

        for (let i = 0; i < liveCount; i++) {
            const t = elapsed[i] / lifetime[i];

            color[i] = gradient.evaluateRgba(t);
        }
    }
}
