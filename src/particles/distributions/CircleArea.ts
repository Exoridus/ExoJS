import { Vector } from '@/math/Vector';
import type { Distribution } from './Distribution';

const TAU = Math.PI * 2;

/**
 * Random point on or inside a circle of radius `radius`, centred at
 * `(centerX, centerY)`. With `mode: 'edge'` the result lies exactly on the
 * circumference; with `mode: 'volume'` (default) it lies anywhere in the
 * disk, with uniform area density (sqrt-of-random-radius distribution).
 *
 * Use as a spawn-position distribution for circular emitters.
 */
export class CircleArea implements Distribution<Vector> {
    private readonly _scratch = new Vector();

    public constructor(
        public centerX: number,
        public centerY: number,
        public radius: number,
        public mode: 'volume' | 'edge' = 'volume',
    ) {}

    public sample(out: Vector = this._scratch): Vector {
        const angle = Math.random() * TAU;
        const r = this.mode === 'edge' ? this.radius : this.radius * Math.sqrt(Math.random());

        out.set(this.centerX + Math.cos(angle) * r, this.centerY + Math.sin(angle) * r);

        return out;
    }
}
