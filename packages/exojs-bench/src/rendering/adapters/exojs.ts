import { AlphaFadeOverLifetime, Curve, particlesExtension, ParticleSystem } from '@codexo/exojs-particles';
import { TILE_TRANSFORM_IDENTITY, TileLayer, TileMap, tilemapExtension, TileMapNode, TileSet } from '@codexo/exojs-tilemap';

import { Application } from '#core/Application';
import { Color } from '#core/Color';
import type { Seconds } from '#core/units';
import { Matrix } from '#math/Matrix';
import { Rectangle } from '#math/Rectangle';
import { CallbackRenderPass } from '#rendering/CallbackRenderPass';
import { Container } from '#rendering/Container';
import { BlurFilter } from '#rendering/filters/BlurFilter';
import { ColorMatrixFilter } from '#rendering/filters/ColorMatrixFilter';
import type { Filter } from '#rendering/filters/Filter';
import { Geometry } from '#rendering/geometry/Geometry';
import { SpriteMaterial } from '#rendering/material/SpriteMaterial';
import { Mesh } from '#rendering/mesh/Mesh';
import { RenderPlanBuilder } from '#rendering/plan/RenderPlanBuilder';
import { RenderBackendType } from '#rendering/RenderBackendType';
import { RenderBatch } from '#rendering/RenderBatch';
import { RenderNodePass } from '#rendering/RenderNodePass';
import { RenderPipeline } from '#rendering/RenderPipeline';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { Shader } from '#rendering/shader/Shader';
import { spriteVertexGlsl } from '#rendering/sprite/materialSources';
import { Sprite } from '#rendering/sprite/Sprite';
import { Text } from '#rendering/text/Text';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { TextureRegion } from '#rendering/texture/TextureRegion';
import { BlendModes } from '#rendering/types';
import { View } from '#rendering/View';
import type { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { mutationSignature, selectMutationIndices, wobbleOffsetAt } from '../../shared/mutation';
import { BLUR_TAPS_PER_SIDE } from '../archetypes';
import type { ArchetypeSpec, Backend, EngineAdapter } from '../EngineAdapter';
import {
  isParticleLifecycle,
  isParticles,
  PARTICLE_ALPHA,
  PARTICLE_LIFETIME,
  PARTICLE_PREROLL_STEPS,
  PARTICLE_STEP,
  PARTICLE_TINT,
  particleSeedAt,
} from '../particles';
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
  blurRadius,
  compositeBlurRadius,
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
import {
  BLOOM_DOWNSCALE,
  cameraCenterAt,
  GRID_MARGIN,
  gridLayout,
  gridPosition,
  isScrolling,
  maskRect,
  SPRITE_SIZE,
  VIEWPORT_HEIGHT,
  VIEWPORT_WIDTH,
  worldExtent,
  type WorldRect,
} from '../world';

/**
 * One array-backed mesh leaf: the same SPRITE_SIZE quad a sprite leaf covers,
 * as a flat six-vertex triangle list with full-texture UVs.
 */
const createArrayLeafMesh = (texture: Texture): Mesh =>
  new Mesh({
    vertices: new Float32Array([0, 0, SPRITE_SIZE, 0, SPRITE_SIZE, SPRITE_SIZE, 0, 0, SPRITE_SIZE, SPRITE_SIZE, 0, SPRITE_SIZE]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]),
    texture,
  });

/** One mesh leaf backed by the scene's shared, retained-recordable geometry. */
const createStaticLeafMesh = (texture: Texture, geometry: Geometry): Mesh => new Mesh({ geometry, texture });

/**
 * One SPRITE_SIZE quad in local space, the single geometry every instance of the
 * `instanced-batch` archetype draws. Position + texcoord + vertex color, matching
 * the default mesh material's vertex layout so the batch needs no custom shader
 * (the archetype measures submission overhead, not fragment work).
 */
