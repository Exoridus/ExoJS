import type { ShapeMassProperties } from './Shape';
import { Shape } from './Shape';

/**
 * A circle of the given `radius` centred on the collider's local origin.
 * The cheapest shape for both broad- and narrow-phase.
 */
export class CircleShape extends Shape {
  public readonly type = 'circle' as const;
  public readonly radius: number;
  public readonly boundingRadius: number;
  public readonly massProperties: ShapeMassProperties;

  public constructor(radius: number) {
    super();

    if (!Number.isFinite(radius) || radius <= 0) {
      throw new RangeError(`CircleShape: radius must be a positive finite number, received ${radius}.`);
    }

    const area = Math.PI * radius * radius;

    this.radius = radius;
    this.boundingRadius = radius;
    this.massProperties = Object.freeze({
      area,
      centroidX: 0,
      centroidY: 0,
      // Second moment of area of a disc about its centre: ∫ r² dA = (π/2) R⁴.
      unitInertia: 0.5 * area * radius * radius,
    });

    Object.freeze(this);
  }
}
