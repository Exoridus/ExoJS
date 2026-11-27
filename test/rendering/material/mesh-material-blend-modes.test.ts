import { describe, expect, test } from 'vitest';

import { MeshMaterial } from '#rendering/material/MeshMaterial';
import { Shader } from '#rendering/shader/Shader';
import { BlendModes } from '#rendering/types';
import { createQuadIndices } from '#rendering/utils';

describe('MeshMaterial blendModes', () => {
  test('the material snapshots the caller array', () => {
    const modes = [BlendModes.Normal, BlendModes.Additive];
    const material = new MeshMaterial({ shader: new Shader({ glsl: { vertex: 'v', fragment: 'f' } }), blendModes: modes });
    const key = material.pipelineKey;

    modes[1] = BlendModes.Multiply;

    expect(material.blendModes).toEqual([BlendModes.Normal, BlendModes.Additive]);
    expect(material.pipelineKey).toBe(key);
  });
});

describe('createQuadIndices', () => {
  test('the largest addressable batch is accepted and one more quad is refused', () => {
    expect(createQuadIndices(16384)).toHaveLength(16384 * 6);
    expect(() => createQuadIndices(16385)).toThrow(RangeError);
    expect(() => createQuadIndices(-1)).toThrow(RangeError);
    expect(() => createQuadIndices(1.5)).toThrow(RangeError);
  });
});
