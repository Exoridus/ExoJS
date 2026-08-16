/**
 * Scene catalog for the WebGPU allocation audit.
 *
 * Mirrors the Node gate's archetypes (`test/perf/rendering/allocationScenes.ts`)
 * scene for scene where the same work unit exists, so a WebGPU reading and a
 * WebGL2 reading describe the same frame — they are NOT comparable as numbers
 * (different upload machinery, different backend objects), only as shapes.
 *
 * Two deliberate differences from the Node catalog:
 *
 *  - every texture carries a real canvas source. The Node fixtures build
 *    source-less `Texture`s, which the WebGPU backend rejects before it uploads.
 *  - the effect scenes come along rather than living in a separate probe list.
 *    Each scene here is measured in its own browser process anyway, so the
 *    ordering constraint that keeps the Node gate's catalog frozen does not
 *    apply.
 *
 * @internal Test/perf-only.
 */
import { Container } from '#rendering/Container';
import { BlurFilter } from '#rendering/filters/BlurFilter';
import { ColorFilter } from '#rendering/filters/ColorFilter';
import type { RenderNode } from '#rendering/RenderNode';
import { Sprite } from '#rendering/sprite/Sprite';
import type { Texture } from '#rendering/texture/Texture';
import { BlendModes } from '#rendering/types';

import { buildMeshScene, buildNestedScene, buildSpriteScene, scatterInView } from '../rendering/fixtures';
import type { WebGpuHarness } from './webgpuAllocHarness';
import { makeCanvasTexture, makeCanvasTextures, VIEW_HEIGHT, VIEW_WIDTH } from './webgpuAllocHarness';

export interface WebGpuAllocScene {
  readonly root: RenderNode;
  readonly beforeFrame?: () => void;
  readonly teardown?: () => void;
}

export interface WebGpuAllocArchetype {
  readonly id: string;
  /** The WebGPU path this scene reaches that the others do not. */
  readonly rationale: string;
  readonly warmup?: number;
  readonly frames?: number;
  build(harness: WebGpuHarness): WebGpuAllocScene;
}

/** Fixed-function blend modes only — `>= Darken` takes the backdrop-aware shader path. */
const FIXED_FUNCTION_BLENDS = [BlendModes.Normal, BlendModes.Additive, BlendModes.Subtract, BlendModes.Multiply] as const;

/**
 * Where the light scenes' window series flattens HERE. The Node catalog needs
 * 1500; a WebGPU frame costs orders more wall-clock, and the series is already
 * stationary at 400 (verified by comparing successive windows in one process).
 */
const SETTLED_WARMUP = 400;

/** Effect frames cost 30 ms and up on a real device, so the warm-up is sized to what is affordable AND settled. */
const EFFECT_WARMUP = 150;

/** Same reason for the window: 60 effect frames is already a minute of GPU work across three processes. */
const EFFECT_FRAMES = 60;

const nudgeEveryNth = (sprites: readonly Sprite[], stride: number): (() => void) => {
  let frame = 0;

  return (): void => {
    frame++;

    const dx = frame % 2 === 0 ? 1 : -1;

    for (let i = 0; i < sprites.length; i += stride) {
      const sprite = sprites[i]!;

      sprite.setPosition(sprite.position.x + dx, sprite.position.y);
    }
  };
};

/** `count` scattered sprites under one root, each handed to `decorate`. */
const decoratedSprites = (count: number, texture: Texture, decorate: (sprite: Sprite, index: number) => void): WebGpuAllocScene => {
  const root = new Container();

  for (let i = 0; i < count; i++) {
    const sprite = new Sprite(texture);

    scatterInView(sprite, i, VIEW_WIDTH, VIEW_HEIGHT);
    decorate(sprite, i);
    root.addChild(sprite);
  }

  return { root, teardown: () => root.destroy() };
};

