import * as ex from 'excalibur';

import { mutationSignature, selectMutationIndices } from '../../shared/mutation';
import type { ArchetypeSpec, Backend, EngineAdapter } from '../EngineAdapter';

/**
 * Excalibur 0.32 arm of the rendering benchmark.
 *
 * Builds the byte-for-byte same scene the ExoJS and Pixi arms build
 * (`adapters/exojs.ts`, `adapters/pixi.ts`) and mutates the identical leaf set
 * selected by the shared `selectMutationIndices`, exposing the result through
 * {@link EngineAdapter.mutationSignature} so the harness's cross-arm determinism
 * check (review B3) asserts every arm did the same work. The scene structure
 * (nested spine of transform-only actors, round-robin leaf distribution,
 * per-bucket texture cycling, overdraw stacking, top-left anchoring) is a
 * faithful transcription of the other arms.
 *
 * Excalibur's `ExcaliburGraphicsContextWebGL` renders through a real WebGL2
 * context, so the harness's WebGL2 structural probe and GPU timer attach exactly
 * as they do for the ExoJS/Pixi WebGL2 arms — this arm reports full draw-call
 * structure. Excalibur ships no WebGPU renderer, so it does not support the
 * `'webgpu'` backend.
 *
 * The harness owns frame cadence, so Excalibur's own game loop is halted right
 * after boot (`engine.clock.stop()`), and one frame is produced by replicating
 * exactly what the engine's private per-frame draw does, using only public API:
 * `beginDrawLifecycle → clear → _predraw → currentScene.draw → _postdraw → flush
 * → endDrawLifecycle`. Only the DRAW half runs; the update systems (motion,
 * collision, the off-screen culling tagger) are never stepped, so only
 * Excalibur's render path is measured and no off-screen culling is applied
 * (matching `cullingEnabled: false` on every archetype — review C4 / #326).
 */

/** Fixed design-space viewport the harness canvas renders (see `page/index.html`). Identical to the ExoJS/Pixi arms. */
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
/** Constant elapsed-ms handed to the draw path each frame (the harness, not this value, owns timing). */
const FRAME_ELAPSED_MS = 16;

/** A pre-selected leaf actor and its resting grid position — the only nodes `mutate` disturbs. */
interface MutableLeaf {
  readonly actor: ex.Actor;
  readonly baseX: number;
  readonly baseY: number;
}

/**
 * Generate one of `total` visually distinct solid-colour 8x8 textures from a
 * canvas — the same construction the ExoJS/Pixi arms use, so the
 * `batch-breaking` archetype breaks batches on every arm for the same reason
 * (distinct GPU texture identities).
 *
 * The canvas is wrapped as an already-loaded {@link ex.ImageSource} via
 * `fromHtmlImageElement`, which resolves synchronously and uses the element
 * directly as the `texImage2D` source (a canvas is a valid source). This keeps
 * `buildScene` synchronous and per-archetype-faithful, unlike
 * `fromHtmlCanvasElement`, whose `canvas.toBlob` round-trip loads
 * asynchronously and would leave the first rendered frames untextured.
 */
const createDistinctImage = (index: number, total: number): ex.ImageSource => {
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

  return ex.ImageSource.fromHtmlImageElement(canvas as unknown as HTMLImageElement);
};

