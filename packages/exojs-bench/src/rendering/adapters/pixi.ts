import { Application, Container, Culler, RendererType, Sprite, Texture, type WebGPURenderer } from 'pixi.js';

import { mutationSignature, selectMutationIndices } from '../../shared/mutation';
import type { ArchetypeSpec, Backend, EngineAdapter } from '../EngineAdapter';
import { cameraCenterAt, GRID_MARGIN, gridLayout, gridPosition, isScrolling, SPRITE_SIZE, VIEWPORT_HEIGHT, VIEWPORT_WIDTH, worldExtent } from '../world';

/**
 * Pixi.js v8 arm of the rendering benchmark - the direct renderer comparison and
 * the only other 2D library that ships WebGPU.
 *
 * This is a COMMITTED, official arm (pinned exact `pixi.js` devDependency). It
 * builds the byte-for-byte same
 * scene the ExoJS arm builds (`adapters/exojs.ts`) and mutates the identical leaf
 * set selected by the shared `selectMutationIndices`, exposing the result through
 * {@link EngineAdapter.mutationSignature} so the harness's cross-arm determinism
 * check asserts the two arms did the same work. The scene structure
 * (spine depth, round-robin leaf distribution, per-bucket texture cycling,
 * overdraw stacking, cullable flags) is a faithful transcription of the ExoJS
 * adapter so the arms are comparable on the same neutral archetypes.
 *
 * The harness owns frame cadence, so Pixi's own ticker is disabled (`autoStart`
 * false, `sharedTicker` false) and one frame is produced by a single explicit
 * `renderer.render(...)` - the same shape as the ExoJS adapter's one-call frame.
 */

/** Peak per-axis displacement applied to a mutated leaf; small enough to never cross the viewport edge. */
const WOBBLE_AMPLITUDE = 2;
/** Phase step per frame for the mutation wobble. */
const WOBBLE_SPEED = 0.15;

/**
 * Pixi blend-mode names matching, one-to-one and in the same order, the ExoJS
 * arm's `CYCLED_BLEND_MODES` (Normal / Additive / Multiply / Screen). All four
 * are fixed-function GPU blend equations on both engines, so a leaf assigned
 * index `k` costs each arm the same kind of state change.
 */
const CYCLED_BLEND_MODES = ['normal', 'add', 'multiply', 'screen'] as const;

/** A pre-selected leaf sprite and its resting grid position - the only nodes `mutate` disturbs. */
interface MutableLeaf {
  readonly sprite: Sprite;
  readonly baseX: number;
  readonly baseY: number;
}

/** Pixi renderer preference string for each harness backend. Pixi names WebGL2 simply `'webgl'`. */
const PREFERENCE: Record<Backend, 'webgl' | 'webgpu'> = {
  webgl2: 'webgl',
  webgpu: 'webgpu',
};

/** The `RendererType` bit Pixi reports for each harness backend, used to assert no silent fallback occurred. */
const EXPECTED_RENDERER_TYPE: Record<Backend, number> = {
  webgl2: RendererType.WEBGL,
  webgpu: RendererType.WEBGPU,
};

/**
 * Generate one of `total` visually distinct solid-colour textures from a small
 * canvas - the same construction the ExoJS arm uses, so the `batch-breaking`
 * archetype breaks batches on both arms for the same reason (distinct GPU binds).
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

  return Texture.from(canvas);
};

/**
 * Which Pixi arm this adapter represents.
 *
 * `default` is stock Pixi: it never culls, because Pixi culls only when the app
 * registers `CullerPlugin` (which hooks `Application.render`, a loop this
 * harness never runs) or calls `Culler.shared.cull(...)` itself. On an archetype
 * with off-screen content that arm therefore draws the whole world - Pixi's real
 * out-of-the-box behaviour, and the honest upper bound.
 *
 * `culled` is the same arm plus the explicit per-frame cull call, i.e. what a
 * Pixi app that wants culling actually writes. It is measured only on
 * archetypes with genuine off-screen content (see `coversArchetype` below);
 * everywhere else the call could only ever be overhead over an unchanged
 * visible set.
 */
export type PixiAdapterConfig = 'default' | 'culled';

