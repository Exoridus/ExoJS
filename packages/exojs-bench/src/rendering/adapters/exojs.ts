import { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Scene } from '#core/Scene';
import { Container } from '#rendering/Container';
import { RenderBackendType } from '#rendering/RenderBackendType';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
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
  let mutableLeaves: MutableLeaf[] = [];
  /** Leaf indices the most recent buildScene selected for mutation — the source of {@link EngineAdapter.mutationSignature}. */
  let mutableIndices: number[] = [];

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
      // frames explicitly via `renderFrame`.
      await instance.start(new Scene());
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

      // Nested-container spine whose depth equals `nestingDepth`; leaves are
      // distributed evenly across it (round-robin), so a deeper archetype pays
      // for deeper transform propagation. When `config === 'retained'` every
      // spine container is a `RetainedContainer` (Track B Slice 2): on
      // static-heavy the whole spine retains (spec §10(a)); on dynamic-heavy
      // the wobbling leaves invalidate their spine groups every frame (the
      // honest §10(c) measurement of the opt-in's cost when content churns).
      const createSpineContainer = (): Container => (config === 'retained' ? new RetainedContainer() : new Container());

      const sceneRoot = createSpineContainer();

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

        // `overdraw` stacks nodeCount full-viewport quads at the origin to
        // force genuine fill-bound behaviour; every other archetype lays
        // sprites out on a grid at their native (SPRITE_SIZE) size.
        //
        // Review B6: previously every archetype (including `overdraw`) used
        // the native SPRITE_SIZE (8x8px), so nodeCount stacked sprites covered
        // ~64px^2 of overlap — negligible fill (25k x 64px ~= 1.6M writes),
        // never analyzed, and contributing no fill-rate signal. Stretching to
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
      // transform buffer, clear, render the tree once, flush the batch.
      backend.resetStats();
      backend.clear();
      app.rendering.render(root);
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

      textures = [];
      mutableLeaves = [];
      mutableIndices = [];

      if (app !== null) {
        app.destroy();
        app = null;
      }
    },
  };
};
