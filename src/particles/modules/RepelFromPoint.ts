import { UpdateModule } from './UpdateModule';
import type { ParticleSystem } from '@/particles/ParticleSystem';
import type { WgslContribution } from './WgslContribution';

/**
 * Pushes every live particle away from a fixed point in the system's local
 * coordinate space. Acceleration magnitude is `strength` (units / s²)
 * along the direction `(particle − point)`. The optional `radius` controls
 * the influence range — particles farther than `radius` are unaffected.
 * Setting `radius = 0` (default) means infinite range with no falloff.
 *
 * Use cases: shockwaves, explosion blast, mouse-cursor repel field.
 *
 * GPU-eligible.
 */
export class RepelFromPoint extends UpdateModule {
    public x: number;
    public y: number;
    public strength: number;
    public radius: number;

    public constructor(x: number, y: number, strength: number, radius = 0) {
        super();
        this.x = x;
        this.y = y;
        this.strength = strength;
        this.radius = radius;
    }

    public override apply(system: ParticleSystem, dt: number): void {
        const { posX, posY, velX, velY, liveCount } = system;
        const { x, y, strength, radius } = this;
        const radiusSq = radius * radius;

        for (let i = 0; i < liveCount; i++) {
            const dx = posX[i] - x;
            const dy = posY[i] - y;
            const distSq = dx * dx + dy * dy;

            if (distSq < 1e-10) continue;
            if (radius > 0 && distSq > radiusSq) continue;

            const dist = Math.sqrt(distSq);
            const falloff = radius > 0 ? 1 - dist / radius : 1;
            const a = (strength * falloff * dt) / dist;

            velX[i] += dx * a;
            velY[i] += dy * a;
        }
    }

    public override wgsl(): WgslContribution {
        return {
            key: 'RepelFromPoint',
            uniforms: [
                { name: 'point', type: 'vec2<f32>' },
                { name: 'strength', type: 'f32' },
                { name: 'radius', type: 'f32' },
            ],
            body: `
                let repelDelta = positions[idx] - modules.u_RepelFromPoint.point;
                let repelDistSq = dot(repelDelta, repelDelta);
                let repelRadius = modules.u_RepelFromPoint.radius;
                let repelInRange = (repelRadius <= 0.0) || (repelDistSq <= repelRadius * repelRadius);
                if (repelDistSq > 0.0000001 && repelInRange) {
                    let repelDist = sqrt(repelDistSq);
                    let repelFalloff = select(1.0, 1.0 - repelDist / max(repelRadius, 0.000001), repelRadius > 0.0);
                    let repelAccel = (modules.u_RepelFromPoint.strength * repelFalloff * dt) / repelDist;
                    velocities[idx] = velocities[idx] + repelDelta * repelAccel;
                }
            `,
        };
    }

    public override writeUniforms(view: DataView, offset: number): void {
        view.setFloat32(offset + 0, this.x, true);
        view.setFloat32(offset + 4, this.y, true);
        view.setFloat32(offset + 8, this.strength, true);
        view.setFloat32(offset + 12, this.radius, true);
    }
}
