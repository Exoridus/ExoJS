import type { BaseCellResult } from '../shared/result';

/** Rendering backend under test. */
export type Backend = 'webgl2' | 'webgpu';

/** Identifier for one of the fixed set of scene archetypes exercised by the benchmark. */
export type ArchetypeId =
  | 'static-heavy'
  | 'dynamic-heavy'
  | 'deep-hierarchy'
  | 'overdraw'
  | 'batch-breaking'
  | 'batch-breaking-atlased'
  | 'split-screen'
  | 'mixed-blend'
  | 'mixed-material'
  | 'mixed-material-atlased'
  | 'instanced-batch'
  | 'mixed-sprite-mesh-array'
  | 'mixed-sprite-mesh-static';

/** Structural definition of a scene archetype, independent of any engine or backend. */
export interface ArchetypeSpec {
  /** Archetype identifier. */
  readonly id: ArchetypeId;
  /** Node counts swept for this archetype, smallest to largest. */
  readonly nodeCounts: readonly number[];
  /** Depth of the parent-child nesting used to build the scene. */
  readonly nestingDepth: number;
  /** Number of distinct textures referenced by the scene. */
  readonly textureCount: number;
  /** Fraction of nodes mutated per frame, in 0..1. */
  readonly mutationFraction: number;
  /**
   * Whether frustum/off-screen culling is enabled for this archetype (drives
   * `.cullable` on every spine container and leaf sprite in both adapters).
   * Currently `false` for every archetype in `archetypes.ts`: keeping every
   * archetype's sprites on-screen means a cull
   * check can only ever be a no-op there, and the two engines do NOT pay the
   * same cost for an identically-set flag. ExoJS's `cullable` drives a real
   * per-node bounds+intersection check in the render walk
   * (`SceneNode.inView`); Pixi's `cullable` is inert unless the app registers
   * `CullerPlugin` (or `Culler.shared.cull(...)` is called explicitly), which
   * `adapters/pixi.ts` does not do. Leaving this `true` therefore adds
   * cull-walk overhead to the ExoJS arm with no matching cost on the Pixi arm.
   * If a future archetype needs genuine off-screen content, either give Pixi
   * an equivalent `CullerPlugin` registration before flipping this back to
   * `true`, or disclose the asymmetry explicitly in the report.
   */
  readonly cullingEnabled: boolean;
  /**
   * Number of simultaneous `View`s the scene is rendered through per frame
   * (the `split-screen` archetype). `undefined`/`1` means the ordinary
   * single-view render every other archetype uses. Only the `exojs` adapter
   * honours this field (it builds and renders through the extra `View`
   * instances); a competitor arm without a comparable multi-viewport API
   * renders its normal single-view scene instead, so `split-screen` is an
   * ExoJS-internal structural probe, not a cross-arm wall-clock comparison —
   * see `adapters/exojs.ts` and the archetype's doc comment in
   * `archetypes.ts`.
   */
  readonly viewCount?: number;
  /**
   * Number of distinct fixed-function blend modes cycled across the scene's
   * leaves. `undefined`/`1` means every leaf keeps the engine's default
   * (`Normal`), which is what every pre-existing archetype does.
   *
   * The mode for leaf `i` is `floor(i / blendRunLength) % blendModeCount`, so
   * the scene contains long same-mode runs rather than alternating per sprite —
   * a per-sprite alternation would degenerate to one draw call per sprite on
   * ANY batcher and would measure nothing but flush overhead. Only modes with a
   * fixed-function GPU blend equation are used (normal / add / multiply /
   * screen), because those exist on both arms; the engine's backdrop-aware
   * "advanced" modes have no Pixi equivalent that costs the same, so including
   * them would make the arms incomparable.
   */
  readonly blendModeCount?: number;
  /** Run length (in leaf index space) of one blend-mode plateau; see {@link blendModeCount}. */
  readonly blendRunLength?: number;
  /**
   * Number of distinct custom sprite materials cycled across the scene's
   * leaves, or `undefined`/`0` for the default (material-less) sprite path.
   *
   * ExoJS-ONLY, like `viewCount`: Pixi 8 has no per-Sprite custom-shader API
   * (its equivalent is a `Mesh` with its own `Shader`, a different geometry
   * path entirely), so the Pixi arm renders the same scene WITHOUT materials.
   * An archetype that sets this is therefore an ExoJS-internal probe on the
   * material dimension — read it against the otherwise-identical
   * `mixed-blend` archetype to isolate the custom-material cost — and NOT a
   * cross-arm wall-clock comparison.
   */
  readonly materialCount?: number;
  /** Run length (in leaf index space) of one material plateau; see {@link materialCount}. */
  readonly materialRunLength?: number;
  /**
   * Instances per explicit `RenderingContext.drawBatch` submission. Setting it
   * switches the scene away from a sprite tree entirely: the archetype builds
   * `ceil(nodeCount / batchSize)` {@link RenderBatch}es over one shared geometry
   * and issues one `drawBatch` call each, per frame.
   *
   * ExoJS-ONLY, like `viewCount` and `materialCount`, and more strictly so: an
   * explicit instanced-submission API has no Pixi counterpart at all, so the
   * competitor arm renders the equivalent sprite scene instead and its numbers
   * carry NO cross-arm meaning on this archetype. It exists to measure the
   * immediate batch path's per-call CPU and submit cost, which no scene-graph
   * archetype reaches.
   */
  readonly batchSize?: number;
  /**
   * Spacing, in leaf index space, at which a single {@link Mesh} leaf replaces a
   * sprite: leaf `i` is a mesh when `i % meshEvery === meshEvery - 1`.
   * `undefined` keeps the sprite-only scene every other archetype builds.
   *
   * Renderer SWITCHES are the measured dimension, so the scene is deliberately
   * lopsided — long sprite runs punctuated by one mesh — rather than two equal
   * plateaus. Equal plateaus would fill half the frame with mesh leaves, and the
   * default mesh path costs one draw call per leaf, so the measurement would be
   * swamped by per-mesh draw-call cost and say nothing about the switch. One
   * mesh per run puts `~nodeCount / meshEvery` switch PAIRS in the frame while
   * keeping the mesh draw-call count in the same order as the sprite batch
   * count.
   *
   * On WebGPU each switch used to end the open render pass and `queue.submit`,
   * and the mesh renderer ended its own pass again at the tail of every flush —
   * so the frame's submit count scaled with the switch count.
   *
   * ExoJS-ONLY, like `viewCount` and `materialCount` — a competitor arm builds
   * its ordinary sprite scene instead, so this archetype carries no cross-arm
   * meaning.
   */
  readonly meshEvery?: number;
  /** Consecutive mesh leaves at each {@link meshEvery} boundary; defaults to one. */
  readonly meshRunLength?: number;
  /**
   * Storage form used by mesh leaves. Array meshes exercise per-leaf packing
   * and retained-cache poisoning; shared static geometry exercises replayable
   * renderer switches. Meaningful only when {@link meshEvery} is set.
   */
  readonly meshStorage?: 'array' | 'shared-static-geometry';
}

