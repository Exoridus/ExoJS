import { Time } from 'core/Time';
import { Vector } from 'math/Vector';
import { Color } from 'core/Color';

export interface IParticleProps {
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