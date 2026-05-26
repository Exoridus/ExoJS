import type { Drawable } from '@/rendering/Drawable';
import type { RenderBackend } from '@/rendering/RenderBackend';
import type { RenderTexture } from '@/rendering/texture/RenderTexture';
import type { Texture } from '@/rendering/texture/Texture';
import type { BlendModes } from '@/rendering/types';

/** @internal */
export const enum RenderEntryKind {
  Draw,
  Group,
  Barrier,
}

/**
 * @internal
 *
 * Conservative batch identity for future material-aware reordering.
 *
 * MVP note:
 * - keys are populated but never used for command reordering/grouping.
 * - ids intentionally prefer stable/conservative derivation over aggressive inference.
 */
export interface MaterialKey {
  readonly rendererId: number;
  readonly blendMode: BlendModes;
  readonly textureId: number;
  readonly shaderId: number;
}

/** @internal */
export interface DrawCommand {
  readonly kind: RenderEntryKind.Draw;
  readonly drawable: Drawable;
  nodeIndex: number;
  seq: number;
  zIndex: number;
  material: MaterialKey;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface BackendWithRendererRegistry {
  readonly rendererRegistry?: {
    resolve(drawable: Drawable): unknown;
  };
}

interface TextureCarrier {
  readonly texture?: Texture | RenderTexture | null;
}

interface ShaderCarrier {
  readonly shader?: object | null;
}

const rendererIds = new WeakMap<object, number>();
const constructorRendererIds = new WeakMap<object, number>();
const textureIds = new WeakMap<object, number>();
const shaderIds = new WeakMap<object, number>();

let nextRendererId = 1;
let nextTextureId = 1;
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
  const registry = (backend as BackendWithRendererRegistry | null)?.rendererRegistry;

  if (registry && typeof registry.resolve === 'function') {
    try {
      const renderer = registry.resolve(drawable);

      if (renderer && typeof renderer === 'object') {
        return getOrCreateId(rendererIds, renderer, () => nextRendererId++);
      }
    } catch {
      // Resolve can throw if no renderer is registered for a custom drawable.
      // Fall back to a conservative constructor-based id.
    }
  }

  const ctor = drawable.constructor;

  if (ctor && typeof ctor === 'function') {
    return getOrCreateId(constructorRendererIds, ctor, () => nextRendererId++);
  }

  return 0;
};

const getTextureId = (drawable: Drawable): number => {
  const texture = (drawable as TextureCarrier).texture;

  if (texture && typeof texture === 'object') {
    return getOrCreateId(textureIds, texture, () => nextTextureId++);
  }

  return -1;
};

const getShaderId = (drawable: Drawable): number => {
  const shader = (drawable as ShaderCarrier).shader;

  if (shader && typeof shader === 'object') {
    return getOrCreateId(shaderIds, shader, () => nextShaderId++);
  }

  return -1;
};

/** @internal */
export const makeMaterialKey = (drawable: Drawable, backend: RenderBackend | null): MaterialKey => ({
  rendererId: getRendererId(drawable, backend),
  blendMode: drawable.blendMode,
  textureId: getTextureId(drawable),
  shaderId: getShaderId(drawable),
});
