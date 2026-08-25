/**
 * Cell matrix, result shape and serialization for the manual DPR / internal
 * render-target probe.
 *
 * Pure data + pure functions on purpose: everything here is exercised from a
 * Node test, while the engine-touching halves (`scenes.ts`, `page/probe.ts`) can
 * only run in a browser.
 */

/** One scene the probe can render. */
export type ProbeSceneId = 'baseline' | 'color-filter' | 'blur' | 'cache-texture' | 'cache-dirty' | 'overdraw' | 'text-ratio';

/**
 * Which internal-target resolution a cell renders under.
 *
 * Both arms are now ordinary production settings - internal targets inherit the
 * surface resolution, and the
 * bench-only sizing hook it was measured with is gone:
 *
 * - `inherit` - the default. `Filter.resolution` / `RenderNode.cacheResolution`
 *   left at `'inherit'`, so an internal target matches the surface resolution.
 * - `logical` - both pinned to `1`, which reproduces the pre-inheritance behaviour
 *   exactly and is what a user picks to trade sharpness for fill rate.
 *
 * The comparison is therefore no longer "today vs a hypothetical fix" but "the
 * new default vs the escape hatch", which is the decision a user actually makes.
 */
export type ProbeMode = 'inherit' | 'logical';

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
 * Deliberately small. `baseline` isolates the DPR difference
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
    purpose: 'One ColorMatrixFilter over the baseline content — the simplest internal render target.',
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
      'The baseline content behind cacheAsTexture, baked once and replayed — the case that used to lose visible sharpness on HiDPI. WITHOUT the text nodes: a cacheAsTexture container containing Text draws nothing at all on WebGL2, which is the backend every iOS browser uses.',
  },
  {
    id: 'cache-dirty',
    label: 'cacheAsTexture (dirty)',
    usesInternalTarget: true,
    purpose:
      'The same cached content, but moved every frame so its world bounds change and the cache re-bakes. This is the cost the static scene cannot measure, and the one that scales with the target resolution.',
  },
  {
    id: 'overdraw',
    label: 'Overdraw',
    usesInternalTarget: false,
    purpose: 'Stacked full-stage quads — the fill-rate ladder DPR multiplies quadratically.',
  },
  {
    id: 'text-ratio',
    label: 'Text pixelRatio',
    usesInternalTarget: false,
    purpose:
      'Runtime SDF text at 9, 11 and 16px, rasterized at an explicit `Text.pixelRatio`. Answers what raising the TEXT raster density alone buys, without paying for a denser main surface.',
  },
];

/**
 * Device pixel ratios every scene is measured at.
 *
 * `3` is the iPhone 13 Pro's native ratio and is reachable only by passing
 * `canvas.pixelRatio` explicitly - the engine's `auto` policy clamps to 2
 * (`Application.resolveAutoPixelRatio`), which is exactly the default under
 * question here.
 */
export const PROBE_PIXEL_RATIOS: readonly number[] = [1, 1.5, 2, 3];

/** One measured cell of the matrix. */
export interface ProbeCell {
  readonly scene: ProbeSceneId;
  readonly mode: ProbeMode;
  readonly pixelRatio: number;
  /**
   * `Text.pixelRatio` handed to the scene's text nodes, or omitted to let them
   * INHERIT the application's ratio - which is the shipped default and what
   * every other scene runs.
   *
   * Only the `text-ratio` scene sets it. The interesting comparison is not a
   * ladder but four named pairs (see {@link TEXT_RATIO_CELLS}), so this axis is
   * enumerated rather than crossed with {@link PROBE_PIXEL_RATIOS}.
   */
  readonly textPixelRatio?: number;
}

/**
 * The four cells of the text-density comparison, in run order.
 *
 * A → B → C hold the SURFACE at 2 and raise only the glyph raster; D raises the
 * whole surface to 3 as well. Reading them in that order answers the question
 * the iPhone measurement left open: how much of the sharpness a DPR-3 surface
 * buys for small text can be had by rasterizing the glyphs at 3 while the rest
 * of the frame stays at 2 - which is the trade a phone actually cares about,
 * since fill rate scales with the surface and not with the atlas.
 */
export const TEXT_RATIO_CELLS: readonly ProbeCell[] = [
  { scene: 'text-ratio', mode: 'inherit', pixelRatio: 2, textPixelRatio: 1 },
  { scene: 'text-ratio', mode: 'inherit', pixelRatio: 2, textPixelRatio: 2 },
  { scene: 'text-ratio', mode: 'inherit', pixelRatio: 2, textPixelRatio: 3 },
  { scene: 'text-ratio', mode: 'inherit', pixelRatio: 3, textPixelRatio: 3 },
];

/**
 * Build the run order.
 *
 * Ordered scene → mode → ASCENDING pixel ratio, so the four ratios of one
 * (scene, mode) pair are adjacent in time. That is the comparison the probe
 * exists to make, and adjacency is what keeps a slow thermal drift from being
 * read as a DPR cost. The drift itself stays auditable: every result carries its
 * ordinal and its offset from the run start.
 */
export const buildProbeMatrix = (scenes: readonly ProbeSceneSpec[] = PROBE_SCENES, pixelRatios: readonly number[] = PROBE_PIXEL_RATIOS): ProbeCell[] => {
  const cells: ProbeCell[] = [];

  for (const scene of scenes) {
    // The text-density scene has its own enumerated cells: crossing it with the
    // ratio ladder would measure twelve combinations to answer a four-way
    // question, and three of the twelve would be pairs nobody would ship.
    if (scene.id === 'text-ratio') {
      cells.push(...TEXT_RATIO_CELLS);

      continue;
    }

    const modes: readonly ProbeMode[] = scene.usesInternalTarget ? ['inherit', 'logical'] : ['inherit'];

    for (const mode of modes) {
      for (const pixelRatio of pixelRatios) {
        cells.push({ scene: scene.id, mode, pixelRatio });
      }
    }
  }

  return cells;
};