export const WEBGPU_ALLOC_ARCHETYPES: readonly WebGpuAllocArchetype[] = [
  {
    id: 'empty',
    rationale: 'Harness + sampler + browser floor. Everything else is read against this, not against zero.',
    build: () => {
      const { root } = buildSpriteScene({ count: 0, textures: [makeCanvasTexture()] });

      return { root, teardown: () => root.destroy() };
    },
  },
  {
    id: 'sprite/1000 static',
    rationale: 'Nothing dirty: retained replay plus the persistent slot path. Any per-frame allocation here is pure waste.',
    build: () => {
      const { root } = buildSpriteScene({ count: 1000, textures: [makeCanvasTexture()], viewW: VIEW_WIDTH, viewH: VIEW_HEIGHT });

      return { root, teardown: () => root.destroy() };
    },
  },
  {
    id: 'sprite/1000 moving',
    rationale: 'Every transform dirty every frame — the full transform storage re-upload path.',
    build: () => {
      const { root, sprites } = buildSpriteScene({ count: 1000, textures: [makeCanvasTexture()], viewW: VIEW_WIDTH, viewH: VIEW_HEIGHT });

      return { root, beforeFrame: nudgeEveryNth(sprites, 1), teardown: () => root.destroy() };
    },
  },
  {
    id: 'sprite/10000 transform-only 1%',
    rationale: 'Large static scene with a small moving subset — the sparse dirty-range path and the per-frame order upload.',
    build: () => {
      const { root, sprites } = buildSpriteScene({ count: 10000, textures: [makeCanvasTexture()], viewW: VIEW_WIDTH, viewH: VIEW_HEIGHT });

      return { root, beforeFrame: nudgeEveryNth(sprites, 100), teardown: () => root.destroy() };
    },
  },
  {
    id: 'nested/1000 d4',
    rationale: 'Many Group scopes, all clean: per-scope plan playback with retained group resources.',
    build: () => {
      const { root } = buildNestedScene({ count: 1000, perContainer: 8, depth: 4, textures: [makeCanvasTexture()], viewW: VIEW_WIDTH, viewH: VIEW_HEIGHT });

      return { root, teardown: () => root.destroy() };
    },
  },
  {
    id: 'mesh/1000',
    rationale: 'Per-drawable mesh draws — the WebGPU mesh renderer builds its own uniform/transform bind groups.',
    build: () => {
      const { root } = buildMeshScene({ count: 1000, textures: [makeCanvasTexture()], viewW: VIEW_WIDTH, viewH: VIEW_HEIGHT });

      return { root, teardown: () => root.destroy() };
    },
  },
  {
    id: 'blend/1000 plateau64',
    rationale: 'Four fixed-function blend modes in runs of 64 — ~16 flush boundaries per frame. Per-BATCH cost at a realistic rate.',
    warmup: SETTLED_WARMUP,
    build: () => {
      const { root } = buildSpriteScene({
        count: 1000,
        textures: [makeCanvasTexture()],
        blendModes: FIXED_FUNCTION_BLENDS,
        blendRunLength: 64,
        viewW: VIEW_WIDTH,
        viewH: VIEW_HEIGHT,
      });

      return { root, teardown: () => root.destroy() };
    },
  },
  {
    id: 'blend/1000 alternating',
    rationale: 'The same modes alternating per sprite — ~1000 flushes per frame. Deliberately pathological: it makes a per-flush cost legible.',
    build: () => {
      const { root } = buildSpriteScene({
        count: 1000,
        textures: [makeCanvasTexture()],
        blendModes: FIXED_FUNCTION_BLENDS,
        viewW: VIEW_WIDTH,
        viewH: VIEW_HEIGHT,
      });

      return { root, teardown: () => root.destroy() };
    },
  },
  {
    id: 'texture/8 distinct',
    rationale: 'Eight textures cycled across 1000 sprites — texture state lookup and material bind groups once per bound texture per draw.',
    build: () => {
      const { root } = buildSpriteScene({ count: 1000, textures: makeCanvasTextures(8), assign: 'distinct', viewW: VIEW_WIDTH, viewH: VIEW_HEIGHT });

      return { root, teardown: () => root.destroy() };
    },
  },
  {
    id: 'filter/color 100',
    rationale: 'One barrier + one offscreen target + one Filter.apply per sprite — the WebGPU effect path at its most repetitive.',
    warmup: EFFECT_WARMUP,
    frames: EFFECT_FRAMES,
    build: () => decoratedSprites(100, makeCanvasTexture(), sprite => sprite.addFilter(new ColorFilter())),
  },
  {
    id: 'filter/blur-q3 100',
    rationale: 'Three blur draws per filter pass while the pass count stays at one — varies draws per pass, not passes.',
    warmup: EFFECT_WARMUP,
    frames: EFFECT_FRAMES,
    build: () => decoratedSprites(100, makeCanvasTexture(), sprite => sprite.addFilter(new BlurFilter({ radius: 4, quality: 3 }))),
  },
  {
    id: 'filter/container 1000',
    rationale: 'A single filter over a large subtree — the opposite extreme from one filter per sprite.',
    warmup: EFFECT_WARMUP,
    frames: EFFECT_FRAMES,
    build: () => {
      const texture = makeCanvasTexture();
      const root = new Container();
      const group = new Container();

      for (let i = 0; i < 1000; i++) {
        const sprite = new Sprite(texture);

        scatterInView(sprite, i, VIEW_WIDTH, VIEW_HEIGHT);
        group.addChild(sprite);
      }

      group.addFilter(new ColorFilter());
      root.addChild(group);

      return { root, teardown: () => root.destroy() };
    },
  },
  {
    id: 'mesh/1000 moving',
    rationale: 'Mesh draws with every transform dirty — mesh transforms take the same storage path as sprites but through the mesh renderer.',
    build: () => {
      const { root, meshes } = buildMeshScene({ count: 1000, textures: [makeCanvasTexture()], viewW: VIEW_WIDTH, viewH: VIEW_HEIGHT });
      let frame = 0;

      return {
        root,
        beforeFrame: (): void => {
          frame++;

          const dx = frame % 2 === 0 ? 1 : -1;

          for (const mesh of meshes) {
            mesh.setPosition(mesh.position.x + dx, mesh.position.y);
          }
        },
        teardown: () => root.destroy(),
      };
    },
  },
];

export const findWebGpuArchetype = (id: string): WebGpuAllocArchetype | undefined => WEBGPU_ALLOC_ARCHETYPES.find(archetype => archetype.id === id);
