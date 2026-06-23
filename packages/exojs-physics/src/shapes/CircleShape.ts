import { Shape } from './Shape';

/**
 * A circle of the given `radius` centred on the collider's local origin.
 * The cheapest shape for both broad- and narrow-phase.
 */
export class CircleShape extends Shape {
  public readonly type = 'circle' as const;
  public readonly radius: number;
  public readonly boundingRadius: number;
  public readonly area: number;
  public readonly centroidX = 0;
  public readonly centroidY = 0;
  public readonly unitInertia: number;

  public constructor(radius: number) {
    super();

    if (!Number.isFinite(radius) || radius <= 0) {
      throw new RangeError(`CircleShape: radius must be a positive finite number, received ${radius}.`);
    }

    this.radius = radius;
    this.boundingRadius = radius;
    this.area = Math.PI * radius * radius;
    // Second moment of area of a disc about its centre: ∫ r² dA = (π/2) R⁴.
    this.unitInertia = 0.5 * this.area * radius * radius;

    Object.freeze(this);
  }
}