/** One class of internal render target a cell allocated, per frame. */
export interface InternalTargetRecord {
  /**
   * `pooled` - obtained from `backend.acquireRenderTexture` (filter input /
   * filter output / mask). `cache` - the node-owned `cacheAsTexture` texture.
   */
  readonly kind: 'pooled' | 'cache';
  /** Texel width the engine allocated. */
  readonly width: number;
  /** Texel height the engine allocated. */
  readonly height: number;
  /** How often a target of this exact shape was allocated in the recorded frame. */
  readonly count: number;
}

/** Everything the probe measured for one cell. */
export interface ProbeCellResult {
  /** Position in the run order - 0-based, ascending, never reused. */
  readonly index: number;
  /** Milliseconds between the start of the whole run and the start of this cell's measured window. */
  readonly startOffsetMs: number;
  readonly scene: ProbeSceneId;
  readonly mode: ProbeMode;
  /** `pixelRatio` handed to `new Application({ canvas: { pixelRatio } })`. */
  readonly configuredPixelRatio: number;
  /** `Application.pixelRatio` as the engine resolved it (must equal `configuredPixelRatio`). */
  readonly enginePixelRatio: number | null;
  /**
   * `Text.pixelRatio` this cell's text nodes were built with, or `null` when
   * they inherited the application's ratio - which is every cell outside the
   * `text-ratio` scene.
   */
  readonly textPixelRatio: number | null;
  /**
   * `Text.rasterPixelRatio` as the engine resolved it for the scene's text, or
   * `null` when the cell drew no runtime text. Recorded separately from
   * {@link textPixelRatio} because the inherit path is exactly the thing under
   * test: without an override this must come out equal to
   * {@link enginePixelRatio}, and a capture where it does not is the finding.
   */
  readonly textRasterPixelRatio: number | null;
  /** CSS size of the canvas element, in CSS pixels. */
  readonly cssWidth: number;
  readonly cssHeight: number;
  /** Backing-store size of the canvas element, in device pixels. */
  readonly backingWidth: number;
  readonly backingHeight: number;
  /** `backingWidth × backingHeight` - the main surface's pixel count. */
  readonly mainPixelCount: number;
  /** Every distinct internal target shape this cell allocated. Empty for the effect-free scenes. */
  readonly internalTargets: readonly InternalTargetRecord[];
  /**
   * Total internal-target pixels divided by {@link mainPixelCount}, or `null`
   * when the cell allocated none. This is the number the probe exists for: under
   * `logical` it falls by `1/pixelRatio²` as the surface grows, under `inherit`
   * it holds constant.
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
   * derived from frame cadence - see {@link ProbeResult.gpuTimerSource}.
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
  /** Raw `navigator.userAgent`. Never parsed into a device name - see {@link deviceLabel}. */
  readonly userAgent: string;
  /**
   * Device name the TESTER typed into the probe page. The user agent is not
   * consulted for it: Safari's UA names no iPhone model, and guessing one would
   * put a fabricated fact into a measurement record.
   */
  readonly deviceLabel: string;
  /** Free-text note the tester typed (thermal state, orientation, ...). */
  readonly testerNote: string;
  /** The host's own `window.devicePixelRatio`. */
  readonly devicePixelRatio: number;
  /**
   * What the engine's `auto` policy WOULD pick here - `min(devicePixelRatio, 2)`
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
  /** `crossOriginIsolated` - false means `performance.now()` is coarsened. */
  readonly crossOriginIsolated: boolean;
  /** Smallest non-zero `performance.now()` delta observed on this device, in milliseconds. */
  readonly timerResolutionMs: number;
  /**
   * Logical (CSS) stage size every cell in this run rendered at. Captured once
   * at run start: a stage that changed mid-run would make the cells
   * incomparable, which is the one thing the matrix must not allow.
   */
  readonly stageWidth: number;
  readonly stageHeight: number;
  /** Which stage the tester chose - a fixed square, or the device's usable area. */
  readonly stagePreset: 'fixed' | 'fill';
  /** Results, in run order. */
  readonly cells: readonly ProbeCellResult[];
  /** Caveats that apply to the whole capture. */
  readonly notes: readonly string[];
}

/**
 * Current {@link ProbeResult.schemaVersion}.
 *
 * - `1` → `2`: the cache scene's id followed the engine's `cacheAsBitmap` →
 *   `cacheAsTexture` rename.
 * - `2` → `3`: internal targets began inheriting the surface resolution. The modes
 *   are now `inherit` / `logical` rather
 *   than `current` / `parent-resolution`, a `cache-dirty` scene was added, and
 *   the stage size became a run parameter. A version-1 or -2 capture is still
 *   readable - map `current` onto `logical` and `parent-resolution` onto
 *   `inherit`, and read its stage as 360 × 360.
 * - `3` → `4`: runtime text became HiDPI-aware. A `text-ratio` scene was added
 *   with its own four enumerated cells, and every result carries
 *   `textPixelRatio` / `textRasterPixelRatio`. In a version-3 capture both are
 *   absent and every cell's text rasterized at 1 regardless of its DPR.
 */
export const PROBE_SCHEMA_VERSION = 4;

/**
 * Total pixels across every internal target a cell allocated, counting each
 * allocation (a two-filter chain allocates twice and costs twice).
 */
export const totalInternalTargetPixels = (records: readonly InternalTargetRecord[]): number =>
  records.reduce((sum, record) => sum + record.width * record.height * record.count, 0);

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