const createBatchQuad = (): Geometry => {
  const stride = 20;
  const corners: ReadonlyArray<readonly [number, number, number, number]> = [
    [0, 0, 0, 0],
    [SPRITE_SIZE, 0, 1, 0],
    [SPRITE_SIZE, SPRITE_SIZE, 1, 1],
    [0, 0, 0, 0],
    [SPRITE_SIZE, SPRITE_SIZE, 1, 1],
    [0, SPRITE_SIZE, 0, 1],
  ];
  const buffer = new ArrayBuffer(corners.length * stride);
  const view = new DataView(buffer);

  for (const [index, [x, y, u, v]] of corners.entries()) {
    const base = index * stride;

    view.setFloat32(base + 0, x, true);
    view.setFloat32(base + 4, y, true);
    view.setFloat32(base + 8, u, true);
    view.setFloat32(base + 12, v, true);
    view.setUint8(base + 16, 255);
    view.setUint8(base + 17, 255);
    view.setUint8(base + 18, 255);
    view.setUint8(base + 19, 255);
  }

  return new Geometry({
    attributes: [
      { name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 },
      { name: 'a_texcoord', size: 2, type: 'f32', normalized: false, offset: 8 },
      { name: 'a_color', size: 4, type: 'u8', normalized: true, offset: 16 },
    ],
    vertexData: buffer,
    stride,
  });
};

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
uniform vec4 u_userColor;
out vec4 fragColor;
void main() {
  fragColor = sampleBase(v_textureSlot, v_texcoord) * v_color * u_userColor;
}`;

/** WGSL twin of {@link materialFragmentGlsl} so the same material also runs on the WebGPU backend. */
const materialFragmentWgsl = `
struct UserUniforms { color: vec4<f32> };
@group(2) @binding(0) var<uniform> u_user: UserUniforms;

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let base = sampleBase(input.textureSlot, input.texcoord);
  return base * input.color * u_user.color;
}
`.trim();

/** Build one of `total` distinct custom sprite materials (distinct instances - the batcher keys on identity). */
const createDistinctMaterial = (index: number, total: number): SpriteMaterial =>
  new SpriteMaterial({
    shader: new Shader({ glsl: { vertex: spriteVertexGlsl, fragment: materialFragmentGlsl }, wgsl: materialFragmentWgsl }),
    uniforms: { u_userColor: [1, 1 - index / Math.max(1, total), 1, 1] },
  });

/**
 * A pre-selected leaf and its resting grid position - the only nodes `mutate`
 * disturbs.
 *
 * `node` is mutable because the churn archetype replaces it with a freshly built
 * leaf every frame; `parent` and `index` are what such a replacement needs in
 * order to land in the identical place in the tree, with the identical texture
 * and glyph run, as the leaf it succeeds.
 */
interface MutableLeaf {
  node: Sprite | Text;
  readonly parent: Container;
  readonly index: number;
  readonly baseX: number;
  readonly baseY: number;
}

/**
 * Text leaf for the text archetypes: an SDF {@link Text} node carrying the
 * shared, index-derived glyph run.
 *
 * `fontSize` is fixed across the arms rather than scaled with the node count, so
 * the glyph raster - and therefore the atlas pressure a text scene puts on the
 * engine - is a property of the archetype instead of a property of the cell.
 */
const createTextLeaf = (index: number, glyphs: number): Text => new Text(textForLeaf(index, glyphs), { fontSize: TEXT_FONT_SIZE });

/**
 * One link of a filter chain. A colour matrix at a near-identity saturation: it
 * is a single full-target pass with trivial fragment work, which is what leaves
 * the archetype measuring target allocation, binding and blit rather than
 * fragment ALU. Each link gets a slightly different matrix so no arm can
 * collapse the chain by recognising two identical filters.
 */
const createChainFilter = (link: number): Filter => new ColorMatrixFilter().saturate(1 + link * 0.05);

/**
 * Generate one of `total` visually distinct solid-colour textures from a small
 * canvas. Distinct texture identities are what force the `batch-breaking`
 * archetype to break instanced batches (each texture is a separate GPU bind).
 */
const createDistinctTexture = (index: number, total: number): Texture => new Texture(createDistinctTextureCanvas(index, total));

/**
 * Build `count` `View`s tiled in a near-square screen grid (split-screen /
 * multi-viewport), each showing the SAME full-viewport world rect - the
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
 * Drives the public {@link Application} API - the production path, which
 * registers the core renderers via `materializeRendererBindings` during
 * construction - rather than constructing a backend directly, so the benchmark
 * measures the code a user would actually run. A single frame is produced by
 * the same two calls the production render phase issues (`rendering.render(node)`
 * then `backend.flush()`), driven explicitly so the harness owns frame cadence
 * instead of the engine's `requestAnimationFrame` loop.
 *
 * Supports both the `'webgl2'` and `'webgpu'` backends; the per-frame call
 * sequence (`resetStats(); clear(); rendering.render(root); flush()`) is
 * identical on both, so only {@link init} branches on the backend type.
 */
/**
 * Which ExoJS arm this adapter represents: today's default path, the Slice-2
 * RetainedContainer spine, or a calibration arm that overrides the retained
 * capture margin (`cull-margin-<numerator>_<denominator>`, e.g.
 * `cull-margin-1_8`).
 *
 * The calibration arms exist because `RETAINED_CULL_MARGIN_RATIO` is a module
 * constant in the engine: sweeping it would otherwise mean one source edit and
 * one build per point, which is not a comparison. The arm patches the builder's
 * private inflation step instead - the harness page imports engine SOURCE
 * through the `#` alias, so the same object the engine uses is reachable - and
 * every other arm, the production default included, is left untouched.
 */
export type ExoJsAdapterConfig = 'current' | 'retained' | `cull-margin-${string}`;

/** `cull-margin-1_8` -> `0.125`; anything else -> `null`. */
const parseCullMarginConfig = (config: string): number | null => {
  const match = /^cull-margin-(\d+)_(\d+)$/.exec(config);

  if (match === null) {
    return null;
  }

  const denominator = Number(match[2]);

  return denominator === 0 ? null : Number(match[1]) / denominator;
};

/** Builder internals the calibration arm reaches into; `private` is compile-time only. */
interface CullRectInternals {
  _captureCullRect: { set(x: number, y: number, width: number, height: number): void };
  _captureCullActive: boolean;
  _inflateCaptureCullRect(view: View): void;
}

const defaultInflateCullRect = (RenderPlanBuilder.prototype as unknown as CullRectInternals)._inflateCaptureCullRect;

/**
 * Point every capture and every indexed selection at a cull rect grown by
 * `ratio` per side, or back at the engine's own constant when `ratio` is `null`.
 * Called on every `init` so an arm never inherits the previous arm's override.
 */
const applyCullMarginOverride = (ratio: number | null): void => {
  const prototype = RenderPlanBuilder.prototype as unknown as CullRectInternals;

  if (ratio === null) {
    prototype._inflateCaptureCullRect = defaultInflateCullRect;

    return;
  }

  prototype._inflateCaptureCullRect = function inflate(this: CullRectInternals, view: View): void {
    const rect = view.getBounds();
    const marginX = rect.width * ratio;
    const marginY = rect.height * ratio;

    this._captureCullRect.set(rect.x - marginX, rect.y - marginY, rect.width + 2 * marginX, rect.height + 2 * marginY);
    this._captureCullActive = true;
  };
};

