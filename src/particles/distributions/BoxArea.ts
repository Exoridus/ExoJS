import { Vector } from '@/math/Vector';
import type { Distribution } from './Distribution';

/**
 * Random point inside an axis-aligned box. With `mode: 'edge'` the result
 * lies on the perimeter (uniform along all four edges combined); with
 * `mode: 'volume'` (default) it's uniformly distributed across the area.
 */
export class BoxArea implements Distribution<Vector> {
    private readonly _scratch = new Vector();

    public constructor(
        public minX: number,
        public maxX: number,
        public minY: number,
        public maxY: number,
        public mode: 'volume' | 'edge' = 'volume',
    ) {}

    public sample(out: Vector = this._scratch): Vector {
        if (this.mode === 'volume') {
            out.set(
                this.minX + Math.random() * (this.maxX - this.minX),
                this.minY + Math.random() * (this.maxY - this.minY),
            );

            return out;
        }

        const w = this.maxX - this.minX;
        const h = this.maxY - this.minY;
        const perimeter = (w + h) * 2;
        const t = Math.random() * perimeter;

        if (t < w) {
            out.set(this.minX + t, this.minY);
        } else if (t < w + h) {
            out.set(this.maxX, this.minY + (t - w));
        } else if (t < w * 2 + h) {
            out.set(this.maxX - (t - w - h), this.maxY);
        } else {
            out.set(this.minX, this.maxY - (t - w * 2 - h));
        }

        return out;
    }
}
