import { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Matrix } from '#math/Matrix';
import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import { ColorMatrixFilter } from '#rendering/filters/ColorMatrixFilter';
import type { Filter } from '#rendering/filters/Filter';
import { Geometry } from '#rendering/geometry/Geometry';
import { ShaderSource } from '#rendering/material/ShaderSource';
import { SpriteMaterial } from '#rendering/material/SpriteMaterial';
import { Mesh } from '#rendering/mesh/Mesh';
import { RenderPlanBuilder } from '#rendering/plan/RenderPlanBuilder';
import { RenderBackendType } from '#rendering/RenderBackendType';
import { RenderBatch } from '#rendering/RenderBatch';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { Sprite } from '#rendering/sprite/Sprite';
import { spriteVertexGlsl } from '#rendering/sprite/spriteMaterialSources';
import { Text } from '#rendering/text/Text';
import { Texture } from '#rendering/texture/Texture';
import { BlendModes } from '#rendering/types';
import { View } from '#rendering/View';
import type { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { mutationSignature, selectMutationIndices, wobbleOffsetAt } from '../../shared/mutation';
import type { ArchetypeSpec, Backend, EngineAdapter } from '../EngineAdapter';
import { createDistinctTextureCanvas, TEXT_FONT_SIZE } from '../sceneAssets';
import { filterChainDepth, isChurning, isTextArchetype, isTextUpdating, maskDepth, textForLeaf } from '../traits';
import {
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
    shader: new ShaderSource({ glsl: { vertex: spriteVertexGlsl, fragment: materialFragmentGlsl }, wgsl: materialFragmentWgsl }),
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
  /** Characters per text leaf of the built archetype; `0` when it has no text. */
  let textGlyphs = 0;

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
      sharedMeshGeometry?.destroy();
      sharedMeshGeometry = null;

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
      const overdraw = spec.id === 'overdraw';

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

      for (let level = 0; level < masks; level++) {
        const rect = maskRect(level, masks, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

        spine[level + 1]!.mask = new Rectangle(rect.x, rect.y, rect.width, rect.height);
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

    mutationSignature(): string {
      return mutationSignature(mutableIndices);
    },

    mutate(frame: number): void {
      // Camera step for a scrolling archetype. Both this and the wobble below
      // run inside the harness's CPU bracket, which is correct: moving the
      // camera IS the per-frame work such a scene does.
      if (scrollingSpec !== null && app !== null) {
        const centre = cameraCenterAt(scrollingSpec, frame, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

        app.rendering.view.setCenter(centre.x, centre.y);
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
