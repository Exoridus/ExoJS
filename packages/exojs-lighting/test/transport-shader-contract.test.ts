import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

const shader = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');

const composite = shader('../src/backends/shaders/light-composite.frag');
const transportGlsl = shader('../src/backends/shaders/transport.frag');
const transportWgsl = shader('../src/backends/shaders/transport.wgsl');

describe('lighting transport shader contracts', () => {
  test('the composite reads the HDR light field at highp, like the stages that produce it', () => {
    expect(composite).toContain('precision highp float;');
    expect(composite).not.toContain('precision mediump float;');
  });

  test('the GLSL walk classifies the far endpoint against the unnormalised span', () => {
    expect(transportGlsl).toContain('float endpointDenominator = delta.x * edge.y - delta.y * edge.x;');
    expect(transportGlsl).toContain(
      'beforeLimit = endpointDenominator > 0.0 ? travelNumerator > endpointDenominator : travelNumerator < endpointDenominator;',
    );
  });

  test('an exhausted mask walk reports no surface on either backend', () => {
    expect(transportGlsl).toContain('float onSurface = rastered.exhausted ? 0.0 : 1.0 - open;');
    expect(transportWgsl).toContain('let onSurface = select(1.0 - open, 0.0, rastered.exhausted);');
  });
});
