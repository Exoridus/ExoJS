import type { Drawable } from '#rendering/Drawable';
import type { Material } from '#rendering/material/Material';
import type { RenderBackend } from '#rendering/RenderBackend';
import { resolveRendererFor } from '#rendering/rendererLookup';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import type { Texture } from '#rendering/texture/Texture';
import type { SamplerOptions } from '#rendering/texture/TextureOptions';
import { BlendModes } from '#rendering/types';

import type { UniformValue } from './Material';

/**
 * @internal
 *
 * Stable key derivation for {@link Material}. Keys are interned from a
 * normalized string descriptor, so identical material state always maps to
 * the exact same integer (no hashing, no collisions), and distinct state
 * maps to distinct integers. Descriptors are built from scalar fields in a
 * fixed order and from sorted texture-binding entries - never from
 * `JSON.stringify` over objects with unstable key order.
 *
 * Two key spaces:
 * - {@link derivePipelineKey}: shader identity + blend state.
 *   Drives GPU pipeline/program reuse and material grouping. Independent of
 *   the owning material instance, so identically configured materials share
 *   a pipeline key.
 * - {@link deriveBindKey}: material identity + base sampler override + bound
 *   texture identities.
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

  return `${sampler.scaleMode}:${sampler.wrapMode}`;
};

const isTextureBinding = (value: UniformValue): value is Texture | RenderTexture =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && !ArrayBuffer.isView(value);

/**
 * Pipeline key from shader identity and blend mode.
 * @internal
 */
export const derivePipelineKey = (shaderId: number, blendMode: BlendModes): number => {
  const descriptor = `${shaderId}|${blendMode}`;

  return intern(pipelineKeyRegistry, descriptor, () => nextPipelineKey++);
};

/**
 * Bind key from material identity and the identities of every bound
 * texture, whether declared in the `textures` map or carried as a
 * texture-valued uniform. Texture entries are sorted before joining so the
 * descriptor is independent of insertion order.
 * @internal
 */
export const deriveBindKey = (
  materialId: number,
  uniforms: Record<string, UniformValue>,
  textures: Record<string, Texture | RenderTexture>,
  sampler: SamplerOptions | null,
): number => {
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

  const descriptor = `${materialId}|${samplerDescriptor(sampler)}|${entries.join(',')}`;

  return intern(bindKeyRegistry, descriptor, () => nextBindKey++);
};

/**
 *
 * Stable material identity used for safe draw-command grouping and
 * eventual instanced batching.
 *
 * - {@link pipelineKey} drives pipeline/program reuse: identical key ⇒
 *   identical GPU pipeline state (shader + blend). Two draws
 *   with the same pipeline key can be issued with a single pipeline bind.
 * - {@link bindKey} drives texture/sampler-bind reuse: identical key ⇒
 *   identical bindings. Two draws with the same bind key can share a bind
 *   group / texture-slot state.
 *
 * When the drawable carries a {@link Material}, both keys are taken
 * directly from `material.pipelineKey` and `material.bindKey` (the Material
 * system). When the drawable uses its default path (no material),
 * the keys are derived conservatively from renderer identity, blend mode,
 * and texture identity so grouping never accidentally merges draws with
 * incompatible state.
 */
export interface MaterialKey {
  rendererId: number;
  blendMode: BlendModes;
  textureId: number;
  shaderId: number;
  pipelineKey: number;
  bindKey: number;
  /**
   * Whether the keys came from a {@link Material} the drawable carries (custom
   * path) rather than from the conservative default-path derivation. Decides how
   * much of the key {@link forcesBatchFlush} reads - see there.
   */
  ownMaterial: boolean;
}

/**
 * Whether a draw with material key `next` forces the batcher to flush when it
 * directly follows a draw with key `prev`.
 *
 * This - not "the two keys differ" - is what the plan optimizer buckets and
 * gates on, because a flush is what actually costs a draw call. On the default
 * sprite path a pure `bindKey` change is a texture change, which the 16 texture
 * slots absorb without a flush (`WebGl2SpriteRenderer._renderDefault` flushes on
 * `batchFull || blendModeChanged || slotExhausted || materialSwitch`); only the
 * pipeline - renderer identity plus blend mode - forces one. A draw carrying its
 * own {@link Material} runs the custom path, where any material switch flushes,
 * so there both keys count, as does the crossing between the two paths.
 *
 * The remaining default-path flush cause, slot exhaustion, is deliberately not
 * modelled: tracking a scope's distinct textures costs a hash op per draw, which
 * is exactly the per-draw bookkeeping the gate exists to avoid, and a scope past
 * 16 textures gains nothing measurable from pulling a single bucket together.
 *
 * @internal
 */
export const forcesBatchFlush = (prev: MaterialKey, next: MaterialKey): boolean =>
  materialKeyForcesFlush(prev.pipelineKey, prev.bindKey, prev.ownMaterial, next);

/**
 * {@link forcesBatchFlush} against a previous key held as loose fields rather
 * than an object - the shape the plan builder keeps on a scope, where snapshotting
 * the first draw's key into three primitives avoids retaining a pooled
 * {@link MaterialKey} across the frame. Same rule, one definition.
 *
 * @internal
 */
export const materialKeyForcesFlush = (prevPipelineKey: number, prevBindKey: number, prevOwnMaterial: boolean, next: MaterialKey): boolean =>
  prevPipelineKey !== next.pipelineKey || prevOwnMaterial !== next.ownMaterial || (next.ownMaterial && prevBindKey !== next.bindKey);

interface TextureCarrier {
  readonly texture?: Texture | RenderTexture | null;
}

