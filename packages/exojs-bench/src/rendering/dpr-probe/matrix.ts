/**
 * Cell matrix, result shape and serialization for the manual DPR / internal
 * render-target probe (`NEU-S4`).
 *
 * Pure data + pure functions on purpose: everything here is exercised from a
 * Node test, while the engine-touching halves (`scenes.ts`, `page/probe.ts`) can
 * only run in a browser.
 */

/** One scene the probe can render. */
export type ProbeSceneId = 'baseline' | 'color-filter' | 'blur' | 'cache-texture' | 'overdraw';

/**
 * Which internal-target sizing rule a cell renders under.
 *
 * - `current` — today's production contract, untouched: an effect / cache target
 *   is `ceil(logical bounds)` texels regardless of the surface's resolution.
 * - `parent-resolution` — the BENCH-ONLY probe of the hypothetical `NEU-S4`
 *   correction: the same target at `logical size × parent effective resolution`.
 *   It exists to price the correction, not to implement it (see
 *   `instrumentation.ts`).
 */
export type ProbeMode = 'current' | 'parent-resolution';

/** Static description of a probe scene. */
export interface ProbeSceneSpec {
  readonly id: ProbeSceneId;
  /** Button label on the probe page. */
  readonly label: string;
  /**
   * Whether the scene allocates an internal effect / cache render target. Only
   * these scenes have a meaningful `parent-resolution` arm; the others would
   * measure the identical work twice.
   */
  readonly usesInternalTarget: boolean;
  /** What the scene is for, shown on the page so the tester knows what to look at. */
  readonly purpose: string;
}

/**
 * The probe's scenes, in run order.
 *
 * Deliberately small (§2 of the brief). `baseline` isolates the DPR difference
 * of the MAIN surface with no effect involved; the three effect scenes each
 * create exactly one class of internal target; `overdraw` is the only fill-rate
 * ladder, kept because fill rate is the axis DPR actually multiplies and no
 * other scene exposes it.
 */
export const PROBE_SCENES: readonly ProbeSceneSpec[] = [
  {
    id: 'baseline',
    label: 'Baseline',
    usesInternalTarget: false,
    purpose: 'Sharp geometric edges, a sprite and small SDF text, no effect — the DPR difference of the main surface alone.',
  },
  {
    id: 'color-filter',
    label: 'Color filter',
    usesInternalTarget: true,
    purpose: 'One ColorFilter over the baseline content — the simplest internal render target.',
  },
  {
    id: 'blur',
    label: 'Blur',
    usesInternalTarget: true,
    purpose: 'One BlurFilter over the baseline content — a fill-rate / bandwidth sensitive effect on the same target.',
  },
  {
    id: 'cache-texture',
    label: 'cacheAsTexture',
    usesInternalTarget: true,
    purpose:
      'The baseline content behind cacheAsTexture — the case the audit expects to lose visible sharpness on HiDPI. Static (a cache is baked once and replayed) and WITHOUT the text nodes: a cacheAsTexture container containing Text draws nothing at all on WebGL2, which is the backend every iOS browser uses.',
  },
  {
    id: 'overdraw',
    label: 'Overdraw',
    usesInternalTarget: false,
    purpose: 'Stacked full-stage quads — the fill-rate ladder DPR multiplies quadratically.',
  },
];

/**
 * Device pixel ratios every scene is measured at.
 *
 * `3` is the iPhone 13 Pro's native ratio and is reachable only by passing
 * `canvas.pixelRatio` explicitly — the engine's `auto` policy clamps to 2
 * (`Application.resolveAutoPixelRatio`), which is exactly the default under
 * question here.
 */
export const PROBE_PIXEL_RATIOS: readonly number[] = [1, 1.5, 2, 3];

/** One measured cell of the matrix. */
export interface ProbeCell {
  readonly scene: ProbeSceneId;
  readonly mode: ProbeMode;
  readonly pixelRatio: number;
}

