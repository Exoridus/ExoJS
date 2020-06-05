import type { Time } from 'core/Time';
import type { Vector } from 'math/Vector';
import type { Color } from 'core/Color';

export interface ParticleProperties {
    totalLifetime: Time;
    elapsedLifetime: Time;
    position: Vector;
    velocity: Vector;
    scale: Vector;
    rotation: number;
    rotationSpeed: number;
    textureIndex: number;
    tint: Color;
}