interface ShaderCarrier {
  readonly shader?: object | null;
}

interface MaterialCarrier {
  readonly material?: Material | null;
}

const rendererIds = new WeakMap<object, number>();
const constructorRendererIds = new WeakMap<object, number>();
const shaderIds = new WeakMap<object, number>();

let nextRendererId = 1;
let nextShaderId = 1;

const getOrCreateId = (map: WeakMap<object, number>, target: object, allocate: () => number): number => {
  const cached = map.get(target);

  if (cached !== undefined) {
    return cached;
  }

  const id = allocate();
  map.set(target, id);

  return id;
};

const getRendererId = (drawable: Drawable, backend: RenderBackend | null): number => {
  // A custom drawable with no registered renderer resolves to nothing; fall
  // back to a conservative constructor-based id.
  const renderer = resolveRendererFor(backend, drawable);

  if (renderer && typeof renderer === 'object') {
    return getOrCreateId(rendererIds, renderer, () => nextRendererId++);
  }

  const ctor = drawable.constructor;

  if (ctor && typeof ctor === 'function') {
    return getOrCreateId(constructorRendererIds, ctor, () => nextRendererId++);
  }

  return 0;
};

const getDrawableTextureId = (drawable: Drawable): number => {
  const texture = (drawable as TextureCarrier).texture;

  return texture && typeof texture === 'object' ? getTextureId(texture) : -1;
};

const getShaderId = (drawable: Drawable): number => {
  const shader = (drawable as ShaderCarrier).shader;

  if (shader && typeof shader === 'object') {
    return getOrCreateId(shaderIds, shader, () => nextShaderId++);
  }

  return -1;
};

const getMaterial = (drawable: Drawable): Material | null => {
  const material = (drawable as MaterialCarrier).material;

  return material ?? null;
};

/**
 * Derive a stable material key from the drawable.
 *
 * When the drawable carries a {@link Material} (e.g. a {@link MeshMaterial}
 * or {@link SpriteMaterial}), the pipeline and bind keys are taken directly
 * from the material so identically configured materials group together.
 * When the drawable uses its default rendering path, both keys fall back
 * to a conservative derivation from renderer identity, blend mode, and
 * texture identity - keeping grouping safe but still enabling adjacency
 * coalescing for default-pipeline draws of the same type.
 *
 * @internal
 */
export const makeMaterialKey = (drawable: Drawable, backend: RenderBackend | null): MaterialKey =>
  writeMaterialKeyInto(
    {
      rendererId: 0,
      blendMode: drawable.blendMode,
      textureId: -1,
      shaderId: -1,
      pipelineKey: 0,
      bindKey: 0,
      ownMaterial: false,
    },
    drawable,
    backend,
  );

/**
 * A material key in its neutral, pre-derivation state, for a pooled record that
 * owns its key object and rewrites it in place (`copyMaterialKeyInto`) rather
 * than replacing it.
 *
 * The neutral values are not arbitrary: `-1` is "no such id" for the texture and
 * shader channels, which `getTextureId`/`getShaderId` also return, so a key that
 * has never been written groups with nothing rather than with texture 0.
 * @internal
 */
export const createEmptyMaterialKey = (): MaterialKey => ({
  rendererId: 0,
  blendMode: BlendModes.Normal,
  textureId: -1,
  shaderId: -1,
  pipelineKey: 0,
  bindKey: 0,
  ownMaterial: false,
});

/**
 * In-place variant of {@link makeMaterialKey}: derives the same material key but
 * writes it into `target` instead of allocating a fresh object. Used by the
 * per-drawable material-key cache so a cache miss reuses the held key
 * rather than producing per-frame garbage. Returns `target` for chaining.
 *
 * @internal
 */
export const writeMaterialKeyInto = (target: MaterialKey, drawable: Drawable, backend: RenderBackend | null): MaterialKey => {
  const rendererId = getRendererId(drawable, backend);
  const blendMode = drawable.blendMode;
  const textureId = getDrawableTextureId(drawable);
  const shaderId = getShaderId(drawable);
  const material = getMaterial(drawable);

  target.rendererId = rendererId;
  target.blendMode = blendMode;
  target.textureId = textureId;
  target.shaderId = shaderId;
  target.pipelineKey = material !== null ? material.pipelineKey : rendererId * 31 + blendMode;
  target.bindKey = material !== null ? material.bindKey : rendererId * 31 + Math.max(textureId, 0);
  target.ownMaterial = material !== null;

  return target;
};

/**
 * Copy all fields of `source` into `target` (both {@link MaterialKey}s) without
 * allocating. Used by the pooled retained-snapshot records so
 * a recapture rewrites the held key object instead of spreading a fresh one.
 * Returns `target` for chaining.
 *
 * @internal
 */
export const copyMaterialKeyInto = (target: MaterialKey, source: MaterialKey): MaterialKey => {
  target.rendererId = source.rendererId;
  target.blendMode = source.blendMode;
  target.textureId = source.textureId;
  target.shaderId = source.shaderId;
  target.pipelineKey = source.pipelineKey;
  target.bindKey = source.bindKey;
  target.ownMaterial = source.ownMaterial;

  return target;
};

/**
 * Whether `drawable` carries its own {@link Material}. Such a drawable can mutate
 * its material's `pipelineKey`/`bindKey` internally without notifying the node,
 * so its material key must not be cached - it is recomputed every frame. The
 * default (material-less) path is safe to cache and invalidate via the existing
 * `invalidateCache` setters.
 *
 * @internal
 */
export const drawableHasOwnMaterial = (drawable: Drawable): boolean => getMaterial(drawable) !== null;