/** One matrix cell: a single (engine, config, backend, archetype, node count) combination to measure. */
export interface CellSpec {
  /** Engine label, e.g. `'exojs'` or `'reference'`. */
  readonly engine: string;
  /** Engine configuration label, e.g. `'current'`. */
  readonly config: string;
  /** Rendering backend for this cell. */
  readonly backend: Backend;
  /** Archetype identifier for this cell. */
  readonly archetype: ArchetypeId;
  /** Node count for this cell. */
  readonly nodeCount: number;
  /** Number of frames timed for this cell, per {@link timedFramesFor}. */
  readonly timedFrames: number;
  /**
   * Number of discarded warmup frames run before timing starts, per
   * {@link warmupFramesFor}: scales up with node count so the
   * necessarily-short timed window at large N is not diluted by residual
   * shader-compile/texture-upload/JIT settling cost.
   */
  readonly warmupFrames: number;
}

/** Draw-call and state-change counters gathered for a single cell. */
export interface StructuralCounters {
  /** Number of draw calls issued. */
  drawCalls: number;
  /** Number of texture bind operations. */
  textureBinds: number;
  /** Number of buffer upload operations. */
  bufferUploads: number;
}

/**
 * Measured outcome for a single matrix cell. Extends the domain-agnostic
 * {@link BaseCellResult} (spec/status/note) with the rendering-specific timing
 * fields (per-frame CPU + full-frame GPU medians/p95) and structural counters.
 */
export interface CellResult extends BaseCellResult<CellSpec> {
  /** Median per-frame CPU time in milliseconds. */
  readonly cpuMsMedian: number;
  /** 95th-percentile per-frame CPU time in milliseconds. */
  readonly cpuMsP95: number;
  /** Median full-frame GPU time in milliseconds, or null when unavailable. */
  readonly frameMsMedian: number | null;
  /** 95th-percentile full-frame GPU time in milliseconds, or null when unavailable. */
  readonly frameMsP95: number | null;
  /** Structural draw-call counters gathered while measuring this cell. */
  readonly structural: StructuralCounters;
}

/** Neutral contract an engine arm implements so the harness can drive it identically across arms. */
export interface EngineAdapter {
  /** Engine label, e.g. `'exojs'` or `'reference'`. */
  readonly engine: string;
  /** Engine configuration label, e.g. `'current'`. */
  readonly config: string;
  /** Whether this adapter supports the given backend. */
  supports(backend: Backend): boolean;
  /** Initialize the engine against the given canvas and backend. */
  init(canvas: HTMLCanvasElement, backend: Backend): Promise<void>;
  /** Build a scene for the given archetype, node count, and RNG seed. */
  buildScene(spec: ArchetypeSpec, nodeCount: number, seed: number): void;
  /** Apply the archetype's per-frame mutation for the given frame index. */
  mutate(frame: number): void;
  /** Render a single frame. */
  renderFrame(): void;
  /** Release resources held by the current scene and engine instance. */
  teardown(): void;
  /**
   * Order-sensitive signature of the mutation-index set the most recent
   * {@link buildScene} selected (see `mutation.ts::mutationSignature`). The
   * harness compares it against the canonical selection for the cell and fails
   * loudly on any divergence, so the cross-arm comparison rests on an assertion
   * rather than a manual contract. Optional: an arm that omits it is
   * skipped with a warning, leaving its determinism unverified rather than
   * blocking the run.
   */
  mutationSignature?(): string;
  /**
   * The live WebGPU device when this adapter was initialised on the `'webgpu'`
   * backend, so the harness can attach a structural probe to it — unlike a
   * WebGL2 context (recoverable from the canvas via `getContext('webgl2')`),
   * the device is not otherwise reachable from outside the engine. Returns
   * `null` on other backends or before {@link init}. Optional: engines that
   * never run WebGPU may omit it.
   */
  gpuDevice?(): GPUDevice | null;
}