/**
 * Build the run order.
 *
 * Ordered scene → mode → ASCENDING pixel ratio, so the four ratios of one
 * (scene, mode) pair are adjacent in time. That is the comparison the probe
 * exists to make, and adjacency is what keeps a slow thermal drift from being
 * read as a DPR cost. The drift itself stays auditable: every result carries its
 * ordinal and its offset from the run start.
 */
export const buildProbeMatrix = (
  scenes: readonly ProbeSceneSpec[] = PROBE_SCENES,
  pixelRatios: readonly number[] = PROBE_PIXEL_RATIOS,
): ProbeCell[] => {
  const cells: ProbeCell[] = [];

  for (const scene of scenes) {
    const modes: readonly ProbeMode[] = scene.usesInternalTarget ? ['current', 'parent-resolution'] : ['current'];

    for (const mode of modes) {
      for (const pixelRatio of pixelRatios) {
        cells.push({ scene: scene.id, mode, pixelRatio });
      }
    }
  }

  return cells;
};

/** One class of internal render target a cell allocated, aggregated over the measured frames. */
export interface InternalTargetRecord {
  /**
   * `pooled` — obtained from `backend.acquireRenderTexture` (filter input /
   * filter output / mask). `cache` — the node-owned `cacheAsTexture` texture.
   */
  readonly kind: 'pooled' | 'cache';
  /** Width the engine asked for, i.e. `ceil` of the barrier's logical bounds. */
  readonly logicalWidth: number;
  /** Height the engine asked for. */
  readonly logicalHeight: number;
  /** Width actually allocated (equal to `logicalWidth` in `current` mode). */
  readonly actualWidth: number;
  /** Height actually allocated. */
  readonly actualHeight: number;
  /** How often a target of this exact shape was allocated during the measured window. */
  readonly count: number;
}

/** Everything the probe measured for one cell. */
export interface ProbeCellResult {
  /** Position in the run order — 0-based, ascending, never reused. */
  readonly index: number;
  /** Milliseconds between the start of the whole run and the start of this cell's measured window. */
  readonly startOffsetMs: number;
  readonly scene: ProbeSceneId;
  readonly mode: ProbeMode;
  /** `pixelRatio` handed to `new Application({ canvas: { pixelRatio } })`. */
  readonly configuredPixelRatio: number;
  /** `Application.pixelRatio` as the engine resolved it (must equal `configuredPixelRatio`). */
  readonly enginePixelRatio: number | null;
  /** CSS size of the canvas element, in CSS pixels. */
  readonly cssWidth: number;
  readonly cssHeight: number;
  /** Backing-store size of the canvas element, in device pixels. */
  readonly backingWidth: number;
  readonly backingHeight: number;
  /** `backingWidth × backingHeight` — the main surface's pixel count. */
  readonly mainPixelCount: number;
  /** Every distinct internal target shape this cell allocated. Empty for the effect-free scenes. */
  readonly internalTargets: readonly InternalTargetRecord[];
  /**
   * Total internal-target pixels divided by {@link mainPixelCount}, or `null`
   * when the cell allocated none. This is the number `NEU-S4` is about: under
   * `current` it falls by `1/pixelRatio²` as the surface grows.
   */
  readonly internalToMainPixelRatio: number | null;
  /** Frames rendered before the measured window opened. */
  readonly warmupFrames: number;
  /** Frames inside the measured window. */
  readonly measuredFrames: number;
  /** Wall clock of the measured window, in milliseconds. */
  readonly measuredMs: number;
  /** Per-frame CPU time (`render` + `flush`), milliseconds. */
  readonly cpuMsMedian: number | null;
  readonly cpuMsP95: number | null;
  /**
   * Per-frame HARDWARE GPU time, or `null` when no hardware clock existed. Never
   * derived from frame cadence — see {@link ProbeResult.gpuTimerSource}.
   */
  readonly gpuMsMedian: number | null;
  readonly gpuMsP95: number | null;
  /**
   * Interval between consecutive `requestAnimationFrame` callbacks. This is
   * PRESENTATION CADENCE, not GPU time: on a vsync-paced phone it reads ~16.7ms
   * for any scene the device keeps up with, and only rises once it does not.
   */
  readonly rafDeltaMsMedian: number | null;
  readonly rafDeltaMsP95: number | null;
  /** Anything that went wrong in this cell. A non-empty list makes the numbers suspect. */
  readonly errors: readonly string[];
}

