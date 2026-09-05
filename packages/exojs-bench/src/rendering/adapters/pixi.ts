import {
  Application,
  BitmapText,
  BlurFilter,
  ColorMatrixFilter,
  Container,
  Culler,
  type Filter,
  Graphics,
  RendererType,
  RenderTexture,
  Sprite,
  Texture,
  type WebGPURenderer,
} from 'pixi.js';

import { mutationSignature, selectMutationIndices, wobbleOffsetAt } from '../../shared/mutation';
import type { ArchetypeSpec, Backend, EngineAdapter } from '../EngineAdapter';
import { createDistinctTextureCanvas, TEXT_FONT_SIZE } from '../sceneAssets';
import { compositeBlurRadius, filterChainDepth, isChurning, isTextArchetype, isTextUpdating, maskDepth, textForLeaf } from '../traits';
import {
  BLOOM_DOWNSCALE,
  cameraCenterAt,
  GRID_MARGIN,
  gridLayout,
  gridPosition,
  isScrolling,
  maskRect,
  VIEWPORT_HEIGHT,
  VIEWPORT_WIDTH,
  worldExtent,
} from '../world';

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

/**
 * Pixi blend-mode names matching, one-to-one and in the same order, the ExoJS
 * arm's `CYCLED_BLEND_MODES` (Normal / Additive / Multiply / Screen). All four
 * are fixed-function GPU blend equations on both engines, so a leaf assigned
 * index `k` costs each arm the same kind of state change.
 */
const CYCLED_BLEND_MODES = ['normal', 'add', 'multiply', 'screen'] as const;

/**
 * A pre-selected leaf and its resting grid position - the only nodes `mutate`
 * disturbs. `node` is mutable because the churn archetype replaces it every
 * frame; `parent` and `index` are what the replacement needs to land in the
 * identical place with the identical content.
 */
interface MutableLeaf {
  node: Sprite | BitmapText;
  readonly parent: Container;
  readonly index: number;
  readonly baseX: number;
  readonly baseY: number;
}

/**
 * Text leaf for the text archetypes.
 *
 * {@link BitmapText}, not `Text`, and this is the load-bearing choice of the text
 * rows. Pixi's `Text` rasterizes each node's whole string into its OWN canvas
 * texture, so a text scene there is N textures and N uploads - a different cost
 * class from a glyph-atlas renderer, and one no glyph-atlas engine can be
 * compared against. `BitmapText` is Pixi's glyph-atlas path (a dynamically
 * generated bitmap font, one atlas, per-glyph quads), which is the architectural
 * counterpart of the ExoJS SDF text node and of Phaser's and Excalibur's atlas
 * text. The report's Methodology states this, and states that a Pixi app written
 * with `Text` instead pays the per-node-texture cost these rows do not measure.
 */
const createTextLeaf = (index: number, glyphs: number): BitmapText =>
  new BitmapText({ text: textForLeaf(index, glyphs), style: { fontFamily: 'Arial', fontSize: TEXT_FONT_SIZE, fill: 0xffffff } });

/**
 * One link of a filter chain: a colour matrix at a near-identity saturation, so
 * each link is one full-target pass with trivial fragment work. Mirrors the ExoJS
 * arm's chain link exactly, including the per-link saturation offset that stops
 * either engine collapsing the chain by recognising two identical filters.
 */
const createChainFilter = (link: number): Filter => {
  const filter = new ColorMatrixFilter();

  filter.saturate(1 + link * 0.05, false);

  return filter;
};

/**
 * One nesting level of the mask stack: an axis-aligned rectangle, drawn as
 * {@link Graphics} because that is the only rect-mask source Pixi accepts.
 *
 * MECHANISM DISCLOSURE: this is not the same GPU mechanism the ExoJS arm uses.
 * ExoJS accepts a bare `Rectangle` mask and implements it as a clip/scissor rect;
 * Pixi routes a `Graphics` mask through its stencil pipe. Both are the idiomatic
 * axis-aligned rect mask of their engine - a Pixi app has no scissor mask to
 * write - so the row compares what each library actually offers, and the
 * mechanism difference is stated in the report rather than resolved by making one
 * arm write unidiomatic code.
 */
