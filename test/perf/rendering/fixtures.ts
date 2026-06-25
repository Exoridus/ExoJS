/**
 * Deterministic scene fixtures for the renderer benchmark harness. Every builder
 * produces a scene whose structural metrics depend only on the configuration —
 * no randomness, no time, no GPU. Placement scatters nodes inside the view so
 * they all pass frustum culling unless a builder is explicitly asked to push some
 * off-screen.
 *
 * @internal Test/perf-only.
 */
import { Container } from '#rendering/Container';
import type { Drawable } from '#rendering/Drawable';
import { ColorFilter } from '#rendering/filters/ColorFilter';
import { Mesh } from '#rendering/mesh/Mesh';
import { NineSliceSprite } from '#rendering/sprite/NineSliceSprite';
import { RepeatingSprite } from '#rendering/sprite/RepeatingSprite';
import { Sprite } from '#rendering/sprite/Sprite';
import type { RepeatMode } from '#rendering/texture/repeat';
import { Texture } from '#rendering/texture/Texture';
import { TextureRegion } from '#rendering/texture/TextureRegion';
import { type BlendModes } from '#rendering/types';

/** A sized texture with no pixel source — enough for batching/format metrics. */
export const makeTexture = (size = 64): Texture => {
  const texture = new Texture();
  texture.setSize(size, size);

  return texture;
};

export const makeTextures = (count: number, size = 64): Texture[] => Array.from({ length: count }, () => makeTexture(size));

export const makeRegion = (texture: Texture, x = 0, y = 0, width = texture.width, height = texture.height): TextureRegion =>
  new TextureRegion(texture, { x, y, width, height });

/** How a pool of textures is distributed across `count` drawables. */
export type TextureAssign = 'cycle' | 'distinct' | 'blocks';

export const assignIndex = (assign: TextureAssign, index: number, count: number, textureCount: number): number => {
  switch (assign) {
    case 'distinct':
      return index % textureCount;
    case 'blocks':
      return Math.min(textureCount - 1, Math.floor((index / count) * textureCount));
    default:
      return index % textureCount;
  }
};

/**
 * Deterministically place `node` inside a `viewW × viewH` view so it always
 * passes culling. Uses coprime strides for an even spread without overlap-only
 * stacking.
 */
export const scatterInView = (node: Drawable, index: number, viewW: number, viewH: number, size = 64): void => {
  const spanX = Math.max(1, Math.floor(viewW - size));
  const spanY = Math.max(1, Math.floor(viewH - size));

  node.setPosition((index * 137) % spanX, (index * 251) % spanY);
};

export interface SpriteSceneConfig {
  readonly count: number;
  readonly textures: readonly Texture[];
  readonly assign?: TextureAssign;
  /** Blend modes cycled across sprites (default: all Normal). */
  readonly blendModes?: readonly BlendModes[];
  readonly size?: number;
  readonly viewW?: number;
  readonly viewH?: number;
  /** Fraction (0..1) of sprites pushed far off-screen to exercise culling. */
  readonly offscreenFraction?: number;
}

export interface SpriteScene {
  readonly root: Container;
  readonly sprites: readonly Sprite[];
}

export const buildSpriteScene = (config: SpriteSceneConfig): SpriteScene => {
  const { count, textures, assign = 'cycle', blendModes, size = 64, viewW = 1280, viewH = 720, offscreenFraction = 0 } = config;
  const root = new Container();
  const sprites: Sprite[] = [];
  const offscreenCount = Math.floor(count * offscreenFraction);

  for (let i = 0; i < count; i++) {
    const texture = textures[assignIndex(assign, i, count, textures.length)];
    const sprite = new Sprite(texture);

    if (blendModes !== undefined && blendModes.length > 0) {
      sprite.blendMode = blendModes[i % blendModes.length];
    }

    if (i < offscreenCount) {
      sprite.setPosition(-100000 - i * 100, -100000);
    } else {
      scatterInView(sprite, i, viewW, viewH, size);
    }

    root.addChild(sprite);
    sprites.push(sprite);
  }

  return { root, sprites };
};

export interface NineSliceSceneConfig {
  readonly count: number;
  readonly textures: readonly Texture[];
  readonly assign?: TextureAssign;
  /** Source slice inset (px) — corner size in the atlas. */
  readonly slice?: number;
  /** Destination size of each nine-slice. */
  readonly width?: number;
  readonly height?: number;
  /** Edge + center fill mode. `'stretch'` → 4 quads, `'repeat'`/`'mirror-repeat'` → many. */
  readonly fill?: RepeatMode;
  readonly viewW?: number;
  readonly viewH?: number;
}

export interface NineSliceScene {
  readonly root: Container;
  readonly sprites: readonly NineSliceSprite[];
}

export const buildNineSliceScene = (config: NineSliceSceneConfig): NineSliceScene => {
  const { count, textures, assign = 'cycle', slice = 16, width = 96, height = 96, fill = 'stretch', viewW = 1280, viewH = 720 } = config;
  const root = new Container();
  const sprites: NineSliceSprite[] = [];

  for (let i = 0; i < count; i++) {
    const texture = textures[assignIndex(assign, i, count, textures.length)];
    const sprite = new NineSliceSprite(texture, {
      slices: slice,
      width,
      height,
      modes: { edges: fill, center: fill },
    });

    scatterInView(sprite, i, viewW, viewH, Math.max(width, height));
    root.addChild(sprite);
    sprites.push(sprite);
  }

  return { root, sprites };
};

export type RepeatingPath = 'shader' | 'geometry';