/** The whole probe run, i.e. what `Copy JSON` puts on the clipboard. */
export interface ProbeResult {
  /** Bumped whenever a field changes meaning, so old captures stay readable. */
  readonly schemaVersion: number;
  /** Commit the probe was served from, stamped by the Node serve script. */
  readonly gitSha: string;
  /** ExoJS version from the repository manifest. */
  readonly engineVersion: string;
  /** ISO timestamp taken when the run finished. */
  readonly timestamp: string;
  /** Raw `navigator.userAgent`. Never parsed into a device name — see {@link deviceLabel}. */
  readonly userAgent: string;
  /**
   * Device name the TESTER typed into the probe page. The user agent is not
   * consulted for it: Safari's UA names no iPhone model, and guessing one would
   * put a fabricated fact into a measurement record.
   */
  readonly deviceLabel: string;
  /** Free-text note the tester typed (thermal state, orientation, …). */
  readonly testerNote: string;
  /** The host's own `window.devicePixelRatio`. */
  readonly devicePixelRatio: number;
  /**
   * What the engine's `auto` policy WOULD pick here — `min(devicePixelRatio, 2)`
   * (`Application.resolveAutoPixelRatio`). Recorded so the "is the default
   * sensible" question can be answered from the capture alone.
   */
  readonly engineAutoPixelRatio: number;
  /** Backend the tester asked the probe for. */
  readonly backendRequested: 'auto' | 'webgl2' | 'webgpu';
  /** Backend the engine actually initialised (`RenderBackend.backendType`). */
  readonly backendSelected: string;
  /**
   * Whether the granted WebGPU device exposed `timestamp-query`; `null` on a
   * WebGL2 run, where the question does not apply.
   */
  readonly webgpuTimestampQuery: boolean | null;
  /** Where the `gpuMs*` columns came from, or why they are null. */
  readonly gpuTimerSource: string;
  /** `crossOriginIsolated` — false means `performance.now()` is coarsened. */
  readonly crossOriginIsolated: boolean;
  /** Smallest non-zero `performance.now()` delta observed on this device, in milliseconds. */
  readonly timerResolutionMs: number;
  /** Logical (CSS) stage size every cell renders at. */
  readonly stageWidth: number;
  readonly stageHeight: number;
  /** Results, in run order. */
  readonly cells: readonly ProbeCellResult[];
  /** Caveats that apply to the whole capture. */
  readonly notes: readonly string[];
}

/**
 * Current {@link ProbeResult.schemaVersion}.
 *
 * `2` renamed the cache scene's id from `cache-bitmap` to `cache-texture`,
 * following the engine's `cacheAsBitmap` → `cacheAsTexture` rename. A version-1
 * capture is otherwise field-for-field identical and stays comparable; only the
 * scene id differs.
 */
export const PROBE_SCHEMA_VERSION = 2;

/**
 * Total pixels across every internal target a cell allocated, counting each
 * allocation (a two-filter chain allocates twice and costs twice).
 */
export const totalInternalTargetPixels = (records: readonly InternalTargetRecord[]): number =>
  records.reduce((sum, record) => sum + record.actualWidth * record.actualHeight * record.count, 0);

/**
 * Internal-target pixels relative to the main surface, or `null` when the cell
 * allocated no internal target (rather than `0`, which would read as "allocated
 * nothing measurable" and average into a summary as if it were data).
 */
export const internalToMainPixelRatio = (records: readonly InternalTargetRecord[], mainPixelCount: number): number | null => {
  if (records.length === 0 || mainPixelCount <= 0) {
    return null;
  }

  return totalInternalTargetPixels(records) / mainPixelCount;
};

/** Stable, human-diffable serialization of a capture. */
export const serializeProbeResult = (result: ProbeResult): string => JSON.stringify(result, null, 2);
