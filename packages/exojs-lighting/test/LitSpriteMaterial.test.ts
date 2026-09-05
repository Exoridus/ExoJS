import { BlendModes, ScaleModes, type System, Texture, WrapModes } from '@codexo/exojs';
import { describe, expect, expectTypeOf, test } from 'vitest';

import { LightingSystem } from '../src/LightingSystem';
import { LitSpriteMaterial } from '../src/LitSpriteMaterial';

const normalMap = (): Texture => new Texture(null);

describe('LitSpriteMaterial', () => {
  test('binds the normal map ahead of the light texture, matching the WGSL group(2) order', () => {
    const lighting = new LightingSystem();
    const material = new LitSpriteMaterial({ lighting, normalMap: normalMap() });

    expect(material._bindingSchema.textureNames).toEqual(['u_normalMap', 'u_lights']);
    expect(material._bindingSchema.scalarUniformNames).toEqual([]);
    expect(material.textures.u_lights).toBe(lighting.lightTexture);
    expect(material.target).toBe('sprite');
  });

  test('carries both backends and shares one shader source across instances', () => {
    const lighting = new LightingSystem();
    const first = new LitSpriteMaterial({ lighting, normalMap: normalMap() });
    const second = new LitSpriteMaterial({ lighting, normalMap: normalMap() });

    expect(first.shader.glsl?.fragment).toContain('sampleBase(v_textureSlot, v_texcoord)');
    expect(first.shader.wgsl).toContain('fn fragmentMain(input: VertexOutput)');
    expect(first.shader).toBe(second.shader);
    expect(first.pipelineKey).toBe(second.pipelineKey);
  });

  test('defaults to normal blending and an inherited base sampler', () => {
    const material = new LitSpriteMaterial({ lighting: new LightingSystem(), normalMap: normalMap() });

    expect(material.blendMode).toBe(BlendModes.Normal);
    expect(material.sampler).toBeNull();
  });

  test('honours the blend mode and sampler overrides', () => {
    const material = new LitSpriteMaterial({
      lighting: new LightingSystem(),
      normalMap: normalMap(),
      blendMode: BlendModes.Additive,
      sampler: { scaleMode: ScaleModes.Nearest, wrapMode: WrapModes.Repeat },
    });

    expect(material.blendMode).toBe(BlendModes.Additive);
    expect(material.sampler).toEqual({ scaleMode: ScaleModes.Nearest, wrapMode: WrapModes.Repeat });
  });

  test('swapping the normal map changes the bind key', () => {
    const material = new LitSpriteMaterial({ lighting: new LightingSystem(), normalMap: normalMap() });
    const before = material.bindKey;
    const replacement = normalMap();

    material.normalMap = replacement;

    expect(material.normalMap).toBe(replacement);
    expect(material.bindKey).not.toBe(before);
  });

  test('a LightingSystem is registrable as an engine System', () => {
    expectTypeOf<LightingSystem>().toExtend<System>();
  });
});