export interface RepeatingSceneConfig {
  readonly count: number;
  readonly textures: readonly Texture[];
  readonly assign?: TextureAssign;
  /** `'shader'` uses bare-texture sources; `'geometry'` wraps each in a TextureRegion. */
  readonly path?: RepeatingPath;
  readonly width?: number;
  readonly height?: number;
  readonly modeX?: RepeatMode;
  readonly modeY?: RepeatMode;
  readonly viewW?: number;
  readonly viewH?: number;
}

export interface RepeatingScene {
  readonly root: Container;
  readonly sprites: readonly RepeatingSprite[];
}

export const buildRepeatingScene = (config: RepeatingSceneConfig): RepeatingScene => {
  const {
    count,
    textures,
    assign = 'cycle',
    path = 'shader',
    width = 128,
    height = 128,
    modeX = 'repeat',
    modeY = 'repeat',
    viewW = 1280,
    viewH = 720,
  } = config;
  const root = new Container();
  const sprites: RepeatingSprite[] = [];

  for (let i = 0; i < count; i++) {
    const texture = textures[assignIndex(assign, i, count, textures.length)];
    const source = path === 'geometry' ? makeRegion(texture) : texture;
    const sprite = new RepeatingSprite(source, { width, height, modeX, modeY });

    scatterInView(sprite, i, viewW, viewH, Math.max(width, height));
    root.addChild(sprite);
    sprites.push(sprite);
  }

  return { root, sprites };
};

// ── Complex scenes (high plan-allocation) ──────────────────────────────────
// A flat sprite list collapses to ~1 scope and batches into ~1 draw, so it
// allocates almost nothing per frame. These exercise the paths the cheap path
// hides: many Group scopes (deep nesting → per-scope plan work the inline group
// walk of 2c made allocation-free), per-drawable Mesh draws (2e), and per-effect
// Barrier scopes + child plans (2c).

/** Local-space unit quad (x,y pairs) sized `size`, for a textured {@link Mesh}. */
const quadVertices = (size: number): Float32Array => new Float32Array([0, 0, size, 0, size, size, 0, size]);
const QUAD_INDICES = new Uint16Array([0, 1, 2, 0, 2, 3]);
const QUAD_UVS = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);

export interface NestedSceneConfig {
  readonly count: number;
  /** Sprites per leaf container (default 8). */
  readonly perContainer?: number;
  /** Container chain depth per group (default 2). */
  readonly depth?: number;
  readonly textures: readonly Texture[];
  readonly assign?: TextureAssign;
  readonly viewW?: number;
  readonly viewH?: number;
}

/**
 * `count` sprites packed into a balanced container hierarchy: groups of
 * `perContainer` sprites, each group a chain of `depth` nested containers under
 * the root. A flat list is ~1 scope; this is ~`count / perContainer × depth`
 * Group scopes, so it stresses the per-scope plan playback that 2c made
 * allocation-free (it formerly materialized a `RenderGroup[]` per scope).
 */
export const buildNestedScene = (config: NestedSceneConfig): SpriteScene => {
  const { count, perContainer = 8, depth = 2, textures, assign = 'cycle', viewW = 1280, viewH = 720 } = config;
  const root = new Container();
  const sprites: Sprite[] = [];
  let group: Container = root;

  for (let i = 0; i < count; i++) {
    if (i % perContainer === 0) {
      let leaf = new Container();
      root.addChild(leaf);

      for (let d = 1; d < depth; d++) {
        const next = new Container();
        leaf.addChild(next);
        leaf = next;
      }

      group = leaf;
    }

    const texture = textures[assignIndex(assign, i, count, textures.length)];
    const sprite = new Sprite(texture);

    scatterInView(sprite, i, viewW, viewH);
    group.addChild(sprite);
    sprites.push(sprite);
  }

  return { root, sprites };
};

export interface MeshSceneConfig {
  readonly count: number;
  readonly textures: readonly Texture[];
  readonly assign?: TextureAssign;
  readonly size?: number;
  readonly viewW?: number;
  readonly viewH?: number;
}

export interface MeshScene {
  readonly root: Container;
  readonly meshes: readonly Mesh[];
}

/** `count` textured-quad {@link Mesh} drawables — exercises the mesh-renderer draw path (2e). */
export const buildMeshScene = (config: MeshSceneConfig): MeshScene => {
  const { count, textures, assign = 'cycle', size = 64, viewW = 1280, viewH = 720 } = config;
  const root = new Container();
  const meshes: Mesh[] = [];

  for (let i = 0; i < count; i++) {
    const texture = textures[assignIndex(assign, i, count, textures.length)];
    const mesh = new Mesh({ vertices: quadVertices(size), indices: QUAD_INDICES, uvs: QUAD_UVS, texture });

    scatterInView(mesh, i, viewW, viewH, size);
    root.addChild(mesh);
    meshes.push(mesh);
  }

  return { root, meshes };
};

export interface FilteredSceneConfig {
  readonly count: number;
  readonly textures: readonly Texture[];
  readonly assign?: TextureAssign;
  readonly viewW?: number;
  readonly viewH?: number;
}

/**
 * `count` sprites each carrying a {@link ColorFilter}, so the plan emits a
 * Barrier scope + child plan per sprite (the effect-node path through
 * `RenderEffectExecutor` and the per-scope plan playback 2c made allocation-free).
 */
export const buildFilteredScene = (config: FilteredSceneConfig): SpriteScene => {
  const { count, textures, assign = 'cycle', viewW = 1280, viewH = 720 } = config;
  const root = new Container();
  const sprites: Sprite[] = [];

  for (let i = 0; i < count; i++) {
    const texture = textures[assignIndex(assign, i, count, textures.length)];
    const sprite = new Sprite(texture);

    sprite.addFilter(new ColorFilter());
    scatterInView(sprite, i, viewW, viewH);
    root.addChild(sprite);
    sprites.push(sprite);
  }

  return { root, sprites };
};
