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