export const createPixiAdapter = (config: PixiAdapterConfig = 'default'): EngineAdapter => {
  let app: Application | null = null;
  let backend: Backend | null = null;
  let root: Container | null = null;
  let textures: Texture[] = [];
  let mutableLeaves: MutableLeaf[] = [];
  /** Leaf indices the most recent buildScene selected for mutation - the source of {@link EngineAdapter.mutationSignature}. */
  let mutableIndices: number[] = [];
  /**
   * The archetype currently built, when it scrolls a camera; `null` otherwise.
   * Pixi has no camera object, so the idiomatic equivalent - and what this arm
   * does - is to translate the world container under a fixed screen rect. Same
   * visible content per frame as the ExoJS arm's view move; different mechanism,
   * disclosed in the report's Methodology.
   */
  let scrollingSpec: ArchetypeSpec | null = null;

  return {
    engine: 'pixi',
    config,

    supports(target: Backend): boolean {
      return target === 'webgl2' || target === 'webgpu';
    },

    coversArchetype(spec: ArchetypeSpec): boolean {
      // The stock arm runs everywhere; the culled variant only where culling can
      // actually remove something.
      return config === 'default' || spec.cullingEnabled;
    },

    async init(canvas: HTMLCanvasElement, target: Backend): Promise<void> {
      const instance = new Application();

      await instance.init({
        canvas,
        width: VIEWPORT_WIDTH,
        height: VIEWPORT_HEIGHT,
        resolution: 1,
        autoDensity: false,
        // Pin the backend explicitly (never an array/auto) so the cell measures
        // the backend it asked for. Pixi silently FALLS BACK to WebGL if WebGPU
        // is unavailable, so the render-type assertion below turns that into a
        // loud failure (an honest `unavailable` cell) rather than a WebGL number
        // masquerading as WebGPU.
        preference: PREFERENCE[target],
        powerPreference: 'high-performance',
        backgroundColor: 0x000000,
        antialias: false,
        // The harness drives frames explicitly - never let Pixi start its own
        // requestAnimationFrame render loop.
        autoStart: false,
        sharedTicker: false,
        hello: false,
      });

      if (instance.renderer.type !== EXPECTED_RENDERER_TYPE[target]) {
        const actual = instance.renderer.type;

        // `removeView: false` - the harness owns the shared `#stage` canvas and
        // reuses it across every cell; Pixi must never detach it from the DOM.
        instance.destroy({ removeView: false }, { children: true, texture: true });

        throw new Error(`Pixi did not honour the '${target}' backend: renderer.type=${actual} (expected ${EXPECTED_RENDERER_TYPE[target]}); refusing to measure a mismatched backend.`);
      }

      app = instance;
      backend = target;
    },

    buildScene(spec: ArchetypeSpec, nodeCount: number, seed: number): void {
      if (app === null) {
        throw new Error('buildScene was called before init.');
      }

      textures = [];

      for (let t = 0; t < spec.textureCount; t++) {
        textures.push(createDistinctTexture(t, spec.textureCount));
      }

      // Nested-container spine of depth `nestingDepth`, exactly as the ExoJS arm
      // builds it. Pixi has no separate retained/immediate tier here, so this one
      // arm is the whole Pixi comparison; the spine still exercises deep transform
      // propagation identically for a fair per-node cost.
      const sceneRoot = new Container();

      // `spec.cullingEnabled` is `false` for every fully-visible archetype (see
      // `archetypes.ts` for the fairness rationale). On the `default` arm the
      // flag is inert either way - Pixi acts on `.cullable` only when something
      // calls `Culler.shared.cull(...)`, which that arm never does - and it is
      // kept in sync with the ExoJS arm purely so both scenes stay a
      // byte-for-byte transcription of each other. On the `culled` arm it is
      // load-bearing: it is exactly the flag the per-frame cull in `renderFrame`
      // reads.
      sceneRoot.cullable = spec.cullingEnabled;

      const spine: Container[] = [sceneRoot];

      for (let depth = 1; depth < spec.nestingDepth; depth++) {
        const container = new Container();

        container.cullable = spec.cullingEnabled;
        spine[depth - 1]!.addChild(container);
        spine.push(container);
      }

      // World extent and grid come from the SAME shared helpers the ExoJS arm
      // uses (`world.ts`), so a scrolling archetype places the identical leaf at
      // the identical world position on both arms - the layout counterpart of
      // the shared mutation selection below.
      const world = worldExtent(spec, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
      const layout = gridLayout(nodeCount, world.width, world.height, GRID_MARGIN);
      const overdraw = spec.id === 'overdraw';

      // Shared, canonical mutation selection - the SAME helper the ExoJS arm
      // routes through, so both arms select the byte-for-byte identical index set
      // and the harness's cross-arm determinism assertion holds.
      // Blend-mode plateaus, computed by the SAME formula as the ExoJS arm
      // (`adapters/exojs.ts`), so both arms hand the identical mode to the
      // identical leaf index. `spec.materialCount` is deliberately IGNORED here:
      // Pixi 8 has no per-Sprite custom-shader API, so the `mixed-material`
      // archetype renders on this arm as plain `mixed-blend` - disclosed in
      // `ArchetypeSpec.materialCount` and in the report's Methodology, never
      // presented as a like-for-like row.
      const blendModeCount = Math.max(1, Math.min(spec.blendModeCount ?? 1, CYCLED_BLEND_MODES.length));
      const blendRunLength = Math.max(1, spec.blendRunLength ?? 1);

      const selectedIndices = selectMutationIndices(nodeCount, spec.mutationFraction, seed);
      const selectedSet = new Set(selectedIndices);
      const leaves: MutableLeaf[] = [];

      for (let i = 0; i < nodeCount; i++) {
        // Texture indexed by position WITHIN the spine bucket, not the global
        // index - identical to the ExoJS arm, so the batch-breaking archetype
        // overflows the batcher's texture slots the same way on both arms.
        const sprite = new Sprite(textures[Math.floor(i / spine.length) % textures.length]!);

        sprite.cullable = spec.cullingEnabled;

        if (blendModeCount > 1) {
          sprite.blendMode = CYCLED_BLEND_MODES[Math.floor(i / blendRunLength) % blendModeCount]!;
        }

        // `overdraw` stacks nodeCount full-viewport quads at the origin (anchor
        // defaults to (0,0)/top-left on both engines) for genuine fill-bound
        // behaviour; every other archetype lays sprites out on a grid at their
        // native SPRITE_SIZE.
        if (overdraw) {
          sprite.width = VIEWPORT_WIDTH;
          sprite.height = VIEWPORT_HEIGHT;
        }

        const cell = gridPosition(i, layout, GRID_MARGIN);
        const x = overdraw ? 0 : cell.x;
        const y = overdraw ? 0 : cell.y;

        sprite.position.set(x, y);
        spine[i % spine.length]!.addChild(sprite);

        if (selectedSet.has(i)) {
          leaves.push({ sprite, baseX: x, baseY: y });
        }
      }

      root = sceneRoot;
      mutableLeaves = leaves;
      mutableIndices = selectedIndices;
      scrollingSpec = isScrolling(spec) ? spec : null;

      // Park the world on the frame-0 camera centre, so the first warmup frame
      // already shows what the timed run will see.
      const start = cameraCenterAt(spec, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

      sceneRoot.position.set(VIEWPORT_WIDTH / 2 - start.x, VIEWPORT_HEIGHT / 2 - start.y);
    },

    mutationSignature(): string {
      return mutationSignature(mutableIndices);
    },

    mutate(frame: number): void {
      if (scrollingSpec !== null && root !== null) {
        const centre = cameraCenterAt(scrollingSpec, frame, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

        root.position.set(VIEWPORT_WIDTH / 2 - centre.x, VIEWPORT_HEIGHT / 2 - centre.y);
      }

      const phase = frame * WOBBLE_SPEED;
      const dx = Math.sin(phase) * WOBBLE_AMPLITUDE;
      const dy = Math.cos(phase) * WOBBLE_AMPLITUDE;

      for (const leaf of mutableLeaves) {
        leaf.sprite.position.set(leaf.baseX + dx, leaf.baseY + dy);
      }
    },

    gpuDevice(): GPUDevice | null {
      if (app === null || backend !== 'webgpu') {
        return null;
      }

      // Pixi v8's WebGPU renderer exposes the live GPU object (adapter + device)
      // as `renderer.gpu`; `renderer.gpu.device` is the `GPUDevice` the harness
      // attaches its structural probe and submit→done timer to. This is what
      // fixes the "webgpu backend did not expose a GPUDevice" probe blocker for
      // the Pixi arm.
      const renderer = app.renderer as WebGPURenderer;

      return renderer.gpu?.device ?? null;
    },

    renderFrame(): void {
      if (app === null || root === null) {
        throw new Error('renderFrame was called before buildScene.');
      }

      // The `culled` arm's per-frame cull, the analogue of what `CullerPlugin`
      // would do if this harness ran Pixi's Application loop. `skipUpdateTransform`
      // is passed FALSE (the plugin's default is true) because the camera moved
      // in `mutate` since the last render: with stale world transforms the cull
      // would test this frame's screen rect against last frame's bounds and
      // decide the boundary row wrong. Pixi's own documented example for a
      // moving scene passes false for the same reason.
      if (config === 'culled') {
        Culler.shared.cull(root, app.renderer.screen, false);
      }

      // One explicit frame: clear + render the tree + submit, the analogue of the
      // ExoJS adapter's resetStats/clear/render/flush sequence.
      app.renderer.render({ container: root, clear: true });
    },

    teardown(): void {
      if (root !== null) {
        root.destroy({ children: true });
        root = null;
      }

      for (const texture of textures) {
        texture.destroy(true);
      }

      textures = [];
      mutableLeaves = [];
      mutableIndices = [];
      scrollingSpec = null;

      if (app !== null) {
        // `removeView: false` - keep the shared `#stage` canvas in the DOM for
        // the next cell; `destroy(true, ...)` would detach it and every later cell
        // would fail with "#stage not found".
        app.destroy({ removeView: false }, { children: true, texture: true });
        app = null;
      }

      backend = null;
    },
  };
};
