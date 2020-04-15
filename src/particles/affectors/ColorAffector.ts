import { IParticleAffector } from './IParticleAffector';
import { Color } from '../../core/Color';
import { Particle } from '../Particle';
import { Time } from '../../core/Time';

export class ColorAffector implements IParticleAffector {

    private readonly _fromColor: Color;
    private readonly _toColor: Color;

    constructor(fromColor: Color, toColor: Color) {
        this._fromColor = fromColor.clone();
        this._toColor = toColor.clone();
    }

    get fromColor() {
        return this._fromColor;
    }

    set fromColor(color) {
        this.setFromColor(color);
    }

    get toColor() {
        return this._toColor;
    }

    set toColor(color) {
        this.setToColor(color);
    }

    setFromColor(color: Color) {
        this._fromColor.copy(color);

        return this;
    }

    setToColor(color: Color) {
        this._toColor.copy(color);

        return this;
    }

    apply(particle: Particle, delta: Time) {
        const ratio = particle.elapsedRatio;
         const { r: r1, g: g1, b: b1, a: a1 } = this._fromColor;
         const { r: r2, g: g2, b: b2, a: a2 } = this._toColor;

        particle.tint.set(
            ((r2 - r1) * ratio) + r1,
            ((g2 - g1) * ratio) + g1,
            ((b2 - b1) * ratio) + b1,
            ((a2 - a1) * ratio) + a1
        );

        return this;
    }

    destroy() {
        this._fromColor.destroy();
        this._toColor.destroy();
    }
}
