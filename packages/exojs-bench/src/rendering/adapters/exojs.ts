import { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { ShaderSource } from '#rendering/material/ShaderSource';
import { SpriteMaterial } from '#rendering/material/SpriteMaterial';
import { RenderBackendType } from '#rendering/RenderBackendType';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { Sprite } from '#rendering/sprite/Sprite';
import { spriteVertexGlsl } from '#rendering/sprite/spriteMaterialSources';
import { Texture } from '#rendering/texture/Texture';
import { BlendModes } from '#rendering/types';
import { View } from '#rendering/View';
import type { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { mutationSignature, selectMutationIndices } from '../../shared/mutation';
import type { ArchetypeSpec, Backend, EngineAdapter } from '../EngineAdapter';

/** Fixed design-space viewport the harness canvas renders (see `page/index.html`). */
const VIEWPORT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 720;
/** Inset that keeps every gridded sprite (plus its mutation wobble) inside the view so culling never removes it mid-run. */
const GRID_MARGIN = 32;
/** Side length of the generated per-archetype textures / sprites, in pixels. */
const SPRITE_SIZE = 8;
/** Peak per-axis displacement applied to a mutated leaf; small enough to never cross the viewport edge. */
const WOBBLE_AMPLITUDE = 2;
/** Phase step per frame for the mutation wobble. */
const WOBBLE_SPEED = 0.15;

/**
 * Fixed-function blend modes cycled by the `mixed-blend` / `mixed-material`
 * archetypes. Deliberately only modes 0-4 (`isAdvancedBlendMode` false, see
 * `#rendering/types`): those map to a GPU blend equation and have a
 * one-to-one Pixi equivalent. An advanced mode would route through the
 * backdrop-capture compositor here and through a completely different (or
 * absent) path on the other arm, so the comparison would be meaningless.
 */
const CYCLED_BLEND_MODES: readonly BlendModes[] = [BlendModes.Normal, BlendModes.Additive, BlendModes.Multiply, BlendModes.Screen];

/**
 * Fragment source for one of the `mixed-material` archetype's custom sprite
 * materials. Intentionally near-trivial (base-texture sample times a per-material
 * uniform): the archetype measures the CPU cost of the custom-material BATCHING
 * path (shader/uniform/texture rebinding per batch), not fragment ALU. A heavy
 * fragment would move the bottleneck to the GPU and hide the thing under test.
 */
const materialFragmentGlsl = `#version 300 es
precision mediump float;
in vec2 v_texcoord;
in vec4 v_color;
uniform sampler2D u_texture;
uniform vec4 u_userColor;
out vec4 fragColor;
void main() {
  fragColor = texture(u_texture, v_texcoord) * v_color * u_userColor;
}`;

/** WGSL twin of {@link materialFragmentGlsl} so the same material also runs on the WebGPU backend. */
const materialFragmentWgsl = `
struct UserUniforms { color: vec4<f32> };
@group(2) @binding(0) var<uniform> u_user: UserUniforms;

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let base = textureSample(u_texture, u_sampler, input.texcoord);
  return base * input.color * u_user.color;
}
`.trim();

/** Build one of `total` distinct custom sprite materials (distinct instances — the batcher keys on identity). */
const createDistinctMaterial = (index: number, total: number): SpriteMaterial =>
  new SpriteMaterial({
    shader: new ShaderSource({ glsl: { vertex: spriteVertexGlsl, fragment: materialFragmentGlsl }, wgsl: materialFragmentWgsl }),
    uniforms: { u_userColor: [1, 1 - index / Math.max(1, total), 1, 1] },
  });

/** A pre-selected leaf sprite and its resting grid position — the only nodes `mutate` disturbs. */
interface MutableLeaf {
  readonly sprite: Sprite;
  readonly baseX: number;
  readonly baseY: number;
}

/**
 * Generate one of `total` visually distinct solid-colour textures from a small
 * canvas. Distinct texture identities are what force the `batch-breaking`
 * archetype to break instanced batches (each texture is a separate GPU bind).
 */
const createDistinctTexture = (index: number, total: number): Texture => {
  const canvas = document.createElement('canvas');

  canvas.width = SPRITE_SIZE;
  canvas.height = SPRITE_SIZE;

  const context = canvas.getContext('2d');

  if (context === null) {
    throw new Error('A 2D context is required to generate benchmark textures.');
  }

  const hue = total > 1 ? Math.round((index / total) * 360) : 210;

  context.fillStyle = `hsl(${hue}, 70%, 55%)`;
  context.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);

  return new Texture(canvas);
};

/**
 * Build `count` `View`s tiled in a near-square screen grid (split-screen /
 * multi-viewport), each showing the SAME full-viewport world rect — the
 * `split-screen` archetype exercises N simultaneous replays of one retained
 * scene, not N distinct camera framings, so the views deliberately overlap in
 * world space and differ only in which screen fraction they write to.
 */
const buildViewGrid = (count: number): View[] => {
  const columns = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / columns));
  const cellFractionW = 1 / columns;
  const cellFractionH = 1 / rows;
  const grid: View[] = [];

  for (let index = 0; index < count; index++) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const view = new View(VIEWPORT_WIDTH / 2, VIEWPORT_HEIGHT / 2, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

    view.setViewport(column * cellFractionW, row * cellFractionH, cellFractionW, cellFractionH);
    grid.push(view);
  }

  return grid;
};

