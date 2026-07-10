import { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Scene } from '#core/Scene';
import { Container } from '#rendering/Container';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';

import { createRng } from '../archetypes';
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
 * WebGL2 only for now; WebGPU support arrives in a later task.
 */
export const createExoJsAdapter = (backendFilter?: readonly Backend[]): EngineAdapter => {
  const supported: readonly Backend[] = backendFilter ?? ['webgl2'];

  let app: Application | null = null;
  let root: Container | null = null;
  let textures: Texture[] = [];
  let mutableLeaves: MutableLeaf[] = [];

  return {
    engine: 'exojs',
    config: 'current',

    supports(backend: Backend): boolean {
      return backend === 'webgl2' && supported.includes(backend);
    },

    async init(canvas: HTMLCanvasElement, backend: Backend): Promise<void> {
      if (backend !== 'webgl2') {
        throw new Error(`The exojs adapter supports the 'webgl2' backend only (got '${backend}').`);
      }

      const instance = new Application({
        canvas: { element: canvas, width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT, pixelRatio: 1 },
        backend: { type: 'webgl2' },
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
      // for deeper transform propagation.
      const sceneRoot = new Container();

      sceneRoot.cullable = spec.cullingEnabled;

      const spine: Container[] = [sceneRoot];

      for (let depth = 1; depth < spec.nestingDepth; depth++) {
        const container = new Container();

        container.cullable = spec.cullingEnabled;
        spine[depth - 1]!.addChild(container);
        spine.push(container);
      }

      const columns = Math.max(1, Math.ceil(Math.sqrt(nodeCount)));
      const rows = Math.max(1, Math.ceil(nodeCount / columns));
      const cellWidth = (VIEWPORT_WIDTH - 2 * GRID_MARGIN) / columns;
      const cellHeight = (VIEWPORT_HEIGHT - 2 * GRID_MARGIN) / rows;
      const overdraw = spec.id === 'overdraw';

      const rng = createRng(seed);
      const leaves: MutableLeaf[] = [];

      for (let i = 0; i < nodeCount; i++) {
        const sprite = new Sprite(textures[i % textures.length]!);

        sprite.cullable = spec.cullingEnabled;

        // `overdraw` stacks every sprite at the centre to force fill-bound
        // behaviour; every other archetype lays them out on a grid.
        const x = overdraw ? VIEWPORT_WIDTH / 2 : GRID_MARGIN + (i % columns) * cellWidth + cellWidth / 2;
        const y = overdraw ? VIEWPORT_HEIGHT / 2 : GRID_MARGIN + Math.floor(i / columns) * cellHeight + cellHeight / 2;

        sprite.setPosition(x, y);
        spine[i % spine.length]!.addChild(sprite);

        // Draw one RNG value per leaf, in index order, so any adapter seeded
        // the same way selects the exact same mutation set.
        if (spec.mutationFraction > 0 && rng() < spec.mutationFraction) {
          leaves.push({ sprite, baseX: x, baseY: y });
        }
      }

      root = sceneRoot;
      mutableLeaves = leaves;
    },

    mutate(frame: number): void {
      const phase = frame * WOBBLE_SPEED;
      const dx = Math.sin(phase) * WOBBLE_AMPLITUDE;
      const dy = Math.cos(phase) * WOBBLE_AMPLITUDE;

      for (const leaf of mutableLeaves) {
        leaf.sprite.setPosition(leaf.baseX + dx, leaf.baseY + dy);
      }
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

      if (app !== null) {
        app.destroy();
        app = null;
      }
    },
  };
};