export const createExcaliburAdapter = (): EngineAdapter => {
  let engine: ex.Engine | null = null;
  let root: ex.Actor | null = null;
  let images: ex.ImageSource[] = [];
  let mutableLeaves: MutableLeaf[] = [];
  /** Leaf indices the most recent buildScene selected for mutation — the source of {@link EngineAdapter.mutationSignature}. */
  let mutableIndices: number[] = [];
  /** Shared top-left anchor reused by every actor (read-only during draw; never mutated) to avoid per-node allocation. */
  const topLeftAnchor = new ex.Vector(0, 0);
  /** Reusable scratch vector for the per-frame mutation, so `mutate` allocates nothing (matching the ExoJS/Pixi arms). */
  const scratch = new ex.Vector(0, 0);

  return {
    engine: 'excalibur',
    config: 'default',

    supports(target: Backend): boolean {
      // Excalibur 0.32 renders WebGL2 only; it ships no WebGPU renderer.
      return target === 'webgl2';
    },

    async init(canvas: HTMLCanvasElement, target: Backend): Promise<void> {
      if (target !== 'webgl2') {
        throw new Error(`The excalibur adapter only supports the 'webgl2' backend; got '${target}'.`);
      }

      const instance = new ex.Engine({
        canvasElement: canvas,
        width: VIEWPORT_WIDTH,
        height: VIEWPORT_HEIGHT,
        // Disable every subsystem not under test / that would block a headless
        // start: no play-button gate, no boot log, no HiDPI rescaling of the
        // fixed 1280x720 canvas, no context menu.
        suppressPlayButton: true,
        suppressConsoleBootMessage: true,
        suppressHiDPIScaling: true,
        enableCanvasContextMenu: false,
        antialiasing: false,
        powerPreference: 'high-performance',
        backgroundColor: ex.Color.Black,
        // Physics is not under test; disable it outright (its systems are update
        // systems that this arm never steps anyway).
        physics: false,
      });

      // `start()` boots the engine and initialises the default scene (its draw
      // systems and the WebGL2 context). It briefly runs the StandardClock while
      // the (empty) loader completes; halt that clock immediately afterwards so
      // the harness — not Excalibur — drives every subsequent frame.
      await instance.start();
      instance.clock.stop();

      engine = instance;
    },

    buildScene(spec: ArchetypeSpec, nodeCount: number, seed: number): void {
      if (engine === null) {
        throw new Error('buildScene was called before init.');
      }

      images = [];

      for (let t = 0; t < spec.textureCount; t++) {
        images.push(createDistinctImage(t, spec.textureCount));
      }

      // Nested spine of transform-only actors whose depth equals `nestingDepth`;
      // leaves are round-robined across it, so a deeper archetype pays for deeper
      // transform propagation (each leaf's global transform walks its ancestors).
      const sceneRoot = new ex.Actor({ pos: new ex.Vector(0, 0), anchor: topLeftAnchor });
      const spine: ex.Actor[] = [sceneRoot];

      for (let depth = 1; depth < spec.nestingDepth; depth++) {
        const container = new ex.Actor({ pos: new ex.Vector(0, 0), anchor: topLeftAnchor });

        spine[depth - 1]!.addChild(container);
        spine.push(container);
      }

      const columns = Math.max(1, Math.ceil(Math.sqrt(nodeCount)));
      const rows = Math.max(1, Math.ceil(nodeCount / columns));
      const cellWidth = (VIEWPORT_WIDTH - 2 * GRID_MARGIN) / columns;
      const cellHeight = (VIEWPORT_HEIGHT - 2 * GRID_MARGIN) / rows;
      const overdraw = spec.id === 'overdraw';

      // Shared, canonical mutation selection — the SAME helper every arm routes
      // through, so all arms select the byte-for-byte identical index set and the
      // harness's cross-arm determinism assertion holds (review B3).
      const selectedIndices = selectMutationIndices(nodeCount, spec.mutationFraction, seed);
      const selectedSet = new Set(selectedIndices);
      const leaves: MutableLeaf[] = [];

      for (let i = 0; i < nodeCount; i++) {
        // Texture indexed by position WITHIN the spine bucket, not the global
        // index — identical to the other arms, so the batch-breaking archetype
        // overflows the batcher's texture slots the same way everywhere. Each
        // leaf gets its own Sprite graphic sharing the ImageSource/GPU texture.
        //
        // Explicit sourceView + destSize: `ImageSource.width`/`height` derive
        // from `naturalWidth`/`naturalHeight`, which a canvas element lacks
        // (they read undefined), so a Sprite left to infer its size from the
        // image would collapse to a zero-size, un-drawn quad. Stating the 8x8
        // source region and destination size explicitly makes the sprite draw at
        // its native SPRITE_SIZE; the GPU texture is still uploaded from the
        // canvas directly (a valid `texImage2D` source).
        const sprite = images[Math.floor(i / spine.length) % images.length]!.toSprite({
          sourceView: { x: 0, y: 0, width: SPRITE_SIZE, height: SPRITE_SIZE },
          destSize: { width: SPRITE_SIZE, height: SPRITE_SIZE },
        });

        // `overdraw` stacks nodeCount full-viewport quads at the origin for
        // genuine fill-bound behaviour (top-left anchored, so the quad covers the
        // whole viewport rather than being centred); every other archetype keeps
        // sprites at their native SPRITE_SIZE.
        if (overdraw) {
          sprite.destSize = { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT };
        }

        const x = overdraw ? 0 : GRID_MARGIN + (i % columns) * cellWidth + cellWidth / 2;
        const y = overdraw ? 0 : GRID_MARGIN + Math.floor(i / columns) * cellHeight + cellHeight / 2;

        const actor = new ex.Actor({ pos: new ex.Vector(x, y), anchor: topLeftAnchor });

        actor.graphics.use(sprite);
        spine[i % spine.length]!.addChild(actor);

        if (selectedSet.has(i)) {
          leaves.push({ actor, baseX: x, baseY: y });
        }
      }

      // Add the spine root to the current scene; the entity manager recursively
      // adds every descendant to the world, so the GraphicsSystem draws them all.
      engine.currentScene.add(sceneRoot);

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
        scratch.x = leaf.baseX + dx;
        scratch.y = leaf.baseY + dy;
        // Assigning `pos` copies x/y into the actor's watched position vector,
        // flagging its transform dirty — the same in-place update the ExoJS/Pixi
        // arms do via `setPosition`, with no per-leaf allocation.
        leaf.actor.pos = scratch;
      }
    },

    gpuDevice(): GPUDevice | null {
      // WebGL2 only; the harness recovers the WebGL2 context from the canvas.
      return null;
    },

    renderFrame(): void {
      if (engine === null || root === null) {
        throw new Error('renderFrame was called before buildScene.');
      }

      // One explicit frame: the exact sequence Excalibur's private per-frame draw
      // runs, reconstructed from public API. Only the draw path executes — the
      // update systems (motion, collision, off-screen culling) are never stepped.
      const context = engine.graphicsContext;

      context.backgroundColor = engine.currentScene.backgroundColor ?? engine.backgroundColor;
      context.beginDrawLifecycle();
      context.clear();
      engine._predraw(context, FRAME_ELAPSED_MS);
      engine.currentScene.draw(context, FRAME_ELAPSED_MS);
      engine._postdraw(context, FRAME_ELAPSED_MS);
      context.flush();
      context.endDrawLifecycle();
    },

    teardown(): void {
      if (engine !== null) {
        // `dispose` tears the whole engine down — scene graph, systems and the
        // WebGL2 context. A fresh engine + canvas is created for the next cell,
        // so nothing here needs to survive.
        engine.dispose();
        engine = null;
      }

      root = null;
      images = [];
      mutableLeaves = [];
      mutableIndices = [];
    },
  };
};
