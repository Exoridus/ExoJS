// @vitest-environment node
import { readFileSync } from 'node:fs';

import { AttractToPoint, type ParticleBatch, RepelFromPoint } from '@codexo/exojs/particles';
import { describe, expect, it } from 'vitest';

const source = (path: string): string => readFileSync(`examples/${path}.ts`, 'utf8');

describe('B6 scene and effect teaching contracts', () => {
  it('preserves all 18 public blend choices and documents Subtract attenuation', () => {
    const text = source('sprites-textures/blendmodes');
    expect([...text.matchAll(/mode: BlendModes\.(\w+)/g)].map(match => match[1])).toEqual([
      'Normal',
      'Additive',
      'Subtract',
      'Multiply',
      'Screen',
      'Darken',
      'Lighten',
      'Overlay',
      'ColorDodge',
      'ColorBurn',
      'HardLight',
      'SoftLight',
      'Difference',
      'Exclusion',
      'Hue',
      'Saturation',
      'Color',
      'Luminosity',
    ]);
    expect(text).toContain('Cd * (1 - Cs)');
    expect(text).toContain('Normal reference');
  });
  it('keeps the advanced grading donor runnable with curves, LUTs and domain selection', () => {
    const text = source('filters/color-matrix-filter');
    expect(text).toContain('LutFilter');
    expect(text).toContain('ColorMatrixFilter');
    expect(text).toContain('colorSpace');
    expect(text).toContain('await app.start(');
  });
  it('gives identical resting particles opposite accelerations, with distinct falloff contracts', () => {
    const batch = (): ParticleBatch =>
      ({
        count: 2,
        position: { x: new Float32Array([60, 180]), y: new Float32Array(2) },
        velocity: { x: new Float32Array(2), y: new Float32Array(2) },
      }) as unknown as ParticleBatch;
    const pull = batch();
    const push = batch();
    new AttractToPoint(0, 0, 700, 120).apply(pull, 0.1);
    new RepelFromPoint(0, 0, 700, 120).apply(push, 0.1);
    expect(pull.velocity.x[0]).toBeCloseTo(-35);
    expect(push.velocity.x[0]).toBeCloseTo(35);
    expect(pull.velocity.x[1]).toBeCloseTo(-70);
    expect(push.velocity.x[1]).toBe(0);
    const zero = batch();
    new AttractToPoint(0, 0, 0, 120).apply(zero, 0.1);
    new RepelFromPoint(0, 0, 0, 120).apply(zero, 0.1);
    expect([...zero.velocity.x]).toEqual([0, 0]);
  });
  it('uses stable removable handlers and rejects stale media responses before committing a clip', () => {
    const text = source('sprites-textures/video-drawable');
    expect(text).toContain('request !== this.generation');
    expect(text).toContain('this.lifecycleSignal.aborted');
    expect(text).toContain('this.app.input.onPointerTap.remove(this.onTap)');
    expect(text).toContain("toggle('Paused', true)");
    expect(text).toContain('loaded.muted = true');
  });
});
