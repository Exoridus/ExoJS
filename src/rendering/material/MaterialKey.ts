import type { RenderTexture } from '#rendering/texture/RenderTexture';
import type { SamplerOptions } from '#rendering/texture/Sampler';
import type { Texture } from '#rendering/texture/Texture';
import type { BlendModes } from '#rendering/types';

import type { UniformValue } from './Material';

/**
 * @internal
 *
 * Stable key derivation for {@link Material}. Keys are interned from a
 * normalized string descriptor, so identical material state always maps to
 * the exact same integer (no hashing, no collisions), and distinct state
 * maps to distinct integers. Descriptors are built from scalar fields in a
 * fixed order and from sorted texture-binding entries — never from
 * `JSON.stringify` over objects with unstable key order.
 *
 * Two key spaces:
 * - {@link derivePipelineKey}: shader identity + blend + sampler state.
 *   Drives GPU pipeline/program reuse and material grouping. Independent of
 *   the owning material instance, so identically configured materials share
 *   a pipeline key.
 * - {@link deriveBindKey}: material identity + bound texture identities.
 *   Drives bind-group/slot reuse; changes when a material swaps a texture.
 */

const textureIds = new WeakMap<object, number>();
let nextTextureId = 1;

const getTextureId = (texture: object): number => {
  const cached = textureIds.get(texture);

  if (cached !== undefined) {
    return cached;
  }

  const id = nextTextureId++;
  textureIds.set(texture, id);

  return id;
};

const pipelineKeyRegistry = new Map<string, number>();
let nextPipelineKey = 1;

const bindKeyRegistry = new Map<string, number>();
let nextBindKey = 1;

const intern = (registry: Map<string, number>, descriptor: string, allocate: () => number): number => {
  const cached = registry.get(descriptor);

  if (cached !== undefined) {
    return cached;
  }

  const key = allocate();
  registry.set(descriptor, key);

  return key;
};

const samplerDescriptor = (sampler: SamplerOptions | null): string => {
  if (sampler === null) {
    return '-';
  }

  return [sampler.scaleMode, sampler.wrapMode, sampler.premultiplyAlpha ? 1 : 0, sampler.generateMipMap ? 1 : 0, sampler.flipY ? 1 : 0].join(':');
};

const isTextureBinding = (value: UniformValue): value is Texture | RenderTexture =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && !ArrayBuffer.isView(value);

/**
 * Pipeline key from shader identity, blend mode, and sampler state.
 * @internal
 */
export const derivePipelineKey = (shaderId: number, blendMode: BlendModes, sampler: SamplerOptions | null): number => {
  const descriptor = `${shaderId}|${blendMode}|${samplerDescriptor(sampler)}`;

  return intern(pipelineKeyRegistry, descriptor, () => nextPipelineKey++);
};

/**
 * Bind key from material identity and the identities of every bound
 * texture, whether declared in the `textures` map or carried as a
 * texture-valued uniform. Texture entries are sorted before joining so the
 * descriptor is independent of insertion order.
 * @internal
 */
export const deriveBindKey = (materialId: number, uniforms: Record<string, UniformValue>, textures: Record<string, Texture | RenderTexture>): number => {
  const entries: string[] = [];

  for (const name of Object.keys(textures)) {
    // `name` comes from `Object.keys(textures)`, so the lookup is defined.
    entries.push(`t:${name}=${getTextureId(textures[name]!)}`);
  }

  for (const name of Object.keys(uniforms)) {
    // `name` comes from `Object.keys(uniforms)`, so the lookup is defined.
    const value = uniforms[name]!;

    if (isTextureBinding(value)) {
      entries.push(`u:${name}=${getTextureId(value)}`);
    }
  }

  entries.sort();

  const descriptor = `${materialId}|${entries.join(',')}`;

  return intern(bindKeyRegistry, descriptor, () => nextBindKey++);
};
