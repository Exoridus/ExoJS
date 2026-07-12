/** Rendering backend under test. */
export type Backend = 'webgl2' | 'webgpu';

/** Identifier for one of the fixed set of scene archetypes exercised by the benchmark. */
export type ArchetypeId = 'static-heavy' | 'dynamic-heavy' | 'deep-hierarchy' | 'overdraw' | 'batch-breaking';

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
  /** Whether frustum/off-screen culling is enabled for this archetype. */
  readonly cullingEnabled: boolean;
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

/** Measured outcome for a single matrix cell. */
export interface CellResult {
  /** The cell this result belongs to. */
  readonly spec: CellSpec;
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
  /** Whether the cell completed normally, exceeded a budget, or could not be measured. */
  readonly status: 'ok' | 'exceeded' | 'unavailable';
  /** Optional free-text note explaining a non-`'ok'` status. */
  readonly note?: string;
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
   * rather than a manual contract (review B3). Optional: an arm that omits it is
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
