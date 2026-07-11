import type { Drawable } from '#rendering/Drawable';
import type { Material } from '#rendering/material/Material';
import type { RenderBackend } from '#rendering/RenderBackend';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import type { Texture } from '#rendering/texture/Texture';
import type { BlendModes } from '#rendering/types';

/** @internal */
export const enum RenderEntryKind {
  Draw,
  Group,
  Barrier,
}

/**
 * @internal
 *
 * Stable material identity used for safe draw-command grouping and
 * eventual instanced batching.
 *
 * - {@link pipelineKey} drives pipeline/program reuse: identical key ⇒
 *   identical GPU pipeline state (shader + blend + sampler). Two draws
 *   with the same pipeline key can be issued with a single pipeline bind.
 * - {@link bindKey} drives texture-bind reuse: identical key ⇒ identical
 *   texture bindings. Two draws with the same bind key can share a bind
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
}

/** @internal */
export interface DrawCommand {
  readonly kind: RenderEntryKind.Draw;
  /** Mutable so the builder can recycle a pooled command across frames. */
  drawable: Drawable;
  nodeIndex: number;
  seq: number;
  zIndex: number;
  material: MaterialKey;
  /** Assigned by the optimizer; consecutive draws with the same groupIndex
   *  form a batch-safe unit.  `undefined` before optimisation (and reset to
   *  `undefined` when a pooled command is recycled). Required-but-nullable so the
   *  builder can explicitly clear it under `exactOptionalPropertyTypes`. */
  groupIndex: number | undefined;
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

interface SharedTransformRenderer {
  readonly _consumesSharedTransform?: boolean;
}

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
 * texture identity — keeping grouping safe but still enabling adjacency
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
    },
    drawable,
    backend,
  );

/**
 * In-place variant of {@link makeMaterialKey}: derives the same material key but
 * writes it into `target` instead of allocating a fresh object. Used by the
 * per-drawable material-key cache (Slice 2b) so a cache miss reuses the held key
 * rather than producing per-frame garbage. Returns `target` for chaining.
 *
 * @internal
 */
export const writeMaterialKeyInto = (target: MaterialKey, drawable: Drawable, backend: RenderBackend | null): MaterialKey => {
  const rendererId = getRendererId(drawable, backend);
  const blendMode = drawable.blendMode;
  const textureId = getTextureId(drawable);
  const shaderId = getShaderId(drawable);
  const material = getMaterial(drawable);

  target.rendererId = rendererId;
  target.blendMode = blendMode;
  target.textureId = textureId;
  target.shaderId = shaderId;
  target.pipelineKey = material !== null ? material.pipelineKey : rendererId * 31 + blendMode;
  target.bindKey = material !== null ? material.bindKey : rendererId * 31 + (textureId > 0 ? textureId : 0);

  return target;
};

/**
 * Copy all fields of `source` into `target` (both {@link MaterialKey}s) without
 * allocating. Used by the pooled retained-snapshot records (Slice 3, F11a) so
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

  return target;
};

/**
 * Whether `drawable` carries its own {@link Material}. Such a drawable can mutate
 * its material's `pipelineKey`/`bindKey` internally without notifying the node,
 * so its material key must not be cached — it is recomputed every frame. The
 * default (material-less) path is safe to cache and invalidate via the existing
 * `invalidateCache` setters.
 *
 * @internal
 */
export const drawableHasOwnMaterial = (drawable: Drawable): boolean => getMaterial(drawable) !== null;

/**
 * Whether a draw command's renderer reads the shared {@link TransformBuffer} /
 * transform storage. The render-group upload boundary packs each command's
 * world transform (+ tint) keyed by its `nodeIndex`; only renderers that fetch
 * those rows back from the buffer need a record written.
 *
 * Sprite and Mesh (and their subclasses — {@link AnimatedSprite}, Video,
 * Graphics' meshes) fetch the transform via `nodeIndex` and therefore consume
 * it. Text/BitmapText and particle renderers pack their own per-node data into
 * a private data texture / uniforms and never touch the shared buffer, so they
 * opt out via `_consumesSharedTransform === false` and their writes are skipped.
 *
 * Anything else — a custom renderer, or a drawable with no registered renderer
 * (resolve throws) — defaults to writing, so behaviour is unchanged for any
 * path that might still rely on the shared transform.
 *
 * @internal
 */
export const drawCommandUsesSharedTransform = (command: DrawCommand, backend: RenderBackend): boolean => {
  const registry = (backend as BackendWithRendererRegistry).rendererRegistry;

  if (!registry || typeof registry.resolve !== 'function') {
    return true;
  }

  try {
    const renderer = registry.resolve(command.drawable) as SharedTransformRenderer;

    return renderer._consumesSharedTransform !== false;
  } catch {
    // No renderer registered for a custom drawable: keep the conservative
    // write so any consumer of the shared transform keeps working.
    return true;
  }
};