export const createExoJsAdapter = (backendFilter?: readonly Backend[], config: ExoJsAdapterConfig = 'current'): EngineAdapter => {
  const supported: readonly Backend[] = backendFilter ?? ['webgl2', 'webgpu'];
  const cullMargin = parseCullMarginConfig(config);

  let app: Application | null = null;
  let root: Container | null = null;
  let textures: Texture[] = [];
  /** Custom sprite materials built for the `mixed-material` archetype; empty for every other archetype. */
  let materials: SpriteMaterial[] = [];
  let mutableLeaves: MutableLeaf[] = [];
  /** Leaf indices the most recent buildScene selected for mutation - the source of {@link EngineAdapter.mutationSignature}. */
  let mutableIndices: number[] = [];
  /**
   * The `split-screen` archetype's simultaneous `View`s (`spec.viewCount`,
   * see `EngineAdapter.ts`). Empty for every other archetype, in which case
   * `renderFrame` falls back to the ordinary single-view render.
   */
  let views: View[] = [];
  /**
   * The `instanced-batch` archetype's explicit submissions (`spec.batchSize`,
   * see `EngineAdapter.ts`). Empty for every other archetype, in which case
   * `renderFrame` renders the scene tree as usual.
   */
  let batches: RenderBatch[] = [];
  let batchGeometry: Geometry | null = null;
  /** Shared by every mesh leaf in `mixed-sprite-mesh-static`; absent for the array case. */
  let sharedMeshGeometry: Geometry | null = null;
  /**
   * The `composite` archetype's bloom stack (`spec.compositeBlurRadius`, see
   * `EngineAdapter.ts`); `null` for every single-pass archetype, in which case
   * `renderFrame` takes the ordinary scene-render path. The pipeline owns its
   * passes, but the textures, the filter and the overlay sprite are the arm's -
   * a pass never frees a caller-supplied target.
   */
  let compositePipeline: RenderPipeline | null = null;
  let captureTexture: RenderTexture | null = null;
  let bloomTexture: RenderTexture | null = null;
  let bloomFilter: BlurFilter | null = null;
  let bloomOverlay: Sprite | null = null;
  /**
   * The archetype currently built, when it scrolls a camera
   * (`ArchetypeSpec.cameraSpeed`); `null` for every static-view archetype, in
   * which case `mutate` leaves the view alone. The camera is driven through the
   * context's own `view` - the engine's real camera, and the rect its per-node
   * culling and its retained-product validity are keyed on - rather than by
   * translating the world, which is the same distinction a game makes.
   */
  let scrollingSpec: ArchetypeSpec | null = null;
  /**
   * Rebuilds the leaf at a given global index exactly as `buildScene` built it -
   * same texture, same glyph run, same position. Non-null only while a churning
   * archetype is built, which is the only caller: every other archetype keeps
   * its leaves for the life of the cell.
   */
  let rebuildLeaf: ((index: number) => Sprite | Text) | null = null;
  /** Per-frame mutation mode of the built archetype; see `traits.ts`. */
  let churning = false;
  let textUpdating = false;
  /** Masked spine containers with their rest rects, moved per frame when the archetype animates its masks. */
  let maskedLevels: Array<{ container: Container; base: WorldRect }> = [];
  let maskMotion = false;
  /** Characters per text leaf of the built archetype; `0` when it has no text. */
  let textGlyphs = 0;

  /** Drop the `composite` archetype's bloom stack so a rebuild (or teardown) leaks no GPU resources. */
  const releaseComposite = (): void => {
    compositePipeline?.destroy();
    compositePipeline = null;
    bloomOverlay?.destroy();
    bloomOverlay = null;
    bloomFilter?.destroy();
    bloomFilter = null;
    captureTexture?.destroy();
    captureTexture = null;
    bloomTexture?.destroy();
    bloomTexture = null;
  };

  /**
   * Build the bloom-shaped multipass for the `composite` archetype: capture the
   * scene off-screen, blur that capture DOWN into a half-resolution target, draw
   * the scene again directly, then add the blurred capture on top.
   *
   * Expressed as a {@link RenderPipeline} of stock passes rather than as
   * hand-rolled target switching in `renderFrame`, because that is the API an
   * ExoJS app writes a post-processing stack with - and it is what the Pixi arm's
   * hand-rolled `render({ target })` sequence is being compared against.
   */
  const buildComposite = (sceneRoot: Container, radius: number): void => {
    const capture = new RenderTexture(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
    const bloom = new RenderTexture(Math.round(VIEWPORT_WIDTH * BLOOM_DOWNSCALE), Math.round(VIEWPORT_HEIGHT * BLOOM_DOWNSCALE));
    // A single blur from the full-size capture into the half-size target is both
    // the downsample and the blur: the filter sizes its sweep to the OUTPUT, so
    // the wide kernel runs over a quarter of the fragments.
    const filter = new BlurFilter({ radius, quality: 2 });
    const overlay = new Sprite(bloom).setBlendMode(BlendModes.Additive);

    overlay.width = VIEWPORT_WIDTH;
    overlay.height = VIEWPORT_HEIGHT;

    captureTexture = capture;
    bloomTexture = bloom;
    bloomFilter = filter;
    bloomOverlay = overlay;
    compositePipeline = new RenderPipeline()
      .addPass(new RenderNodePass(sceneRoot, { target: capture, clear: Color.transparentBlack }))
      .addPass(new CallbackRenderPass(pass => filter.apply(pass.backend, capture, bloom)))
      .addPass(new RenderNodePass(sceneRoot))
      .addPass(new RenderNodePass(overlay));
  };

  /** Drop the `instanced-batch` scene so a rebuild (or teardown) leaks no GPU resources. */
  const releaseBatchScene = (): void => {
    for (const batch of batches) {
      batch.destroy();
    }

    batches = [];
    batchGeometry?.destroy();
    batchGeometry = null;
  };

  /**
   * Build the `instanced-batch` scene: `nodeCount` instances of one shared quad,
   * laid out on the same grid the sprite archetypes use, split into
   * `ceil(nodeCount / batchSize)` explicit submissions. The instance count is
   * what varies with `nodeCount`; the CALL count is what the archetype puts
   * under load.
   */
  const buildBatchScene = (spec: ArchetypeSpec, nodeCount: number): void => {
    const batchSize = Math.max(1, spec.batchSize ?? 1);
    const layout = gridLayout(nodeCount, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, GRID_MARGIN);
    const transform = new Matrix();
    const tint = Color.white;

    batchGeometry = createBatchQuad();

    let current: RenderBatch | null = null;

    for (let i = 0; i < nodeCount; i++) {
      if (i % batchSize === 0) {
        current = new RenderBatch(batchGeometry);
        batches.push(current);
      }

      const { x, y } = gridPosition(i, layout, GRID_MARGIN);

      // `add` copies the transform and tint, so one scratch Matrix suffices.
      transform.set(1, 0, x, 0, 1, y);
      current!.add(transform, tint);
    }

    root = null;
    mutableLeaves = [];
    mutableIndices = [];

    for (const view of views) {
      view.destroy();
    }

    views = [];
  };

  /** The tile layer the tilemap scenes paint into, or `null` for every other archetype. */
  let tileLayer: TileLayer | null = null;

  /** The tileset the tile layer draws from, kept so teardown releases its texture. */
  let tileTexture: Texture | null = null;

  /** The tilemap scene's root node, and the map extent its camera is bounded by. */
  let tilemapNode: TileMapNode | null = null;
  let tilemapSpec: ArchetypeSpec | null = null;
  let tilemapMapExtent: TilemapExtent = { width: 0, height: 0 };

  /**
   * Build the tilemap scene: one fully-populated layer over a single-page
   * tileset, rendered through the package's own chunk renderer.
   *
   * Every tile is written at build time, outside the timed window - the scenes
   * compare drawing and editing a populated map, not populating one. The camera
   * is the View's, as it is for `scrolling-world`: the engine has a real camera,
   * and its rect is what the chunk culling and the retained products are keyed
   * on.
   */
  const buildTilemapScene = (spec: ArchetypeSpec, nodeCount: number): void => {
    const extent = tilemapExtent(nodeCount);
    const texture = new Texture(createTileAtlasCanvas());
    const tileset = new TileSet({
      name: 'tiles',
      texture: new TextureRegion(texture, { x: 0, y: 0, width: TILE_SIZE * TILE_VARIANTS, height: TILE_SIZE }),
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
      tileCount: TILE_VARIANTS,
    });
    const layer = new TileLayer({
      id: 1,
      name: 'ground',
      width: extent.width,
      height: extent.height,
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
      tilesets: [tileset],
    });

    for (let y = 0; y < extent.height; y += 1) {
      for (let x = 0; x < extent.width; x += 1) {
        layer.setTileAt(x, y, { tileset, localTileId: tileIdAt(x, y), transform: TILE_TRANSFORM_IDENTITY });
      }
    }

    const map = new TileMap({
      name: 'benchmark',
      width: extent.width,
      height: extent.height,
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
      tilesets: [tileset],
      layers: [layer],
    });

    root = new Container();
    tilemapNode = new TileMapNode(map);
    root.addChild(tilemapNode);

    tileLayer = layer;
    tileTexture = texture;
    tilemapSpec = spec;
    tilemapMapExtent = extent;

    const start = tilemapCameraAt(0, extent);

    app!.rendering.view.setCenter(start.x + VIEWPORT_WIDTH / 2, start.y + VIEWPORT_HEIGHT / 2);
  };

  /** Drop the tilemap scene so a rebuild (or teardown) leaks no GPU resources. */
  const releaseTilemap = (): void => {
    tilemapNode?.destroy();
    tilemapNode = null;
    tileTexture?.destroy();
    tileTexture = null;
    tileLayer = null;
    tilemapSpec = null;
  };

  /** The particle system the particle scenes draw, or `null` for every other archetype. */
  let particleSystem: ParticleSystem | null = null;
  let particleTexture: Texture | null = null;
  let particleSpec: ArchetypeSpec | null = null;

  /**
   * Fill the system up to its capacity, giving each particle the shared scene's
   * deterministic state.
   *
   * `emit()` returns `null` once the pool is full, which is what holds the live
   * count at the node count: the scene tops the pool up every frame rather than
   * spawning at a rate and hoping the two balance out.
   */
  const fillParticles = (count: number, initial: boolean): void => {
    for (let filled = 0; filled < count; filled += 1) {
      const particle = particleSystem!.emit();

      if (particle === null) {
        return;
      }

      // The cursor walks the whole seed set rather than restarting at zero, so a
      // respawn lands on the next unused layout instead of piling every
      // replacement onto the same handful of positions - which is what turned
      // the pool into a few dense clusters while the arms beside it stayed
      // evenly spread.
      const index = particleCursor % count;

      particleCursor += 1;

      const seed = particleSeedAt(index, count);

      particle.position.set(seed.x, seed.y);
      particle.velocity.set(seed.velocityX, seed.velocityY);
      // The sprite is already PARTICLE_SIZE square, and `scale` is a factor:
      // setting it to the size would draw a quad four times too large.
      particle.scale.set(1, 1);
      particle.color = PARTICLE_TINT;
      if (particleLifetime === null) {
        // The draw-only scene never advances, so its particles must not expire:
        // a finite life would shrink the pool over a long cell for no reason the
        // scene is measuring.
        particle.lifetime = Number.MAX_SAFE_INTEGER;
      } else {
        // On the first fill each particle gets what is LEFT of one lifetime, so
        // the pool starts evenly aged and its respawns land on different frames
        // instead of arriving as one burst.
        particle.lifetime = initial ? Math.max(PARTICLE_STEP, particleLifetime - seed.age) : particleLifetime;
      }
    }
  };

  /** Next seed index a spawn takes; see {@link fillParticles}. */
  let particleCursor = 0;

  /** Seconds a particle lives, or `null` in the draw-only scene, which never ages one. */
  let particleLifetime: number | null = null;

  /**
   * Build the particle scene: a system at the node count's capacity, filled
   * once, and - for the lifecycle scene - advanced through one full lifetime so
   * the timed window sees a steady pool rather than a settling one.
   */
  const buildParticleScene = (spec: ArchetypeSpec, nodeCount: number): void => {
    const texture = new Texture(createParticleCanvas());
    const system = new ParticleSystem(texture, { capacity: nodeCount });

    particleSystem = system;
    particleTexture = texture;
    particleSpec = spec;
    particleLifetime = isParticleLifecycle(spec) ? PARTICLE_LIFETIME : null;
    particleCursor = 0;

    system.setBlendMode(BlendModes.Normal);

    if (particleLifetime !== null) {
      // Linear fade over the life, the shared scene's one update rule. Every arm
      // applies the same one, so no arm is paying for an effect the others skip.
      // From the scene's alpha to zero. The module's default curve starts at 1,
      // which would make this arm's particles twice as bright as every other
      // arm's for the whole of their lives.
      system.addUpdateModule(
        new AlphaFadeOverLifetime(
          new Curve([
            { t: 0, v: PARTICLE_ALPHA },
            { t: 1, v: 0 },
          ]),
        ),
      );
    }

    root = new Container();
    root.addChild(system);

    fillParticles(nodeCount, true);

    for (let step = 0; step < (particleLifetime === null ? 0 : PARTICLE_PREROLL_STEPS); step += 1) {
      system.update(PARTICLE_STEP as Seconds);
      fillParticles(nodeCount, false);
    }
  };

  /** Drop the particle scene so a rebuild (or teardown) leaks no GPU resources. */
  const releaseParticles = (): void => {
    particleSystem?.destroy();
    particleSystem = null;
    particleTexture?.destroy();
    particleTexture = null;
    particleSpec = null;
    particleLifetime = null;
  };

  /** The blur scene's texture, kept so teardown releases it. */
  let blurTexture: Texture | null = null;

  /**
   * Build the blur scene: one textured quad under a separable two-pass Gaussian.
   *
   * A single quad on purpose - the archetype measures the filter's own target
   * passes, and a scene of nodes would mix traversal cost into a figure about an
   * effect. The node count is the filtered HEIGHT; the quad keeps a 16:9 shape,
   * so the count scales the area the blur has to cover.
   */
  const buildBlurScene = (spec: ArchetypeSpec, nodeCount: number): void => {
    const texture = new Texture(createBlurSourceCanvas());
    const sprite = new Sprite(texture);
    const height = nodeCount;
    const width = Math.round((height * 16) / 9);

    sprite.width = width;
    sprite.height = height;
    sprite.setPosition((VIEWPORT_WIDTH - width) / 2, (VIEWPORT_HEIGHT - height) / 2);

    root = new Container();
    root.addChild(sprite);
    // Nine taps at the archetype's reach: `quality` is taps per side, so 4 gives
    // the 4 + 1 + 4 the shared contract asks for.
    root.filters = [new BlurFilter({ radius: blurRadius(spec), quality: BLUR_TAPS_PER_SIDE })];

    blurTexture = texture;
  };

  /** Drop the blur scene's texture so a rebuild (or teardown) leaks nothing. */
  const releaseBlur = (): void => {
    blurTexture?.destroy();
    blurTexture = null;
  };

  /** Hit-test scene state, or nulls for every archetype that resolves no queries. */
  let pickingSpec: ArchetypeSpec | null = null;
  let pickTexture: Texture | null = null;
  /**
   * Hits the last block resolved.
   *
   * Published on the adapter so a smoke run can check that every arm resolved
   * the identical points to the identical answers - a picking row where one arm
   * silently searched a smaller scene would otherwise read as a faster index.
   */
  let pickHits = 0;

  /**
   * Build the picking scene: interactive rectangles on the shared layout, with
   * the engine's interaction index attached to them.
   *
   * `attachRoot` is what puts the nodes into that index, which is the structure
   * the comparison is actually about - without it the engine would walk the tree
   * per query and the row would measure a fallback rather than the feature.
   */
  const buildPickingScene = (spec: ArchetypeSpec, nodeCount: number): void => {
    const texture = new Texture(createParticleCanvas());
    const scene = new Container();

    for (let index = 0; index < nodeCount; index += 1) {
      const rect = new Sprite(texture);
      const at = pickRectAt(index);

      rect.width = PICK_RECT_SIZE;
      rect.height = PICK_RECT_SIZE;
      rect.setPosition(at.x, at.y);
      rect.interactive = true;
      scene.addChild(rect);
    }

    root = scene;
    pickTexture = texture;
    pickingSpec = spec;

    app!.interaction.attachRoot(scene);
  };

  /** Drop the picking scene so a rebuild (or teardown) leaks nothing. */
  const releasePicking = (): void => {
    if (pickingSpec !== null && root !== null) {
      app?.interaction.detachRoot(root);
    }

    pickTexture?.destroy();
    pickTexture = null;
    pickingSpec = null;
  };

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

      // Per `init` rather than per module load: arms share the page, so an arm
      // that does not override has to actively restore the engine's own margin.
      applyCullMarginOverride(cullMargin);

      const instance = new Application({
        canvas: { element: canvas, width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT, pixelRatio: 1 },
        // Pin the backend explicitly (never 'auto') so the harness measures the
        // backend the cell asked for, not whatever the environment prefers.
        backend: { type: backend },
        clearColor: Color.black,
        hello: false,
        // Registered for every cell, not only the tilemap ones: the extension
        // contributes renderer bindings rather than scene work, and an engine
        // configured differently per archetype would make two archetypes'
        // numbers describe two engines.
        extensions: [tilemapExtension, particlesExtension],
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

      releaseBatchScene();
      releaseComposite();
      releaseTilemap();
      releaseParticles();
      releaseBlur();
      releasePicking();
      sharedMeshGeometry?.destroy();
      sharedMeshGeometry = null;

      // The tilemap scenes leave the sprite path behind: the leaves are tiles in
      // a packed layer rather than nodes, so nothing below applies to them.
      if (isTilemap(spec)) {
        buildTilemapScene(spec, nodeCount);

        return;
      }

      // The particle scenes leave the sprite path behind too: their leaves live
      // in the system's own storage rather than in the scene graph.
      if (isParticles(spec)) {
        buildParticleScene(spec, nodeCount);

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

      // `instanced-batch` leaves the scene graph behind entirely: nodeCount
      // instances are laid out on the same grid every other archetype uses, but
      // submitted as ceil(nodeCount / batchSize) explicit drawBatch calls over one
      // shared geometry. No spine, no leaves, nothing to mutate.
      if (spec.batchSize !== undefined && spec.batchSize > 0) {
        buildBatchScene(spec, nodeCount);

        return;
      }

      // State-churn dimensions (see `ArchetypeSpec.blendModeCount` /
      // `materialCount`). Absent on every pre-existing archetype, which then
      // keeps exactly the old behaviour: one blend mode, no materials.
      const blendModeCount = Math.max(1, Math.min(spec.blendModeCount ?? 1, CYCLED_BLEND_MODES.length));
      const blendRunLength = Math.max(1, spec.blendRunLength ?? 1);
      const materialCount = Math.max(0, spec.materialCount ?? 0);
      const materialRunLength = Math.max(1, spec.materialRunLength ?? 1);
      const meshEvery = Math.max(0, spec.meshEvery ?? 0);
      const meshRunLength = Math.max(1, Math.min(spec.meshRunLength ?? 1, meshEvery));

      sharedMeshGeometry = spec.meshStorage === 'shared-static-geometry' ? createBatchQuad() : null;

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

      // A scrolling archetype lays its leaves out over a world LARGER than the
      // viewport (`spec.worldSpan`); every other archetype gets a world exactly
      // the size of the viewport, i.e. the pre-existing layout unchanged.
      const world = worldExtent(spec, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
      const layout = gridLayout(nodeCount, world.width, world.height, GRID_MARGIN);
      const overdraw = hasFullViewportLeaves(spec);
      const alpha = leafAlpha(spec);

      // Canonical, shared mutation selection: draw one RNG value per leaf in
      // index order and select when below `mutationFraction`. Using the shared
      // `selectMutationIndices` (rather than re-inlining the draw here) is what
      // makes the cross-arm fairness contract a single asserted code path (B3);
      // `mutationSignature()` below reports the exact set the harness verifies.
      const selectedIndices = selectMutationIndices(nodeCount, spec.mutationFraction, seed);
      const selectedSet = new Set(selectedIndices);
      const leaves: MutableLeaf[] = [];

      textGlyphs = isTextArchetype(spec) ? Math.max(1, Math.trunc(spec.textGlyphsPerNode ?? 0)) : 0;
      churning = isChurning(spec);
      textUpdating = isTextUpdating(spec);

      /** Resting grid position of leaf `index` - the origin every leaf is built at and the churn replacement returns to. */
      const leafPosition = (index: number): { x: number; y: number } => {
        if (overdraw) {
          return { x: 0, y: 0 };
        }

        return gridPosition(index, layout, GRID_MARGIN);
      };

      /**
       * Build (but do not parent) the leaf at global index `index`. Extracted from
       * the build loop because the churn archetype has to reproduce a leaf
       * mid-run, and reproducing it from a second, parallel construction site is
       * exactly how the replacement ends up differing from the leaf it replaces.
       */
      const makeLeaf = (index: number): Sprite | Mesh | Text => {
        const i = index;
        // Index the texture by the sprite's position WITHIN its spine bucket,
        // not by the global index. Leaves are round-robined across the spine via
        // `i % spine.length`, so a global `i % textureCount` would alias with
        // that stride: every bucket would collect a single residue class of `i`
        // and hence only a `textureCount / gcd(...)` subset of textures - each
        // traversal stream could then see fewer distinct textures than the
        // multi-texture batcher's slot count (16 as of the F9 slot raise), so
        // batches might never break on texture and the batch-breaking archetype
        // (24 textures, depth-2 spine) would not break batches at all. Cycling
        // per bucket position makes each stream sweep all textures, overflowing
        // the slots as intended.
        // Sprite/mesh interleave (see `ArchetypeSpec.meshEvery`): every Nth leaf
        // draws the same SPRITE_SIZE quad through the MESH renderer, so each one
        // costs a renderer switch out and back while nothing else about the
        // scene changes. Left unset, every leaf is a sprite - the pre-existing
        // shape.
        const leafTexture = textures[Math.floor(i / spine.length) % textures.length]!;
        const isMesh = meshEvery > 0 && i % meshEvery >= meshEvery - meshRunLength;

        let leaf: Sprite | Mesh | Text;

        if (textGlyphs > 0) {
          // A text archetype replaces the leaf entirely rather than decorating a
          // sprite with a label: the cost under study is the text node's own
          // layout and glyph path, and a sprite beside it would add per-node
          // quad cost to every arm's number for no comparative gain.
          leaf = createTextLeaf(i, textGlyphs);
        } else if (isMesh) {
          leaf = sharedMeshGeometry === null ? createArrayLeafMesh(leafTexture) : createStaticLeafMesh(leafTexture, sharedMeshGeometry);
        } else {
          leaf = new Sprite(leafTexture);
        }

        leaf.cullable = spec.cullingEnabled;

        // Blend-mode / material plateaus keyed on the GLOBAL leaf index, using
        // the same formula the Pixi arm uses, so both arms assign the identical
        // mode to the identical sprite and the resulting draw-call structure is
        // comparable. Left at the engine default when the archetype does not
        // set the dimension. Materials are a sprite-only dimension: the
        // `SpriteMaterial` instances built above have no mesh counterpart, and
        // no archetype combines `materialCount` with `meshRunLength`.
        if (blendModeCount > 1) {
          leaf.blendMode = CYCLED_BLEND_MODES[Math.floor(i / blendRunLength) % blendModeCount]!;
        }

        if (materials.length > 0 && leaf instanceof Sprite) {
          leaf.material = materials[Math.floor(i / materialRunLength) % materials.length]!;
        }

        // `overdraw` stacks nodeCount full-viewport quads at the origin to
        // force genuine fill-bound behaviour; every other archetype lays
        // sprites out on a grid at their native (SPRITE_SIZE) size.
        //
        // Using the native SPRITE_SIZE (8x8px) here would mean nodeCount
        // stacked sprites cover only ~64px^2 of overlap - negligible fill
        // (25k x 64px ~= 1.6M writes) contributing no fill-rate signal.
        // Stretching to
        // the full viewport (anchor defaults to (0,0)/top-left, so the quad is
        // positioned at the origin rather than centred, to actually cover the
        // visible area rather than half of it) makes nodeCount the real fill
        // multiplier: nodeCount x VIEWPORT_WIDTH x VIEWPORT_HEIGHT overdraw.
        // `overdraw` never sets `meshRunLength`, so this stays a sprite path.
        if (overdraw && leaf instanceof Sprite) {
          leaf.width = VIEWPORT_WIDTH;
          leaf.height = VIEWPORT_HEIGHT;
        }

        // A fixed leaf alpha is what makes a stack of full-viewport quads a
        // blend workload: every layer has to be composited rather than skipped.
        if (alpha < 1) {
          leaf.tint.a = alpha;
        }

        const { x, y } = leafPosition(i);

        leaf.setPosition(x, y);

        return leaf;
      };

      for (let i = 0; i < nodeCount; i++) {
        const leaf = makeLeaf(i);
        const parent = spine[i % spine.length]!;

        parent.addChild(leaf);

        // Mesh leaves have no mutable-leaf shape (the archetype that builds them
        // sets `mutationFraction: 0`, so `selectedSet` is empty there anyway).
        if (selectedSet.has(i) && !(leaf instanceof Mesh)) {
          const { x, y } = leafPosition(i);

          leaves.push({ node: leaf, parent, index: i, baseX: x, baseY: y });
        }
      }

      // Churn needs to reproduce a leaf mid-run; nothing else does, so the
      // factory is retained only for that archetype and the closure it captures
      // (textures, spine, layout) dies with the scene otherwise.
      rebuildLeaf = churning ? (index: number): Sprite | Text => makeLeaf(index) as Sprite | Text : null;

      // Post-process filter chain on the scene ROOT, so one chain covers the
      // whole scene and its depth - not the number of filtered subtrees - is the
      // measured axis.
      const chainDepth = filterChainDepth(spec);

      if (chainDepth > 0) {
        const chain: Filter[] = [];

        for (let link = 0; link < chainDepth; link++) {
          chain.push(createChainFilter(link));
        }

        // Ownership transfers to the node, which destroys the chain in its own
        // `destroy()` - so teardown must not destroy these a second time.
        sceneRoot.filters = chain;
      }

      // Nested rectangle masks, each inset inside its parent's rect (see
      // `world.ts::maskRect`) so no level is a no-op. Masking starts one level
      // BELOW the scene root, matching the Pixi arm - which has to keep its root
      // unmasked to host the mask sources - so both arms clip the identical set
      // of containers with the identical rects.
      const masks = Math.min(maskDepth(spec), spine.length - 1);

      maskedLevels = [];
      maskMotion = hasMaskMotion(spec);

      for (let level = 0; level < masks; level++) {
        const rect = maskRect(level, masks, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
        const container = spine[level + 1]!;

        container.mask = new Rectangle(rect.x, rect.y, rect.width, rect.height);
        maskedLevels.push({ container, base: rect });
      }

      const bloomRadius = compositeBlurRadius(spec);

      if (bloomRadius > 0) {
        buildComposite(sceneRoot, bloomRadius);
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

      // Park the camera on the frame-0 centre so the first warmup frame already
      // renders the scene the timed run will see, and so a previous scrolling
      // cell can never leave this one's view off its world.
      scrollingSpec = isScrolling(spec) ? spec : null;

      const start = cameraCenterAt(spec, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

      app.rendering.view.setCenter(start.x, start.y);
    },

    pickHits(): number {
      return pickHits;
    },

    mutationSignature(): string {
      return mutationSignature(mutableIndices);
    },

    mutate(frame: number): void {
      // Picking scene: one block of point queries through the engine's own
      // public query, inside the bracket because resolving them IS the frame's
      // work here. The hit count is kept so a smoke run can check that every arm
      // resolved the same points to the same answers.
      if (pickingSpec !== null && app !== null) {
        const queries = pointerQueriesPerFrame(pickingSpec);
        let hits = 0;

        for (let index = 0; index < queries; index += 1) {
          const point = pickPointAt(index, queries);

          if (app.interaction.nodeAt(point.x, point.y) !== null) {
            hits += 1;
          }
        }

        pickHits = hits;

        return;
      }

      // Particle scenes: the lifecycle one advances the simulation and tops the
      // pool back up, both inside the bracket, because ageing, moving, fading and
      // respawning ARE the per-frame work it measures. The draw-only scene
      // advances nothing - it submits the same quads every frame by design.
      if (particleSpec !== null && particleSystem !== null) {
        if (particleLifetime !== null) {
          particleSystem.update(PARTICLE_STEP as Seconds);
          fillParticles(particleSystem.capacity, false);
        }

        return;
      }

      // Tilemap scenes: move the window, then submit this frame's tile changes.
      // Both belong in the bracket - scrolling and editing ARE the per-frame work
      // these scenes do, and an edit an arm defers past the draw would not be an
      // edit the frame paid for.
      if (tilemapSpec !== null && app !== null && tileLayer !== null) {
        const camera = tilemapCameraAt(tilemapCameraFrameFor(tilemapSpec, frame), tilemapMapExtent);

        app.rendering.view.setCenter(camera.x + VIEWPORT_WIDTH / 2, camera.y + VIEWPORT_HEIGHT / 2);

        if (isTilemapEditing(tilemapSpec)) {
          const tileset = tileLayer.tilesets[0]!;

          for (const edit of tilemapEditsAt(frame, tilemapMapExtent)) {
            tileLayer.setTileAt(edit.x, edit.y, { tileset, localTileId: edit.tileId, transform: TILE_TRANSFORM_IDENTITY });
          }
        }

        return;
      }

      // Camera step for a scrolling archetype. Both this and the wobble below
      // run inside the harness's CPU bracket, which is correct: moving the
      // camera IS the per-frame work such a scene does.
      if (scrollingSpec !== null && app !== null) {
        const centre = cameraCenterAt(scrollingSpec, frame, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

        app.rendering.view.setCenter(centre.x, centre.y);
      }

      // Mask motion: every rect is re-assigned at a wobbled offset. A fresh
      // rectangle each time, because a mask is keyed by identity - mutating the
      // one already assigned would change nothing the engine can see.
      if (maskMotion) {
        const { dx, dy } = wobbleOffsetAt(frame);

        for (const { container, base } of maskedLevels) {
          container.mask = new Rectangle(base.x + dx, base.y + dy, base.width, base.height);
        }
      }

      // Structural churn: destroy each selected leaf and build its replacement in
      // the same place. `destroy()` detaches the node from its parent itself, so
      // the tree is never left holding a destroyed child.
      if (churning && rebuildLeaf !== null) {
        for (const leaf of mutableLeaves) {
          leaf.node.destroy();

          const replacement = rebuildLeaf(leaf.index);

          leaf.parent.addChild(replacement);
          leaf.node = replacement;
        }

        return;
      }

      // Text invalidation: re-set the string, which discards that leaf's layout
      // and glyph run. The frame index shifts the run so no leaf ever re-sets the
      // string it already has - an unchanged assignment is free on both arms and
      // would measure nothing.
      if (textUpdating) {
        for (const leaf of mutableLeaves) {
          if (leaf.node instanceof Text) {
            leaf.node.text = textForLeaf(leaf.index + frame, textGlyphs);
          }
        }

        return;
      }

      const { dx, dy } = wobbleOffsetAt(frame);

      for (const leaf of mutableLeaves) {
        leaf.node.setPosition(leaf.baseX + dx, leaf.baseY + dy);
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
      if (app === null) {
        throw new Error('renderFrame was called before buildScene.');
      }

      const backend = app.backend;

      // Exactly the production render phase: reset the frame-scoped stats /
      // transform buffer, clear, render the tree once (or once per
      // `split-screen` view - see `buildScene`/`views`), flush the batch.
      backend.resetStats();
      backend.clear();

      // `instanced-batch`: one explicit submission per batch, no scene walk.
      // The trailing flush below is what ends the frame - drawBatch leaves the
      // backend's pass open so consecutive calls share one submit, which is the
      // property this archetype exists to measure.
      if (batches.length > 0) {
        for (const batch of batches) {
          app.rendering.drawBatch(batch);
        }

        backend.flush();

        return;
      }

      if (root === null) {
        throw new Error('renderFrame was called before buildScene.');
      }

      // `composite`: the bloom stack renders the frame itself (capture, blur,
      // direct draw, additive overlay), so the ordinary single render below
      // would be a fifth, redundant scene walk.
      if (compositePipeline !== null) {
        compositePipeline.execute(app.rendering);
        backend.flush();

        return;
      }

      if (views.length > 0) {
        // Multi-view replay: each additional view re-issues the retained
        // group's ALREADY-RECORDED instruction set with its own view/viewport,
        // not a fresh per-view scene walk - the property `split-screen` exists
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
      releaseBatchScene();
      releaseComposite();
      releaseTilemap();
      releaseParticles();

      if (root !== null) {
        root.destroy();
        root = null;
      }

      sharedMeshGeometry?.destroy();
      sharedMeshGeometry = null;

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
      scrollingSpec = null;
      maskedLevels = [];
      maskMotion = false;
      rebuildLeaf = null;
      churning = false;
      textUpdating = false;
      textGlyphs = 0;

      if (app !== null) {
        app.destroy();
        app = null;
      }
    },
  };
};
