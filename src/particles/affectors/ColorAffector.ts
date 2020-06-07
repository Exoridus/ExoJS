import type { IParticleAffector } from 'particles/affectors/IParticleAffector';
import type { Color } from 'core/Color';
import type { Particle } from 'particles/Particle';
import type { Time } from 'core/Time';

export class ColorAffector implements IParticleAffector {

    private readonly _fromColor: Color;
    private readonly _toColor: Color;

    public constructor(fromColor: Color, toColor: Color) {
        this._fromColor = fromColor.clone();
        this._toColor = toColor.clone();
    }

    public get fromColor(): Color {
        return this._fromColor;
    }

    public set fromColor(color) {
        this.setFromColor(color);
    }

    public get toColor(): Color {
        return this._toColor;
    }

    public set toColor(color) {
        this.setToColor(color);
    }

    public setFromColor(color: Color): this {
        this._fromColor.copy(color);

        return this;
    }

    public setToColor(color: Color): this {
        this._toColor.copy(color);

        return this;
    }

    public apply(particle: Particle, delta: Time): this {
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

    public destroy(): void {
        this._fromColor.destroy();
        this._toColor.destroy();
    }
}
