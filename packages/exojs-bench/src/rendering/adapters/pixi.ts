// Side-effect import: registers the Yoga-backed `LayoutSystem` on the renderer
// and mixes `Container.layout` in. Harmless for every other archetype - the
// system's per-frame hook is disabled in `init` (`autoUpdate: false`), and the
// mixin only changes a container once a layout is actually assigned to it.
import '@pixi/layout';

import type { LayoutStyles, LayoutSystemOptions } from '@pixi/layout';
import { settings as tilemapSettings, Tilemap } from '@pixi/tilemap';
import {
  Application,
  BitmapText,
  BlurFilter,
  ColorMatrixFilter,
  Container,
  Culler,
  type Filter,
  Graphics,
  Particle,
  ParticleContainer,
  Rectangle,
  RendererType,
  RenderTexture,
  Sprite,
  Texture,
  type TextureSource,
  type WebGPURenderer,
} from 'pixi.js';

import { mutationSignature, selectMutationIndices, wobbleOffsetAt } from '../../shared/mutation';
import { BLUR_KERNEL_SIGMAS, BLUR_TAPS_PER_SIDE } from '../archetypes';
import { pixiCulledCovers } from '../coverage';
import type { ArchetypeSpec, Backend, EngineAdapter, LayoutDigestReport } from '../EngineAdapter';
import { isParticleLifecycle, isParticles, PARTICLE_ALPHA, PARTICLE_LIFETIME, PARTICLE_PREROLL_STEPS, PARTICLE_STEP, particleSeedAt } from '../particles';
import { isPickingScene, PICK_RECT_SIZE, pickPointAt, pickRectAt } from '../picking';
import { createBlurSourceCanvas, createDistinctTextureCanvas, createParticleCanvas, createTileAtlasCanvas, TEXT_FONT_SIZE } from '../sceneAssets';
import type { TilemapExtent } from '../tilemap';
import {
  isTilemap,
  isTilemapEditing,
  TILE_SIZE,
  TILE_VARIANTS,
  tileIdAt,
  tilemapCameraAt,
  tilemapCameraFrameFor,
  tilemapEditsAt,
  tilemapExtent,
} from '../tilemap';
import {
  blurStrength,
  compositeBlurStrength,
  filterChainDepth,
  hasFullViewportLeaves,
  hasMaskMotion,
  isBlurEffect,
  isChurning,
  isTextArchetype,
  isTextUpdating,
  leafAlpha,
  maskDepth,
  pointerQueriesPerFrame,
  textForLeaf,
} from '../traits';
import type { LayoutRect } from '../uiLayout';
import {
  BOX_GAP,
  BOX_PADDING,
  forEachMutatedWidget,
  isUiLayoutScene,
  LAYOUT_PASSES_PER_FRAME,
  layoutDigest,
  layoutTreeShape,
  layoutViewportAt,
  ROWS_PER_COLUMN,
  WIDGET_HEIGHT,
  WIDGET_WIDE,
  WIDGET_WIDTH,
  widgetsInRow,
} from '../uiLayout';
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
  /** Mask source graphics, moved per frame when the archetype animates its masks. */
  let maskSources: Graphics[] = [];
  let maskMotion = false;
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

  /**
   * Tiles per side of one painted chunk.
   *
   * Pixi's `Tilemap` is an imperatively painted quad buffer with no culling of
   * its own, so a single map-wide instance would submit every world tile every
   * frame. Chunking it is the documented way to draw a large map, and 32 matches
   * the chunk size the ExoJS tile renderer uses by default, so neither arm draws
   * a visible window cut into a different number of pieces.
   */
  const TILE_CHUNK = 32;

  /** One painted chunk of the tilemap scene. */
  interface TileChunk {
    tilemap: Tilemap;
    readonly originX: number;
    readonly originY: number;
    readonly width: number;
    readonly height: number;
  }

  let tileChunks: TileChunk[] = [];
  let tileTextures: Texture[] = [];
  let tileWorld: Container | null = null;
  /** The rendered root of the tilemap scene; it stays at identity, see {@link buildTilemapScene}. */
  let tileRoot: Container | null = null;
  let tilemapSpec: ArchetypeSpec | null = null;
  let tileExtent: TilemapExtent = { width: 0, height: 0 };
  /** Tile ids as this arm currently holds them, so an edited chunk can be repainted from one source. */
  let tileIds: Uint8Array = new Uint8Array(0);
  /** The tile atlas every chunk draws from, kept so a rebuilt chunk gets the identical tileset. */
  let tileAtlas: TextureSource | null = null;

  /** Paint one chunk from {@link tileIds} into its (empty) tilemap. */
  const paintChunk = (chunk: TileChunk): void => {
    for (let y = 0; y < chunk.height; y += 1) {
      for (let x = 0; x < chunk.width; x += 1) {
        const worldX = chunk.originX + x;
        const worldY = chunk.originY + y;

        chunk.tilemap.tile(tileTextures[tileIds[worldY * tileExtent.width + worldX]!]!, x * TILE_SIZE, y * TILE_SIZE);
      }
    }
  };

  /**
   * Rebuild one chunk after its tile data changed.
   *
   * A fresh `Tilemap` rather than `clear()` on the existing one: measured, the
   * second `clear()` + repaint of one instance renders nothing at all, so a
   * scene that edits the same chunk on consecutive frames goes blank. Replacing
   * the instance is also the honest shape of this API's edit cost - it offers no
   * per-tile update, so a changed tile means rebuilding the chunk's quad buffer
   * either way.
   */
  const repaintChunk = (index: number): void => {
    const chunk = tileChunks[index]!;
    const replacement = new Tilemap(tileAtlas!);

    replacement.position.set(chunk.originX * TILE_SIZE, chunk.originY * TILE_SIZE);
    replacement.visible = chunk.tilemap.visible;

    tileWorld?.addChild(replacement);
    chunk.tilemap.destroy();
    chunk.tilemap = replacement;

    paintChunk(chunk);
  };

  /**
   * Build the tilemap scene: one painted `Tilemap` per chunk, all parented and
   * shown or hidden per frame by the visible window.
   *
   * Painting happens once, at build time and outside the timed window, as it does
   * on every other arm. What the timed window sees is the scroll - and, in the
   * editing scene, the repaint an edited chunk needs, which is the real cost of
   * this API: `Tilemap` exposes no per-tile update, so a changed tile means
   * rebuilding the quad buffer of the chunk that holds it.
   */
  const buildTilemapScene = (spec: ArchetypeSpec, nodeCount: number): void => {
    // Lifts the 16-bit index ceiling, which would otherwise cap a single painted
    // buffer at about 16k tiles. The chunking above keeps every buffer far below
    // that, so this only removes a limit from the comparison rather than
    // changing how the arm draws.
    tilemapSettings.use32bitIndex = true;

    const extent = tilemapExtent(nodeCount);
    const atlas = Texture.from(createTileAtlasCanvas());

    tileAtlas = atlas.source;

    tileTextures = Array.from(
      { length: TILE_VARIANTS },
      (_, index) => new Texture({ source: atlas.source, frame: new Rectangle(index * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE) }),
    );
    tileIds = new Uint8Array(extent.width * extent.height);

    for (let y = 0; y < extent.height; y += 1) {
      for (let x = 0; x < extent.width; x += 1) {
        tileIds[y * extent.width + x] = tileIdAt(x, y);
      }
    }

    // The scrolled container is a CHILD of the rendered root rather than the
    // root itself. Measured: with the chunks parented directly to the rendered
    // root, moving that root scrolled this scene at twice the requested rate -
    // the tile pipe combines the root's transform with the one it applies
    // itself. Ordinary sprite scenes do not (`scrolling-world` moves its
    // rendered root and tracks the ExoJS arm exactly), so this is specific to
    // the tile path. Keeping the root at identity avoids it either way.
    const outerRoot = new Container();
    const world = new Container();
    const chunks: TileChunk[] = [];

    outerRoot.addChild(world);

    for (let originY = 0; originY < extent.height; originY += TILE_CHUNK) {
      for (let originX = 0; originX < extent.width; originX += TILE_CHUNK) {
        const tilemap = new Tilemap(atlas.source);

        tilemap.position.set(originX * TILE_SIZE, originY * TILE_SIZE);

        const chunk: TileChunk = {
          tilemap,
          originX,
          originY,
          width: Math.min(TILE_CHUNK, extent.width - originX),
          height: Math.min(TILE_CHUNK, extent.height - originY),
        };

        chunks.push(chunk);
        world.addChild(tilemap);
      }
    }

    tileExtent = extent;
    tileChunks = chunks;

    for (const chunk of chunks) {
      paintChunk(chunk);
    }

    tileWorld = world;
    tileRoot = outerRoot;
    tilemapSpec = spec;

    const camera = tilemapCameraAt(0, extent);

    world.position.set(-camera.x, -camera.y);
    showVisibleChunks(camera.x, camera.y);
  };

  /**
   * Show the chunks the window overlaps and hide the rest.
   *
   * Visibility rather than reparenting: a hidden container costs Pixi a flag test,
   * while adding and removing children every frame would measure the scene
   * graph's bookkeeping instead of the tile path.
   */
  const showVisibleChunks = (cameraX: number, cameraY: number): void => {
    const left = cameraX / TILE_SIZE;
    const top = cameraY / TILE_SIZE;
    const right = left + VIEWPORT_WIDTH / TILE_SIZE;
    const bottom = top + VIEWPORT_HEIGHT / TILE_SIZE;

    for (const chunk of tileChunks) {
      chunk.tilemap.visible = chunk.originX < right && chunk.originX + chunk.width > left && chunk.originY < bottom && chunk.originY + chunk.height > top;
    }
  };

  /** Drop the tilemap scene so a rebuild (or teardown) leaks no GPU resources. */
  const releaseTilemap = (): void => {
    tileRoot?.destroy({ children: true });
    tileRoot = null;
    tileWorld = null;
    tileChunks = [];
    tileTextures = [];
    tileIds = new Uint8Array(0);
    tileAtlas = null;
    tilemapSpec = null;
  };

  /** The particle scene's container, or `null` for every other archetype. */
  let particleContainer: ParticleContainer | null = null;
  let particleList: Particle[] = [];
  let particleTexture: Texture | null = null;
  let particleSpec: ArchetypeSpec | null = null;
  /** Per-particle simulation state the lifecycle scene advances; empty in the draw-only scene. */
  let particleVelocityX: Float32Array = new Float32Array(0);
  let particleVelocityY: Float32Array = new Float32Array(0);
  let particleAge: Float32Array = new Float32Array(0);

  /**
   * Advance the lifecycle scene by one fixed step: age, move, fade, and respawn
   * whatever reached the end of its life.
   *
   * This is HARNESS code, not a Pixi feature, and the comparison says so.
   * `ParticleContainer` is a draw path - it has no emitter, no ageing and no
   * respawn - so the lifecycle scene pairs it with exactly the shared update
   * rule every other arm runs, written out here. It sits inside the measured
   * bracket, because it is work this arm genuinely performs.
   */
  const advanceParticles = (): void => {
    const count = particleList.length;

    for (let index = 0; index < count; index += 1) {
      const particle = particleList[index]!;
      let age = particleAge[index]! + PARTICLE_STEP;

      if (age >= PARTICLE_LIFETIME) {
        const seed = particleSeedAt(index, count);

        age = 0;
        particle.x = seed.x;
        particle.y = seed.y;
        particleVelocityX[index] = seed.velocityX;
        particleVelocityY[index] = seed.velocityY;
      } else {
        particle.x += particleVelocityX[index]! * PARTICLE_STEP;
        particle.y += particleVelocityY[index]! * PARTICLE_STEP;
      }

      particleAge[index] = age;
      particle.alpha = PARTICLE_ALPHA * (1 - age / PARTICLE_LIFETIME);
    }
  };

  /**
   * Build the particle scene: one `ParticleContainer` holding the node count's
   * worth of particles.
   *
   * The draw-only scene declares every property static, which is the fastest
   * shape this API offers and the one a project drawing a fixed set of quads
   * would use. The lifecycle scene declares position and colour dynamic,
   * because it changes both every frame - declaring them static there would
   * measure a scene whose motion never reaches the GPU.
   */
  const buildParticleScene = (spec: ArchetypeSpec, nodeCount: number): void => {
    const texture = Texture.from(createParticleCanvas());
    const lifecycle = isParticleLifecycle(spec);
    const container = new ParticleContainer({
      dynamicProperties: { position: lifecycle, rotation: false, vertex: false, uvs: false, color: lifecycle },
    });

    particleList = new Array<Particle>(nodeCount);
    particleVelocityX = new Float32Array(lifecycle ? nodeCount : 0);
    particleVelocityY = new Float32Array(lifecycle ? nodeCount : 0);
    particleAge = new Float32Array(lifecycle ? nodeCount : 0);

    for (let index = 0; index < nodeCount; index += 1) {
      const seed = particleSeedAt(index, nodeCount);
      // Centred, because the ExoJS particle storage positions a particle by its
      // centre; left at Pixi's top-left default the two arms would draw the same
      // scene half a particle apart.
      const particle = new Particle({ texture, x: seed.x, y: seed.y, alpha: PARTICLE_ALPHA, anchorX: 0.5, anchorY: 0.5 });

      if (lifecycle) {
        particleVelocityX[index] = seed.velocityX;
        particleVelocityY[index] = seed.velocityY;
        // Evenly aged at the start, so respawns land on different frames
        // instead of arriving as one burst.
        particleAge[index] = seed.age;
      }

      particleList[index] = particle;
      container.addParticle(particle);
    }

    particleContainer = container;
    particleTexture = texture;
    particleSpec = spec;

    for (let step = 0; step < (lifecycle ? PARTICLE_PREROLL_STEPS : 0); step += 1) {
      advanceParticles();
    }
  };

  /** Drop the particle scene so a rebuild (or teardown) leaks no GPU resources. */
  const releaseParticles = (): void => {
    particleContainer?.destroy({ children: true });
    particleContainer = null;
    particleList = [];
    particleTexture?.destroy(true);
    particleTexture = null;
    particleSpec = null;
  };

  /** The blur scene's texture, kept so teardown releases it. */
  let blurTexture: Texture | null = null;

  /**
   * Build the blur scene: one textured quad under a separable two-pass Gaussian,
   * configured to the same nine taps and the same reach as every other arm.
   *
   * `quality` is how many times Pixi repeats the pair of sweeps, so it stays at
   * one: raising it would run the filter several times over and publish the
   * extra passes as a slower blur rather than as the different effect they are.
   */
  /**
   * Standard deviation, in texels, of Pixi's nine-tap weight table at unit tap
   * spacing.
   *
   * `BlurFilter.strength` is NOT a sigma, which is the trap this constant exists
   * to close. The weights come from a fixed per-kernel-size table and never
   * change; `strength` scales how far apart the taps are sampled, so it
   * multiplies whatever standard deviation the table already has. Passing the
   * archetype's sigma straight through therefore blurred this arm roughly twice
   * as far as the shared contract asks.
   *
   * The table's own value: its ratios are a clean Gaussian - w1/w0 and w2/w0 both
   * solve exp(-x^2 / 2*sigma^2) at sigma 2.021 - so dividing the target sigma by
   * it gives the tap spacing that realizes the shared kernel.
   */
  const PIXI_KERNEL_SIGMA = 2.021;

  const buildBlurScene = (spec: ArchetypeSpec, nodeCount: number): void => {
    const texture = Texture.from(createBlurSourceCanvas());
    const sprite = new Sprite(texture);
    const height = nodeCount;
    const width = Math.round((height * 16) / 9);

    sprite.width = width;
    sprite.height = height;
    sprite.position.set((VIEWPORT_WIDTH - width) / 2, (VIEWPORT_HEIGHT - height) / 2);

    const scene = new Container();

    const blur = new BlurFilter({ strength: blurStrength(spec) / PIXI_KERNEL_SIGMA, quality: 1, kernelSize: BLUR_TAPS_PER_SIDE * 2 + 1 });

    // Edge handling is part of the shared contract, and the two filters derive
    // their reach from different multiples of the blur they were given - Pixi
    // twice its tap spacing, ExoJS three sigmas. Left alone, this arm would hold
    // back the effect a few pixels sooner at the filtered region's border and
    // the difference would read as a different kernel. Stated as the contract's
    // own reach instead.
    blur.padding = blurStrength(spec) * BLUR_KERNEL_SIGMAS;
    scene.addChild(sprite);
    scene.filters = [blur];

    root = scene;
    blurTexture = texture;
  };

  /** Drop the blur scene's texture so a rebuild (or teardown) leaks nothing. */
  const releaseBlur = (): void => {
    blurTexture?.destroy(true);
    blurTexture = null;
  };

  /** Hit-test scene state, or nulls for every archetype that resolves no queries. */
  let pickingSpec: ArchetypeSpec | null = null;
  let pickTexture: Texture | null = null;
  let pickHits = 0;

  /**
   * Build the picking scene: interactive rectangles on the shared layout.
   *
   * `eventMode: 'static'` is what puts a container into Pixi's event boundary,
   * which is the structure the comparison is about; a `'none'` container is
   * skipped by the hit test entirely and would make the row measure an empty
   * search.
   */
  const buildPickingScene = (spec: ArchetypeSpec, nodeCount: number): void => {
    const texture = Texture.from(createParticleCanvas());
    const scene = new Container();

    scene.eventMode = 'static';

    for (let index = 0; index < nodeCount; index += 1) {
      const rect = new Sprite(texture);
      const at = pickRectAt(index);

      rect.width = PICK_RECT_SIZE;
      rect.height = PICK_RECT_SIZE;
      rect.position.set(at.x, at.y);
      rect.eventMode = 'static';
      scene.addChild(rect);
    }

    root = scene;
    pickTexture = texture;
    pickingSpec = spec;
  };

  /** Box-tree layout state, or nulls for every archetype that resolves no layout passes. */
  let layoutSpec: ArchetypeSpec | null = null;
  let layoutRoot: Container | null = null;
  let layoutNodes: Container[] = [];
  let layoutLeaves: Container[] = [];
  let layoutWidgets = 0;
  /**
   * Passes resolved since the scene was built, warmup included.
   *
   * Counted here rather than derived from `mutate`'s frame index: the harness
   * restarts that index at zero between warmup and the timed window, and a pass
   * only puts back what the PREVIOUS pass widened - so a restarted index would
   * leave the last warmup pass's leaves wide for the rest of the cell and the
   * tree would stop matching the shared definition.
   */
  let layoutPass = 0;

  /**
   * Flex properties every box in the layout tree shares.
   *
   * `flexShrink: 0` overrides `@pixi/layout`'s default of `1`: the narrow
   * viewport is deliberately too small for the tree, and a shrinking arm would
   * answer the overflow by resizing the leaves - which is a different scene from
   * the one the ExoJS arm lays out, where a stack never resizes what it did not
   * grow. `alignItems: 'flex-start'` pins the cross axis for the same reason;
   * Yoga's own default stretches, and stretching is exactly the "differing flex
   * distribution" the shared scope excludes.
   */
  const LAYOUT_BOX_STYLE = {
    gap: BOX_GAP,
    padding: BOX_PADDING,
    alignItems: 'flex-start',
    flexShrink: 0,
    boxSizing: 'border-box',
  } as const satisfies LayoutStyles;

  /** Style of a leaf widget at `width`. Leaves carry no children, so only their box matters. */
  const layoutLeafStyle = (width: number): LayoutStyles => ({ width, height: WIDGET_HEIGHT, flexShrink: 0, boxSizing: 'border-box' });

  /** Style of the root box against viewport `pass`. */
  const layoutRootStyle = (pass: number): LayoutStyles => {
    const viewport = layoutViewportAt(pass);

    return { ...LAYOUT_BOX_STYLE, flexDirection: 'row', width: viewport.width, height: viewport.height };
  };

  /**
   * Build the layout scene: a root row of column boxes, each holding rows of
   * fixed-size leaf containers, resolved once before the measurement window
   * opens.
   *
   * The tree is the ExoJS arm's tree, node for node. What differs is how a
   * change reaches the solver: assigning a style marks the root dirty, and the
   * whole tree is re-solved by one `layout.update` call - against the ExoJS
   * arm's eager per-resize reflow. Both are the arm's own public layout path,
   * which is what the shared scope permits.
   */
  const buildLayoutScene = (spec: ArchetypeSpec, nodeCount: number): void => {
    const shape = layoutTreeShape(nodeCount);
    const scene = new Container();
    const nodes: Container[] = [];
    const columns: Container[] = [];
    const leaves: Container[] = [];

    scene.layout = layoutRootStyle(0);

    for (let column = 0; column < shape.columns; column += 1) {
      const box = new Container();

      box.layout = { ...LAYOUT_BOX_STYLE, flexDirection: 'column' };
      columns.push(box);
      nodes.push(box);
      scene.addChild(box);
    }

    for (let row = 0; row < shape.rows; row += 1) {
      const box = new Container();

      box.layout = { ...LAYOUT_BOX_STYLE, flexDirection: 'row' };
      nodes.push(box);
      columns[Math.floor(row / ROWS_PER_COLUMN)]!.addChild(box);

      for (let slot = 0; slot < widgetsInRow(shape, row); slot += 1) {
        const leaf = new Container();

        leaf.layout = layoutLeafStyle(WIDGET_WIDTH);
        leaves.push(leaf);
        nodes.push(leaf);
        box.addChild(leaf);
      }
    }

    app!.renderer.layout.update(scene);

    root = scene;
    layoutRoot = scene;
    layoutNodes = nodes;
    layoutLeaves = leaves;
    layoutWidgets = shape.widgets;
    layoutPass = 0;
    layoutSpec = spec;
  };

  /**
   * Drop the layout scene.
   *
   * Clearing every `layout` explicitly rather than relying on the destroy of the
   * tree: assigning the first layout replaces `Container.prototype`'s `visible`
   * accessor page-wide, and only assigning `null` puts the original back. A page
   * runs every cell of an arm in sequence, so a layout cell that skipped this
   * would leave that accessor in place for every Pixi cell measured after it.
   */
  const releaseLayout = (): void => {
    for (const node of layoutNodes) {
      node.layout = null;
    }

    if (root === layoutRoot) {
      root = null;
    }

    layoutRoot?.destroy({ children: true });
    layoutRoot = null;
    layoutNodes = [];
    layoutLeaves = [];
    layoutWidgets = 0;
    layoutPass = 0;
    layoutSpec = null;
  };

  /**
   * The resolved leaf rectangles, in leaf-index order and in the root box's
   * coordinates.
   *
   * Read from the Yoga boxes rather than from the containers' transforms: a
   * transform is only written when the scene is next rendered, so a digest taken
   * off it would report the previous pass on the arm that batches. Called
   * outside the timed bracket only.
   */
  const layoutRects = (): readonly LayoutRect[] => {
    const rects: LayoutRect[] = [];

    if (layoutRoot === null) {
      return rects;
    }

    for (const column of layoutRoot.children) {
      const columnBox = column.layout!.computedLayout;

      for (const row of column.children) {
        const rowBox = row.layout!.computedLayout;

        for (const leaf of row.children) {
          const box = leaf.layout!.computedLayout;

          rects.push({ x: columnBox.left + rowBox.left + box.left, y: columnBox.top + rowBox.top + box.top, width: box.width, height: box.height });
        }
      }
    }

    return rects;
  };

  /** Drop the picking scene so a rebuild (or teardown) leaks nothing. */
  const releasePicking = (): void => {
    pickTexture?.destroy(true);
    pickTexture = null;
    pickingSpec = null;
  };

  return {
    engine: 'pixi',
    config,

    supports(target: Backend): boolean {
      return target === 'webgl2' || target === 'webgpu';
    },

    coversArchetype(spec: ArchetypeSpec): boolean {
      return config === 'default' || pixiCulledCovers(spec);
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
        // The layout pass belongs to the measured block, never to a prerender
        // hook that would put it outside the bracket. Everything else about the
        // system is left at its defaults - the intrinsic-size walk's throttle
        // included, because turning that off would make the arm pay a whole-tree
        // walk per pass that a Pixi application never pays.
        //
        // The cast is the package's own declaration being one level off: it types
        // the renderer option as the system's whole options object, while the
        // system reads the inner record out of the renderer options it is handed.
        layout: { autoUpdate: false } as unknown as LayoutSystemOptions,
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

      releaseTilemap();
      releaseParticles();
      releaseBlur();
      releasePicking();
      releaseLayout();

      textures = [];

      for (let t = 0; t < spec.textureCount; t++) {
        textures.push(createDistinctTexture(t, spec.textureCount));
      }

      // The tilemap scenes leave the sprite path behind: the leaves are tiles in
      // a painted quad buffer rather than nodes, so nothing below applies.
      if (isTilemap(spec)) {
        buildTilemapScene(spec, nodeCount);
        root = tileRoot;

        return;
      }

      if (isParticles(spec)) {
        buildParticleScene(spec, nodeCount);
        root = particleContainer;

        return;
      }

      if (isBlurEffect(spec)) {
        buildBlurScene(spec, nodeCount);

        return;
      }

      if (isPickingScene(spec)) {
        buildPickingScene(spec, nodeCount);

        return;
      }

      if (isUiLayoutScene(spec)) {
        buildLayoutScene(spec, nodeCount);

        return;
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
      const overdraw = hasFullViewportLeaves(spec);
      const alpha = leafAlpha(spec);

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

        // A fixed leaf alpha is what makes a stack of full-viewport quads a
        // blend workload: every layer has to be composited rather than skipped.
        if (alpha < 1) {
          sprite.alpha = alpha;
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

      maskSources = [];
      maskMotion = hasMaskMotion(spec);

      for (let level = 0; level < maskLevels; level++) {
        const source = createMaskRect(level, maskLevels);

        sceneRoot.addChild(source);
        spine[level + 1]!.mask = source;
        maskSources.push(source);
      }

      // Bloom-shaped multipass, hand-rolled the way a Pixi app writes one: a
      // full-size capture target, a half-size blur target, a source sprite of the
      // capture carrying the blur filter and scaled to the smaller target (Pixi
      // renders 1:1 into a target, so the scale IS the downsample), and an
      // additive overlay sprite of the blurred result stretched back to the
      // viewport. `renderFrame` drives the four passes explicitly.
      releaseBloom();

      const bloomStrength = compositeBlurStrength(spec);

      if (bloomStrength > 0) {
        const capture = RenderTexture.create({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
        const blurred = RenderTexture.create({
          width: Math.round(VIEWPORT_WIDTH * BLOOM_DOWNSCALE),
          height: Math.round(VIEWPORT_HEIGHT * BLOOM_DOWNSCALE),
        });
        const source = new Sprite(capture);
        const overlay = new Sprite(blurred);

        source.scale.set(BLOOM_DOWNSCALE);
        source.filters = [new BlurFilter({ strength: bloomStrength, quality: 2 })];
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

    pickHits(): number {
      return pickHits;
    },

    layoutDigest(): LayoutDigestReport {
      return { pass: layoutPass - 1, digest: layoutDigest(layoutRects()) };
    },

    mutationSignature(): string {
      return mutationSignature(mutableIndices);
    },

    mutate(frame: number): void {
      // Layout scene: one block of layout passes, inside the bracket because
      // resolving the tree IS the frame's work here. Each pass puts the previous
      // pass's widened leaves back, widens this pass's, re-styles the root to the
      // viewport it resolves against, and asks the layout system to solve - the
      // solve is one call here because assigning a style only marks the root
      // dirty.
      if (layoutSpec !== null && layoutRoot !== null && app !== null) {
        const narrow = layoutLeafStyle(WIDGET_WIDTH);
        const wide = layoutLeafStyle(WIDGET_WIDE);

        for (let step = 0; step < LAYOUT_PASSES_PER_FRAME; step += 1) {
          const pass = layoutPass;

          if (pass > 0) {
            forEachMutatedWidget(pass - 1, layoutWidgets, index => {
              layoutLeaves[index]?.layout?.setStyle(narrow);
            });
          }

          forEachMutatedWidget(pass, layoutWidgets, index => {
            layoutLeaves[index]?.layout?.setStyle(wide);
          });

          layoutRoot.layout!.setStyle(layoutRootStyle(pass));
          app.renderer.layout.update(layoutRoot);
          layoutPass = pass + 1;
        }

        return;
      }

      // Picking scene: one block of point queries through Pixi's own event
      // boundary, the structure under comparison. The boundary reports the root
      // itself where nothing was hit, which is this arm's way of saying "no
      // target" and is counted as a miss.
      if (pickingSpec !== null && app !== null && root !== null) {
        const boundary = app.renderer.events.rootBoundary;
        const queries = pointerQueriesPerFrame(pickingSpec);
        let hits = 0;

        boundary.rootTarget = root;

        for (let index = 0; index < queries; index += 1) {
          const point = pickPointAt(index, queries);
          const target = boundary.hitTest(point.x, point.y);

          if (target !== null && target !== root) {
            hits += 1;
          }
        }

        pickHits = hits;

        return;
      }

      // Particle scenes: the lifecycle one advances the shared update rule; the
      // draw-only one submits the same quads every frame by design.
      if (particleSpec !== null) {
        if (isParticleLifecycle(particleSpec)) {
          advanceParticles();
        }

        return;
      }

      // Tilemap scenes: move the window, reveal the chunks it now overlaps, and
      // submit this frame's tile changes. An edit means repainting the chunk that
      // holds it - `Tilemap` has no per-tile update - and that repaint is the
      // work this arm genuinely does, so it belongs inside the bracket.
      if (tilemapSpec !== null && tileWorld !== null) {
        const camera = tilemapCameraAt(tilemapCameraFrameFor(tilemapSpec, frame), tileExtent);

        tileWorld.position.set(-camera.x, -camera.y);
        showVisibleChunks(camera.x, camera.y);

        if (isTilemapEditing(tilemapSpec)) {
          const dirty = new Set<number>();

          for (const edit of tilemapEditsAt(frame, tileExtent)) {
            tileIds[edit.y * tileExtent.width + edit.x] = edit.tileId;
            dirty.add(Math.floor(edit.y / TILE_CHUNK) * Math.ceil(tileExtent.width / TILE_CHUNK) + Math.floor(edit.x / TILE_CHUNK));
          }

          for (const index of dirty) {
            repaintChunk(index);
          }
        }

        return;
      }

      if (scrollingSpec !== null && root !== null) {
        const centre = cameraCenterAt(scrollingSpec, frame, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

        root.position.set(VIEWPORT_WIDTH / 2 - centre.x, VIEWPORT_HEIGHT / 2 - centre.y);
      }

      // Mask motion: the mask sources move by the same wobbled offset the
      // ExoJS arm applies to its rects.
      if (maskMotion) {
        const { dx, dy } = wobbleOffsetAt(frame);

        for (const source of maskSources) {
          source.position.set(dx, dy);
        }
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
      releaseTilemap();
      releaseParticles();
      releaseBlur();
      releasePicking();
      releaseLayout();

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
      maskSources = [];
      maskMotion = false;
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