/**
 * ExoJS engine arm of the baseline benchmark.
 *
 * Drives the public {@link Application} API — the production path, which
 * registers the core renderers via `materializeRendererBindings` during
 * construction — rather than constructing a backend directly, so the benchmark
 * measures the code a user would actually run. A single frame is produced by
 * the same two calls the production render phase issues (`rendering.render(node)`
 * then `backend.flush()`), driven explicitly so the harness owns frame cadence
 * instead of the engine's `requestAnimationFrame` loop.
 *
 * Supports both the `'webgl2'` and `'webgpu'` backends; the per-frame call
 * sequence (`resetStats(); clear(); rendering.render(root); flush()`) is
 * identical on both, so only {@link init} branches on the backend type.
 */
/** Which ExoJS arm this adapter represents: today's default path, or the Slice-2 RetainedContainer spine. */
export type ExoJsAdapterConfig = 'current' | 'retained';

export const createExoJsAdapter = (backendFilter?: readonly Backend[], config: ExoJsAdapterConfig = 'current'): EngineAdapter => {
  const supported: readonly Backend[] = backendFilter ?? ['webgl2', 'webgpu'];

  let app: Application | null = null;
  let root: Container | null = null;
  let textures: Texture[] = [];
  /** Custom sprite materials built for the `mixed-material` archetype; empty for every other archetype. */
  let materials: SpriteMaterial[] = [];
  let mutableLeaves: MutableLeaf[] = [];
  /** Leaf indices the most recent buildScene selected for mutation — the source of {@link EngineAdapter.mutationSignature}. */
  let mutableIndices: number[] = [];
  /**
   * The `split-screen` archetype's simultaneous `View`s (`spec.viewCount`,
   * see `EngineAdapter.ts`). Empty for every other archetype, in which case
   * `renderFrame` falls back to the ordinary single-view render.
   */
  let views: View[] = [];

  return {
    engine: 'exojs',
    config,

    supports(backend: Backend): boolean {
      return supported.includes(backend);
    },

    async init(canvas: HTMLCanvasElement, backend: Backend): Promise<void> {
      if (!supported.includes(backend)) {
        throw new Error(`The exojs adapter was not configured for the '${backend}' backend.`);
      }

      const instance = new Application({
        canvas: { element: canvas, width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT, pixelRatio: 1 },
        // Pin the backend explicitly (never 'auto') so the harness measures the
        // backend the cell asked for, not whatever the environment prefers.
        backend: { type: backend },
        clearColor: Color.black,
        hello: false,
      });

      // Boot the full production init path (awaits the backend's async
      // initialize), then halt the engine's rAF loop so the harness drives
      // frames explicitly via `renderFrame`. No scene target: the harness owns
      // its own `root` container and renders it directly through
      // `app.rendering.render(root)`, so the director never needs a scene.
      await instance.start();
      instance.stop();

      app = instance;
    },

    buildScene(spec: ArchetypeSpec, nodeCount: number, seed: number): void {
      if (app === null) {
        throw new Error('buildScene was called before init.');
      }

      textures = [];

      for (let t = 0; t < spec.textureCount; t++) {
        textures.push(createDistinctTexture(t, spec.textureCount));
      }

      // State-churn dimensions (see `ArchetypeSpec.blendModeCount` /
      // `materialCount`). Absent on every pre-existing archetype, which then
      // keeps exactly the old behaviour: one blend mode, no materials.
      const blendModeCount = Math.max(1, Math.min(spec.blendModeCount ?? 1, CYCLED_BLEND_MODES.length));
      const blendRunLength = Math.max(1, spec.blendRunLength ?? 1);
      const materialCount = Math.max(0, spec.materialCount ?? 0);
      const materialRunLength = Math.max(1, spec.materialRunLength ?? 1);

      materials = [];

      for (let m = 0; m < materialCount; m++) {
        materials.push(createDistinctMaterial(m, materialCount));
      }

      // Nested-container spine whose depth equals `nestingDepth`; leaves are
      // distributed evenly across it (round-robin), so a deeper archetype pays
      // for deeper transform propagation. When `config === 'retained'` every
      // spine container is a `RetainedContainer`: on
      // static-heavy the whole spine retains; on dynamic-heavy
      // the wobbling leaves invalidate their spine groups every frame (an
      // honest measurement of the opt-in's cost when content churns).
      const createSpineContainer = (): Container => (config === 'retained' ? new RetainedContainer() : new Container());

      const sceneRoot = createSpineContainer();

      // `spec.cullingEnabled` is `false` for every archetype (see
      // `archetypes.ts` and `EngineAdapter.ts::cullingEnabled` for the
      // fairness rationale): the exojs render walk pays a real per-node
      // cost for this flag that the Pixi arm's identically-set flag does not,
      // so it stays off here to keep the arms cull-symmetric.
      sceneRoot.cullable = spec.cullingEnabled;

      const spine: Container[] = [sceneRoot];

      for (let depth = 1; depth < spec.nestingDepth; depth++) {
        const container = createSpineContainer();

        container.cullable = spec.cullingEnabled;
        spine[depth - 1]!.addChild(container);
        spine.push(container);
      }

      const columns = Math.max(1, Math.ceil(Math.sqrt(nodeCount)));
      const rows = Math.max(1, Math.ceil(nodeCount / columns));
      const cellWidth = (VIEWPORT_WIDTH - 2 * GRID_MARGIN) / columns;
      const cellHeight = (VIEWPORT_HEIGHT - 2 * GRID_MARGIN) / rows;
      const overdraw = spec.id === 'overdraw';

      // Canonical, shared mutation selection: draw one RNG value per leaf in
      // index order and select when below `mutationFraction`. Using the shared
      // `selectMutationIndices` (rather than re-inlining the draw here) is what
      // makes the cross-arm fairness contract a single asserted code path (B3);
      // `mutationSignature()` below reports the exact set the harness verifies.
      const selectedIndices = selectMutationIndices(nodeCount, spec.mutationFraction, seed);
      const selectedSet = new Set(selectedIndices);
      const leaves: MutableLeaf[] = [];

      for (let i = 0; i < nodeCount; i++) {
        // Index the texture by the sprite's position WITHIN its spine bucket,
        // not by the global index. Leaves are round-robined across the spine via
        // `i % spine.length`, so a global `i % textureCount` would alias with
        // that stride: every bucket would collect a single residue class of `i`
        // and hence only a `textureCount / gcd(...)` subset of textures — each
        // traversal stream could then see fewer distinct textures than the
        // multi-texture batcher's slot count (16 as of the F9 slot raise), so
        // batches might never break on texture and the batch-breaking archetype
        // (24 textures, depth-2 spine) would not break batches at all. Cycling
        // per bucket position makes each stream sweep all textures, overflowing
        // the slots as intended.
        const sprite = new Sprite(textures[Math.floor(i / spine.length) % textures.length]!);

        sprite.cullable = spec.cullingEnabled;

        // Blend-mode / material plateaus keyed on the GLOBAL leaf index, using
        // the same formula the Pixi arm uses, so both arms assign the identical
        // mode to the identical sprite and the resulting draw-call structure is
        // comparable. Left at the engine default when the archetype does not
        // set the dimension.
        if (blendModeCount > 1) {
          sprite.blendMode = CYCLED_BLEND_MODES[Math.floor(i / blendRunLength) % blendModeCount]!;
        }

        if (materials.length > 0) {
          sprite.material = materials[Math.floor(i / materialRunLength) % materials.length]!;
        }

        // `overdraw` stacks nodeCount full-viewport quads at the origin to
        // force genuine fill-bound behaviour; every other archetype lays
        // sprites out on a grid at their native (SPRITE_SIZE) size.
        //
        // Using the native SPRITE_SIZE (8x8px) here would mean nodeCount
        // stacked sprites cover only ~64px^2 of overlap — negligible fill
        // (25k x 64px ~= 1.6M writes) contributing no fill-rate signal.
        // Stretching to
        // the full viewport (anchor defaults to (0,0)/top-left, so the quad is
        // positioned at the origin rather than centred, to actually cover the
        // visible area rather than half of it) makes nodeCount the real fill
        // multiplier: nodeCount x VIEWPORT_WIDTH x VIEWPORT_HEIGHT overdraw.
        if (overdraw) {
          sprite.width = VIEWPORT_WIDTH;
          sprite.height = VIEWPORT_HEIGHT;
        }

        const x = overdraw ? 0 : GRID_MARGIN + (i % columns) * cellWidth + cellWidth / 2;
        const y = overdraw ? 0 : GRID_MARGIN + Math.floor(i / columns) * cellHeight + cellHeight / 2;

        sprite.setPosition(x, y);
        spine[i % spine.length]!.addChild(sprite);

        if (selectedSet.has(i)) {
          leaves.push({ sprite, baseX: x, baseY: y });
        }
      }

      root = sceneRoot;
      mutableLeaves = leaves;
      mutableIndices = selectedIndices;

      // `split-screen` archetype (see `ArchetypeSpec.viewCount`): render the
      // same retained subtree through several simultaneous `View`s instead of
      // the single default view. Every other archetype leaves `viewCount`
      // unset and keeps the ordinary single-view path in `renderFrame`.
      for (const view of views) {
        view.destroy();
      }

      views = spec.viewCount !== undefined && spec.viewCount > 1 ? buildViewGrid(spec.viewCount) : [];
    },

    mutationSignature(): string {
      return mutationSignature(mutableIndices);
    },

    mutate(frame: number): void {
      const phase = frame * WOBBLE_SPEED;
      const dx = Math.sin(phase) * WOBBLE_AMPLITUDE;
      const dy = Math.cos(phase) * WOBBLE_AMPLITUDE;

      for (const leaf of mutableLeaves) {
        leaf.sprite.setPosition(leaf.baseX + dx, leaf.baseY + dy);
      }
    },

    gpuDevice(): GPUDevice | null {
      if (app === null) {
        return null;
      }

      const backend = app.backend;

      // The backend exposes a live GPUDevice only when it is the WebGPU backend;
      // narrow via the backendType tag before reading `.device`.
      if (backend.backendType !== RenderBackendType.WebGpu) {
        return null;
      }

      return (backend as WebGpuBackend).device;
    },

    renderFrame(): void {
      if (app === null || root === null) {
        throw new Error('renderFrame was called before buildScene.');
      }

      const backend = app.backend;

      // Exactly the production render phase: reset the frame-scoped stats /
      // transform buffer, clear, render the tree once (or once per
      // `split-screen` view — see `buildScene`/`views`), flush the batch.
      backend.resetStats();
      backend.clear();

      if (views.length > 0) {
        // Multi-view replay: each additional view re-issues the retained
        // group's ALREADY-RECORDED instruction set with its own view/viewport,
        // not a fresh per-view scene walk — the property `split-screen` exists
        // to exercise (see the retained-containers guide).
        for (const view of views) {
          app.rendering.render(root, { view });
        }
      } else {
        app.rendering.render(root);
      }

      backend.flush();
    },

    teardown(): void {
      if (root !== null) {
        root.destroy();
        root = null;
      }

      for (const texture of textures) {
        texture.destroy();
      }

      for (const material of materials) {
        material.destroy();
      }

      for (const view of views) {
        view.destroy();
      }

      textures = [];
      materials = [];
      mutableLeaves = [];
      mutableIndices = [];
      views = [];

      if (app !== null) {
        app.destroy();
        app = null;
      }
    },
  };
};