const createMaskRect = (level: number, depth: number): Graphics => {
  const rect = maskRect(level, depth, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

  return new Graphics().rect(rect.x, rect.y, rect.width, rect.height).fill(0xffffff);
};

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
const createDistinctTexture = (index: number, total: number): Texture => Texture.from(createDistinctTextureCanvas(index, total));

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
  /** Rebuilds the leaf at a global index exactly as `buildScene` built it; non-null only for a churning archetype. */
  let rebuildLeaf: ((index: number) => Sprite | BitmapText) | null = null;
  /** Per-frame mutation mode of the built archetype; see `traits.ts`. */
  let churning = false;
  let textUpdating = false;
  /** Characters per text leaf of the built archetype; `0` when it has no text. */
  let textGlyphs = 0;
  /**
   * The `composite` archetype's bloom stack; `null` for every single-pass
   * archetype, in which case `renderFrame` takes the ordinary one-render path.
   * Hand-rolled out of `RenderTexture` + `renderer.render({ target })` + a
   * filtered source sprite, which is what a Pixi app writes: Pixi has no
   * pipeline object to declare a multipass with.
   */
  let bloom: { readonly capture: RenderTexture; readonly blurred: RenderTexture; readonly source: Sprite; readonly overlay: Sprite } | null = null;

  /** Drop the bloom stack so a rebuild (or teardown) leaks no GPU resources. */
  const releaseBloom = (): void => {
    if (bloom === null) {
      return;
    }

    // `destroy(true)` on the sprites would take the render textures with them,
    // so the textures are released explicitly and the sprites are not allowed to.
    bloom.source.destroy();
    bloom.overlay.destroy();
    bloom.capture.destroy(true);
    bloom.blurred.destroy(true);
    bloom = null;
  };

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

        throw new Error(
          `Pixi did not honour the '${target}' backend: renderer.type=${actual} (expected ${EXPECTED_RENDERER_TYPE[target]}); refusing to measure a mismatched backend.`,
        );
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

      textGlyphs = isTextArchetype(spec) ? Math.max(1, Math.trunc(spec.textGlyphsPerNode ?? 0)) : 0;
      churning = isChurning(spec);
      textUpdating = isTextUpdating(spec);

      /** Resting grid position of leaf `index`, from the shared layout helpers. */
      const leafPosition = (index: number): { x: number; y: number } => (overdraw ? { x: 0, y: 0 } : gridPosition(index, layout, GRID_MARGIN));

      /**
       * Build (but do not parent) the leaf at global index `index`. Extracted for
       * the same reason the ExoJS arm extracts it: the churn archetype has to
       * reproduce a leaf mid-run, and a second construction site is how the
       * replacement ends up differing from the leaf it replaces.
       */
      const makeLeaf = (index: number): Sprite | BitmapText => {
        const i = index;

        if (textGlyphs > 0) {
          const label = createTextLeaf(i, textGlyphs);
          const { x, y } = leafPosition(i);

          label.cullable = spec.cullingEnabled;
          label.position.set(x, y);

          return label;
        }

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

        const { x, y } = leafPosition(i);

        sprite.position.set(x, y);

        return sprite;
      };

      for (let i = 0; i < nodeCount; i++) {
        const leaf = makeLeaf(i);
        const parent = spine[i % spine.length]!;

        parent.addChild(leaf);

        if (selectedSet.has(i)) {
          const { x, y } = leafPosition(i);

          leaves.push({ node: leaf, parent, index: i, baseX: x, baseY: y });
        }
      }

      rebuildLeaf = churning ? makeLeaf : null;

      // Filter chain on the scene ROOT, mirroring the ExoJS arm: one chain over
      // the whole scene, so its depth is the measured axis.
      const chainDepth = filterChainDepth(spec);

      if (chainDepth > 0) {
        const chain: Filter[] = [];

        for (let link = 0; link < chainDepth; link++) {
          chain.push(createChainFilter(link));
        }

        sceneRoot.filters = chain;
      }

      // Nested rect masks, one per spine level, from the shared rect ladder. Each
      // source is a child of the scene root, so the root's own
      // `destroy({ children: true })` in `teardown` releases it with the scene.
      //
      // The scene ROOT stays unmasked and hosts every mask source: a Pixi mask
      // source must sit in the display tree to reach the stencil buffer, and a
      // source parented under the container it masks would be clipped by the
      // very mask it provides. Masking therefore starts one level down, which is
      // why `mask-clip` declares a nesting depth one greater than its mask depth.
      const maskLevels = Math.min(maskDepth(spec), spine.length - 1);

      for (let level = 0; level < maskLevels; level++) {
        const source = createMaskRect(level, maskLevels);

        sceneRoot.addChild(source);
        spine[level + 1]!.mask = source;
      }

      // Bloom-shaped multipass, hand-rolled the way a Pixi app writes one: a
      // full-size capture target, a half-size blur target, a source sprite of the
      // capture carrying the blur filter and scaled to the smaller target (Pixi
      // renders 1:1 into a target, so the scale IS the downsample), and an
      // additive overlay sprite of the blurred result stretched back to the
      // viewport. `renderFrame` drives the four passes explicitly.
      releaseBloom();

      const bloomRadius = compositeBlurRadius(spec);

      if (bloomRadius > 0) {
        const capture = RenderTexture.create({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
        const blurred = RenderTexture.create({
          width: Math.round(VIEWPORT_WIDTH * BLOOM_DOWNSCALE),
          height: Math.round(VIEWPORT_HEIGHT * BLOOM_DOWNSCALE),
        });
        const source = new Sprite(capture);
        const overlay = new Sprite(blurred);

        source.scale.set(BLOOM_DOWNSCALE);
        source.filters = [new BlurFilter({ strength: bloomRadius, quality: 2 })];
        overlay.width = VIEWPORT_WIDTH;
        overlay.height = VIEWPORT_HEIGHT;
        overlay.blendMode = 'add';
        bloom = { capture, blurred, source, overlay };
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

      // Structural churn: destroy each selected leaf and build its replacement in
      // the same place. Pixi's `destroy` does not detach the child, so the parent
      // is told first - a destroyed child left in the tree corrupts the next
      // render.
      if (churning && rebuildLeaf !== null) {
        for (const leaf of mutableLeaves) {
          leaf.parent.removeChild(leaf.node);
          leaf.node.destroy();

          const replacement = rebuildLeaf(leaf.index);

          leaf.parent.addChild(replacement);
          leaf.node = replacement;
        }

        return;
      }

      // Text invalidation: re-set the string, discarding that leaf's layout and
      // glyph run. The frame index shifts the run so no leaf is ever assigned the
      // string it already has.
      if (textUpdating) {
        for (const leaf of mutableLeaves) {
          if (leaf.node instanceof BitmapText) {
            leaf.node.text = textForLeaf(leaf.index + frame, textGlyphs);
          }
        }

        return;
      }

      const { dx, dy } = wobbleOffsetAt(frame);

      for (const leaf of mutableLeaves) {
        leaf.node.position.set(leaf.baseX + dx, leaf.baseY + dy);
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

      // `composite`: capture the scene off-screen, blur that capture down into
      // the half-size target, draw the scene to the canvas, then add the blurred
      // capture on top. Same four passes the ExoJS arm declares as a pipeline.
      if (bloom !== null) {
        app.renderer.render({ container: root, target: bloom.capture, clear: true });
        app.renderer.render({ container: bloom.source, target: bloom.blurred, clear: true });
        app.renderer.render({ container: root, clear: true });
        app.renderer.render({ container: bloom.overlay, clear: false });

        return;
      }

      // One explicit frame: clear + render the tree + submit, the analogue of the
      // ExoJS adapter's resetStats/clear/render/flush sequence.
      app.renderer.render({ container: root, clear: true });
    },

    teardown(): void {
      releaseBloom();

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
      rebuildLeaf = null;
      churning = false;
      textUpdating = false;
      textGlyphs = 0;

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
