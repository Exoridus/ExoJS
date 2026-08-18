import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import type { BaseProvenance, LibraryProvenance } from '../shared/provenance';
import { readLibraryProvenance } from '../shared/provenance';
import type { ViteDevServer } from '../shared/viteServer';
import { LIBRARY_ARMS, readEngineVersion, startViteServer as startPageServer } from '../shared/viteServer';
import { buildMatrix } from './archetypes';
import type { ArchetypeSpec, Backend, CellResult, CellSpec, EngineAdapter } from './EngineAdapter';
import type { MatrixSelection } from './selection';
import { applySelection } from './selection';
import { isScrolling } from './world';

// Re-exported so the rendering barrel and the CLI keep importing the selection
// surface from `driver` unchanged. It lives in its own module because the tests
// that pin it must not pull Playwright in through this file.
export { applySelection, type MatrixSelection } from './selection';

// Re-exported so `rendering/index.ts` and the CLI keep importing `LibraryProvenance`
// from the rendering barrel unchanged while the definition lives in `shared/`.
export type { LibraryProvenance } from '../shared/provenance';

// Re-exported so `runTimerProbe.ts` and the CLI keep importing the engine-version
// stamp from `driver` unchanged while the definition lives beside the Vite server
// factory it is passed to.
export { readEngineVersion } from '../shared/viteServer';

/**
 * Provenance stamped onto every baseline run. Without it a wall-clock number is
 * meaningless: the same matrix on a real GPU and on a software rasterizer
 * produce numbers that look comparable but are not. Extends the shared
 * {@link BaseProvenance} (timestamp + engine version) with the rendering-
 * specific GPU fields. `software` is the honesty bit — when true,
 * {@link '../report'.writeReport} marks every timing column untrusted.
 */
export interface Provenance extends BaseProvenance {
  /** GPU/adapter identity string (`WEBGL_debug_renderer_info` unmasked renderer). */
  readonly adapter: string;
  /** Rendering backend this provenance describes. */
  readonly backend: Backend;
  /** Chromium launch flags used for the run. */
  readonly flags: readonly string[];
  /** Whether Chromium ran headless. */
  readonly headless: boolean;
  /** True when the adapter is a software rasterizer — timings are then untrusted. */
  readonly software: boolean;
  /**
   * Resolved WebGPU sprite-batch texture-slot tier for this run's adapter (8 /
   * 16 / 32), or `undefined` for the WebGL2 backend (whose batcher uses a fixed
   * 16-slot ceiling, not this negotiated tier). Slot-sensitive archetypes (e.g.
   * `batch-breaking`) measure a different code path depending on this tier, so
   * stamping it here makes a future ceiling change visible in the data instead
   * of silently invalidating those archetypes across machines.
   */
  readonly slotTier?: number;
}

/**
 * Sprite-batch texture-slot tiers the WebGPU renderer quantizes to. Mirrors the
 * engine's `resolveSpriteBatchTextureSlots` (WebGpuSpriteRenderer): the batcher
 * sizes its multi-texture bind group to
 * `min(maxSampledTexturesPerShaderStage, maxSamplersPerShaderStage)` on the
 * granted device, quantized DOWN to one of these tiers (capped at 32). Every
 * conformant device reaches at least 16; adapters granting 32+ reach 32. Kept in
 * sync with the engine by hand — this Node-side driver does not import engine
 * source. Stamped into provenance so a slot-sensitive archetype's measured code
 * path is auditable per run.
 */
const SPRITE_BATCH_SLOT_TIERS = [8, 16, 32] as const;

/**
 * Resolve the sprite-batch slot tier from an adapter's texture/sampler limits,
 * or `null` when the limits are unavailable (a non-conformant adapter exposing
 * no limits object — real devices always report them).
 */
const resolveSlotTier = (maxSampledTextures: number | null, maxSamplers: number | null): number | null => {
  if (maxSampledTextures === null || maxSamplers === null) {
    return null;
  }

  const available = Math.min(maxSampledTextures, maxSamplers);
  let tier: number = SPRITE_BATCH_SLOT_TIERS[0];

  for (const candidate of SPRITE_BATCH_SLOT_TIERS) {
    if (available >= candidate) {
      tier = candidate;
    }
  }

  return tier;
};

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE_DIR = resolve(HERE, 'page');

/** Chromium flag set for the WebGL2 browser. Pinning the device scale factor keeps `devicePixelRatio` at 1 so canvas backing size is deterministic. NO `--use-angle=swiftshader`: that would force a software rasterizer and make every timing worthless. */
export const LAUNCH_FLAGS: readonly string[] = ['--force-device-scale-factor=1'];

/**
 * Chromium flag set for the WebGPU browser. Adds only `--enable-unsafe-webgpu`
 * to the WebGL2 flags: on Windows this keeps WebGPU on the real platform adapter
 * (D3D12). Deliberately NOT `--enable-features=Vulkan` — forcing Vulkan lands on
 * SwiftShader, which would make every WebGPU timing a software number.
 */
export const WEBGPU_LAUNCH_FLAGS: readonly string[] = [...LAUNCH_FLAGS, '--enable-unsafe-webgpu'];

/** Adapter identity substrings that name a software WebGPU implementation rather than a real GPU. */
const SOFTWARE_WEBGPU_PATTERN = /swiftshader|lavapipe|llvmpipe|warp|software|basic render/i;

/**
 * Adapter capability descriptors known to the driver. Only `engine`, `config`
 * and `supports` are consulted by {@link buildMatrix}; the lifecycle methods run
 * inside the harness page (see `page/harness.ts`), never in this Node process, so
 * they throw if called here rather than pretending to do work.
 */
const driverSideOnly = (): never => {
  throw new Error('Adapter lifecycle runs in the harness page, not in the driver process.');
};

const capabilityDescriptor = (engine: string, config: string, backends: readonly Backend[], coversArchetype?: (spec: ArchetypeSpec) => boolean): EngineAdapter => ({
  engine,
  config,
  supports: (backend: Backend): boolean => backends.includes(backend),
  ...(coversArchetype !== undefined && { coversArchetype }),
  init: driverSideOnly,
  buildScene: driverSideOnly,
  mutate: driverSideOnly,
  renderFrame: driverSideOnly,
  teardown: driverSideOnly,
});

const ADAPTER_CAPABILITIES: readonly EngineAdapter[] = [
  capabilityDescriptor('exojs', 'current', ['webgl2', 'webgpu']),
  capabilityDescriptor('exojs', 'retained', ['webgl2', 'webgpu']),
  // Pixi.js v8 is the direct renderer benchmark and the only other 2D library
  // that ships WebGPU, so it runs on both backends. It is now a first-class,
  // committed arm (pinned exact devDependency) rather than the old gitignored
  // local-only reference; its version + provenance are stamped into the report
  // header via `readLibraryProvenance`.
  capabilityDescriptor('pixi', 'default', ['webgl2', 'webgpu']),
  // Second Pixi arm: stock Pixi PLUS the explicit per-frame `Culler.shared.cull`
  // a Pixi app that wants culling has to write itself. It runs only on
  // archetypes with genuine off-screen content (`cullingEnabled`), where the
  // difference between the two arms is the measurement; on a fully-visible
  // archetype the cull call could only ever add cost over an identical visible
  // set, so the variant would just duplicate `pixi default` across the matrix.
  capabilityDescriptor('pixi', 'culled', ['webgl2', 'webgpu'], spec => spec.cullingEnabled),
  // Phaser 4 and Excalibur are committed competitor arms (pinned exact
  // devDependencies). Both are WebGL2-only in this harness and never run WebGPU
  // (Phaser 4 ships no WebGPU renderer; Excalibur 0.32 has none). Phaser 4 is
  // measured as a stock app: its WebGLRenderer creates a WebGL1 context by
  // default (`getContext('webgl')`), so it runs under the 'webgl2' REQUEST while
  // rendering WebGL1 (disclosed by the harness's structural-probe degrade path
  // and the report Methodology); Excalibur 0.32 renders a real WebGL2 context.
  // A missing (unlinked) competitor degrades gracefully: its per-cell dynamic
  // import fails in isolation (`runCellInPage` records that cell `unavailable`
  // and the run continues), and it is left out of Vite's pre-bundle set below.
  // Both sit out the scrolling archetypes: neither arm implements a moving
  // camera, so they would render a fixed, fully-visible scene under an id that
  // promises off-screen content — a row that looks comparable and is not.
  capabilityDescriptor('phaser', 'default', ['webgl2'], spec => !isScrolling(spec)),
  capabilityDescriptor('excalibur', 'default', ['webgl2'], spec => !isScrolling(spec)),
];

/**
 * Starts a programmatic Vite dev server rooted at the matrix harness page.
 *
 * Thin wrapper over the shared factory in `shared/viteServer.ts` - the Vite
 * configuration (engine `#*` alias, real-shader transform, dev globals, COOP /
 * COEP isolation headers) is identical for every page this package serves, so it
 * lives in one place; only the page root differs.
 */
export const startViteServer = async (version: string): Promise<ViteDevServer> => startPageServer({ pageDir: PAGE_DIR, version });

/**
 * In-page snippet: read the unmasked WebGL2 renderer string for provenance
 * FROM THE STAGE CANVAS'S OWN CONTEXT — the same `#stage` element and context
 * the just-run matrix cells actually measured.
 *
 * A throwaway `document.createElement('canvas').getContext('webgl2')` on a
 * fresh, detached, never-attached canvas is not reliable here: Chrome can
 * (rarely) hand out a different GPU adapter per canvas/context (e.g.
 * multi-GPU laptops), so a throwaway canvas's renderer string is not
 * guaranteed to be the adapter that actually rendered the measured cells.
 * Reading `#stage`'s context instead closes that gap — but only AFTER the
 * matrix has run at least one cell: this
 * function must not be called before the engine's own `init()` has created
 * `#stage`'s WebGL2 context, because `HTMLCanvasElement.getContext` freezes
 * context-creation attributes (antialias, stencil, …) on the FIRST call and
 * ignores the attribute dictionary on every subsequent call — calling it here
 * before the engine's own `getContext('webgl2', { ...options, stencil: true })`
 * (see `WebGl2Backend.ts`) would silently give the engine a mismatched
 * context. `runBackend` therefore calls this only after
 * `__runBaselineMatrix` has returned, guaranteeing `#stage` already has the
 * real, correctly-attributed context.
 */
const readRendererInPage = async (page: import('playwright').Page): Promise<string> =>
  page.evaluate(() => {
    const canvas = document.getElementById('stage');
    const gl = canvas instanceof HTMLCanvasElement ? canvas.getContext('webgl2') : null;

    if (gl === null) {
      return 'no-webgl2-context';
    }

    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);

    return typeof renderer === 'string' ? renderer : String(renderer);
  });

/** Whether a renderer string names a software rasterizer rather than a real GPU. */
const isSoftwareRenderer = (renderer: string): boolean => /swiftshader|llvmpipe|software/i.test(renderer);

/** Resolved WebGPU adapter identity for one backend run. */
export interface WebGpuIdentity {
  /** Human-readable adapter string stamped into provenance. */
  readonly adapter: string;
  /** True when the adapter is real and should be measured; false emits `unavailable` cells. */
  readonly usable: boolean;
  /** Explanation attached to each cell when the adapter is unusable. */
  readonly note: string;
  /** Resolved sprite-batch slot tier for this adapter (8/16/32), or `null` when no adapter/limits were available. */
  readonly slotTier: number | null;
}

/**
 * Request the WebGPU adapter in-page and classify it. Returns `usable: false`
 * (with a note naming exactly what was found) when `navigator.gpu` is absent,
 * no adapter is offered, or the adapter names a software implementation — so the
 * caller can emit `unavailable` cells instead of measuring a software rasterizer
 * and passing it off as a GPU number.
 */
export const readWebGpuAdapter = async (page: import('playwright').Page): Promise<WebGpuIdentity> => {
  const probe = await page.evaluate(async () => {
    const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;

    if (gpu === undefined) {
      return { present: false as const };
    }

    let adapter: GPUAdapter | null;

    try {
      adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
    } catch (error) {
      return { present: true as const, acquired: false as const, error: error instanceof Error ? error.message : String(error) };
    }

    if (adapter === null) {
      return { present: true as const, acquired: false as const, error: '' };
    }

    const info = adapter.info ?? ({} as GPUAdapterInfo);
    // Adapter texture/sampler limits drive the sprite batcher's slot tier: the
    // engine requests up to min(adapterLimit, 32) of each at device creation, so
    // the granted device's tier is fully determined by these adapter limits.
    const limits = (adapter as { limits?: GPUSupportedLimits }).limits;

    return {
      present: true as const,
      acquired: true as const,
      vendor: info.vendor ?? '',
      architecture: info.architecture ?? '',
      device: info.device ?? '',
      description: info.description ?? '',
      maxSampledTextures: typeof limits?.maxSampledTexturesPerShaderStage === 'number' ? limits.maxSampledTexturesPerShaderStage : null,
      maxSamplers: typeof limits?.maxSamplersPerShaderStage === 'number' ? limits.maxSamplersPerShaderStage : null,
    };
  });

  if (!probe.present) {
    return { adapter: 'navigator.gpu is undefined', usable: false, note: 'WebGPU unavailable: navigator.gpu is undefined', slotTier: null };
  }

  if (!probe.acquired) {
    const reason = probe.error.length > 0 ? `requestAdapter failed: ${probe.error}` : 'requestAdapter returned null';

    return { adapter: `no-webgpu-adapter (${reason})`, usable: false, note: `WebGPU unavailable: ${reason}`, slotTier: null };
  }

  const identity = [probe.vendor, probe.architecture, probe.device, probe.description]
    .map(part => part.trim())
    .filter(part => part.length > 0)
    .join(' ');
  const adapter = identity.length > 0 ? identity : 'webgpu-adapter (info masked)';
  const slotTier = resolveSlotTier(probe.maxSampledTextures, probe.maxSamplers);

  if (SOFTWARE_WEBGPU_PATTERN.test(adapter)) {
    return { adapter, usable: false, note: `WebGPU software adapter refused: ${adapter}`, slotTier };
  }

  return { adapter, usable: true, note: '', slotTier };
};

/** A cell that could not be measured: zeroed timings/structure, `unavailable` status, and an explanatory note. */
const unavailableCell = (spec: CellSpec, note: string): CellResult => ({
  spec,
  cpuMsMedian: 0,
  cpuMsP95: 0,
  frameMsMedian: null,
  frameMsP95: null,
  queueMsMedian: null,
  queueMsP95: null,
  structural: { drawCalls: 0, textureBinds: 0, bufferUploads: 0 },
  status: 'unavailable',
  note,
});

/** Keeps only the cells whose defined `filter` fields all match. */
const applyFilter = (cells: readonly CellSpec[], filter: Partial<CellSpec>): CellSpec[] => {
  const entries = Object.entries(filter).filter(([, value]) => value !== undefined);

  return cells.filter(cell => entries.every(([key, value]) => cell[key as keyof CellSpec] === value));
};


/**
 * Callback invoked the instant a cell finishes measuring, BEFORE the run
 * continues to the next cell. The CLI wires this to the incremental checkpoint
 * writer (`shared/checkpoint.ts`) so a later crash never discards finished work.
 */
export type CellResultSink = (result: CellResult) => void;

/**
 * Run one cell in the page and return its result, degrading a thrown cell to an
 * `unavailable` result instead of letting it reject.
 *
 * This is the crash-isolation half of the hardening: the harness used to run a
 * whole backend's cells inside a SINGLE `page.evaluate`, so one late cell that
 * threw (observed: the Pixi-WebGPU device probe) rejected the entire evaluate
 * and discarded every already-measured cell in that backend. Driving one cell
 * per `page.evaluate` — all in the SAME page, so the same-session timing
 * discipline is untouched — means a failing cell costs only itself: it becomes
 * an `unavailable` datapoint carrying the error, and the run continues.
 */
const runCellInPage = async (page: import('playwright').Page, spec: CellSpec): Promise<CellResult> => {
  try {
    return await page.evaluate(cell => globalThis.__runBaselineCell!(cell), spec);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return unavailableCell(spec, `cell errored (isolated; run continued): ${message}`);
  }
};

/**
 * Node-side wall-clock cap on a single cell. The in-page harness bounds warmup
 * and the timed loop, but those guards only fire BETWEEN frames — they cannot
 * interrupt a frame that never returns. A weak arm can accumulate GPU-driver
 * state across its cells until one heavy cell stalls the driver mid-frame
 * (observed: Excalibur wedging on 25k full-viewport overdraw / batch-breaking),
 * freezing the page with no in-page recovery possible. This cap lets the DRIVER
 * abandon such a cell as `unavailable` and relaunch the browser, so one
 * pathological cell can never hang the whole matrix. Set far above the heaviest
 * TRUSTED cell (~15-25s with the in-page warmup cap + timed abort), so it only
 * ever trips on a genuine wedge.
 */
const CELL_TIMEOUT_MS = 60_000;

/** Sentinel returned by {@link runCellOrWedge} when a cell exceeds {@link CELL_TIMEOUT_MS}. */
const CELL_WEDGED = Symbol('cell-wedged');

/**
 * Run one cell, resolving to {@link CELL_WEDGED} if it does not finish within
 * {@link CELL_TIMEOUT_MS} — the page is then presumed frozen and its browser must
 * be relaunched. The still-pending evaluate is left to reject when the browser
 * closes; its rejection is swallowed so it never surfaces as an unhandled
 * rejection (`runCellInPage` already never rejects on a normal cell error).
 */
const runCellOrWedge = async (page: import('playwright').Page, spec: CellSpec): Promise<CellResult | typeof CELL_WEDGED> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof CELL_WEDGED>(resolvePromise => {
    timer = setTimeout(() => resolvePromise(CELL_WEDGED), CELL_TIMEOUT_MS);
  });

  const run = runCellInPage(page, spec).then(result => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }

    return result;
  });

  // Swallow the abandoned evaluate's eventual rejection (the browser close after a
  // wedge rejects it) so it never surfaces as an unhandled rejection.
  run.catch(() => {
    /* intentionally ignored */
  });

  return Promise.race([run, timeout]);
};

/**
 * Runs one backend's cell list, isolating each arm in its OWN browser session and
 * each cell behind a wall-clock timeout. Invokes `onCellResult` after EACH cell so
 * the caller can checkpoint it, and returns the backend's provenance plus results.
 *
 * Isolation model (why not one shared session): timing is measured PER CELL — each
 * cell fully `init`s and `teardown`s its arm — so a shared session buys only warm
 * JIT/prebundle, not comparability, while it lets one arm's leaked GPU/driver state
 * wedge a LATER arm's (or its own later) cell. Each arm therefore gets a fresh
 * browser (Vite prebundle is server-side, so relaunch is cheap), and any cell that
 * WEDGES (`CELL_TIMEOUT_MS`) is abandoned as `unavailable` with the browser
 * relaunched for the arm's remaining cells. The matrix always completes; a
 * pathological arm loses only its wedging cells, each disclosed in the report.
 *
 * For WebGPU the adapter identity is read once; a null or software adapter emits
 * every cell as `unavailable` rather than measuring a software rasterizer.
 */
const runBackend = async (options: {
  baseUrl: string;
  backend: Backend;
  cells: CellSpec[];
  engineVersion: string;
  onCellResult: CellResultSink;
}): Promise<{ provenance: Provenance; results: CellResult[] }> => {
  const { baseUrl, backend, cells, engineVersion, onCellResult } = options;
  const flags = backend === 'webgpu' ? WEBGPU_LAUNCH_FLAGS : LAUNCH_FLAGS;

  // Group cells by arm (engine|config) in first-seen order so each arm runs in its
  // own browser session, isolated from every other arm's accumulated state.
  const armOrder: string[] = [];
  const armGroups = new Map<string, CellSpec[]>();

  for (const cell of cells) {
    const key = `${cell.engine}|${cell.config}`;
    const group = armGroups.get(key);

    if (group === undefined) {
      armGroups.set(key, [cell]);
      armOrder.push(key);
    } else {
      group.push(cell);
    }
  }

  const timestamp = new Date().toISOString();
  const results: CellResult[] = [];
  const collect = (result: CellResult): void => {
    results.push(result);
    onCellResult(result);
  };

  // WebGL2 renderer string, captured from `#stage`'s OWN context the
  // moment the FIRST ok cell has created it. `null` until then; a run with no ok
  // cell keeps the `no-webgl2-context` provenance below. WebGPU adapter identity is
  // read once and reused across every arm's session (same GPU, same flags).
  let renderer: string | null = null;
  let webgpuIdentity: WebGpuIdentity | null = null;

  for (const key of armOrder) {
    let remaining = armGroups.get(key)!;

    // One browser per pass; a mid-arm wedge breaks out, closes it, and the outer
    // loop relaunches a fresh one for whatever cells are left.
    while (remaining.length > 0) {
      const browser = await chromium.launch({ channel: 'chromium', headless: true, args: [...flags] });
      let relaunch = false;

      try {
        const page = await browser.newPage();

        await page.goto(baseUrl, { waitUntil: 'load' });
        await page.waitForFunction(() => typeof globalThis.__runBaselineCell === 'function');

        if (backend === 'webgpu') {
          webgpuIdentity ??= await readWebGpuAdapter(page);

          if (!webgpuIdentity.usable) {
            for (const cell of remaining) {
              collect(unavailableCell(cell, webgpuIdentity.note));
            }

            remaining = [];
          }
        }

        while (remaining.length > 0) {
          const cell = remaining[0]!;
          const outcome = await runCellOrWedge(page, cell);

          if (outcome === CELL_WEDGED) {
            collect(
              unavailableCell(
                cell,
                `cell wedged the browser (no result after ${CELL_TIMEOUT_MS}ms — a mid-frame GPU-driver stall the in-page guards cannot interrupt); isolated as unavailable, browser relaunched for the arm's remaining cells`,
              ),
            );
            remaining = remaining.slice(1);
            relaunch = true;
            break;
          }

          collect(outcome);

          if (backend === 'webgl2' && renderer === null && outcome.status === 'ok') {
            renderer = await readRendererInPage(page);
          }

          remaining = remaining.slice(1);
        }
      } finally {
        await browser.close();
      }

      if (!relaunch) {
        break;
      }
    }
  }

  const provenance: Provenance =
    backend === 'webgpu'
      ? {
          adapter: webgpuIdentity?.adapter ?? 'no-webgpu-adapter',
          backend,
          flags,
          headless: true,
          engineVersion,
          timestamp,
          // False even for a software adapter: those cells are emitted `unavailable`
          // (no timings), so nothing here is an untrusted number, and flipping the
          // honesty bit would wrongly taint the WebGL2 timings. The software identity
          // is preserved in `adapter` and each cell's note instead.
          software: false,
          // Resolved sprite-batch slot tier for this adapter, so a slot-sensitive
          // archetype's measured code path is auditable per run. Omitted when no
          // adapter/limits were available (the cells are then `unavailable` anyway).
          ...(typeof webgpuIdentity?.slotTier === 'number' && { slotTier: webgpuIdentity.slotTier }),
        }
      : {
          adapter: renderer ?? 'no-webgl2-context',
          backend,
          flags,
          headless: true,
          engineVersion,
          timestamp,
          software: renderer !== null && isSoftwareRenderer(renderer),
        };

  return { provenance, results };
};

/** One aggregated row of a CPU profile: a source location and the self time attributed to it. */
export interface ProfileRow {
  /** Function name as the V8 sampler reported it (empty for top-level/anonymous frames). */
  readonly functionName: string;
  /** Source URL the frame came from, trimmed to a repository-relative path where possible. */
  readonly source: string;
  /** Self time in milliseconds, summed over every sampler node with this (function, source, line). */
  readonly selfMs: number;
  /** Share of the whole profile's self time, in percent. */
  readonly selfPercent: number;
}

/** Result of one CPU-profiling run: the cell profiled, the wall clock it took, and self time by frame. */
export interface ProfileOutcome {
  /** The cell that was profiled. */
  readonly spec: CellSpec;
  /** GPU/backend provenance for the profiled session. */
  readonly provenance: Provenance;
  /** Number of frames the profiled loop rendered. */
  readonly frames: number;
  /** Wall clock the in-page frame loop took, in milliseconds. */
  readonly wallMs: number;
  /** Total self time the sampler attributed, in milliseconds (below `wallMs` by the sampler's blind spots). */
  readonly totalSelfMs: number;
  /** Self time per source frame, descending. */
  readonly rows: readonly ProfileRow[];
  /** Self time aggregated per source FILE, descending — the view that answers "which subsystem". */
  readonly byFile: ReadonlyArray<{ readonly source: string; readonly selfMs: number; readonly selfPercent: number }>;
}

/** Minimal shape of the `Profiler.stop` payload this driver consumes. */
interface CdpProfile {
  readonly nodes: ReadonlyArray<{
    readonly id: number;
    readonly hitCount?: number;
    readonly callFrame: { readonly functionName: string; readonly url: string; readonly lineNumber: number };
  }>;
  readonly startTime: number;
  readonly endTime: number;
  readonly samples?: readonly number[];
  readonly timeDeltas?: readonly number[];
}

/**
 * Shorten a profiler URL to something readable: the Vite dev server serves
 * engine source from the repo root, so `http://127.0.0.1:PORT/@fs/<repo-root>/src/x.ts`
 * and `/src/x.ts` both collapse to `src/x.ts`; a pre-bundled competitor keeps
 * its `node_modules/.vite/deps/…` identity, which is exactly what distinguishes
 * "time inside Pixi" from "time inside the engine".
 */
const shortenProfileUrl = (url: string): string => {
  if (url.length === 0) {
    return '(native)';
  }

  const withoutQuery = url.split('?')[0]!;
  const marker = withoutQuery.lastIndexOf('/exojs/');

  if (marker >= 0) {
    return withoutQuery.slice(marker + '/exojs/'.length);
  }

  try {
    return new URL(withoutQuery).pathname.replace(/^\/+/, '');
  } catch {
    return withoutQuery;
  }
};

/**
 * Run one cell under the V8 CPU sampler and return self time attributed by
 * source frame.
 *
 * The sampler is started BETWEEN the in-page setup phase and the frame loop
 * (see `page/harness.ts`'s `__profileSetup` / `__profileFrames`), so engine
 * init, scene construction and warmup are outside the capture and the profile
 * describes the per-frame path only.
 *
 * Self time is derived from `samples` + `timeDeltas` when the sampler provides
 * them (exact per-sample attribution) and falls back to distributing the
 * profile's wall span across `hitCount` otherwise. Sampling at 50µs rather than
 * the 1000µs default is what makes a 0.1ms/frame retained cell resolvable at
 * all; it costs profile size, not accuracy.
 */
export const profileCell = async (options: {
  spec: CellSpec;
  /** Frames rendered inside the sampled window. */
  frames?: number;
  /** Frames rendered before sampling starts, to settle shader compile / JIT. */
  warmupFrames?: number;
  /** Sampling interval in microseconds. */
  intervalUs?: number;
}): Promise<ProfileOutcome> => {
  const { spec } = options;
  const frames = options.frames ?? 200;
  const warmupFrames = options.warmupFrames ?? 30;
  const engineVersion = readEngineVersion();
  const server = await startViteServer(engineVersion);

  try {
    const baseUrl = server.resolvedUrls?.local[0];

    if (baseUrl === undefined) {
      throw new Error('The Vite dev server did not report a local URL.');
    }

    const flags = spec.backend === 'webgpu' ? WEBGPU_LAUNCH_FLAGS : LAUNCH_FLAGS;
    const browser = await chromium.launch({ channel: 'chromium', headless: true, args: [...flags] });

    try {
      const page = await browser.newPage();

      await page.goto(baseUrl, { waitUntil: 'load' });
      await page.waitForFunction(() => typeof globalThis.__profileSetup === 'function');

      const client = await page.context().newCDPSession(page);

      await client.send('Profiler.enable');
      await client.send('Profiler.setSamplingInterval', { interval: options.intervalUs ?? 50 });

      await page.evaluate(args => globalThis.__profileSetup!(args.cell, args.warmup), { cell: spec, warmup: warmupFrames });
      await client.send('Profiler.start');

      const wallMs = await page.evaluate(count => globalThis.__profileFrames!(count), frames);
      const stopped = (await client.send('Profiler.stop')) as unknown as { profile: CdpProfile };
      const profile = stopped.profile;

      const adapter = spec.backend === 'webgpu' ? 'profiled webgpu session' : await readRendererInPage(page);

      await page.evaluate(() => globalThis.__profileDispose!());

      // Per-node self time. `timeDeltas[i]` is the interval BEFORE `samples[i]`
      // in microseconds, so charging it to `samples[i]` attributes each
      // observed interval to the frame that was on top at its end — the
      // standard reading of a V8 CPU profile.
      const selfUsByNode = new Map<number, number>();

      if (profile.samples !== undefined && profile.timeDeltas !== undefined) {
        for (let i = 0; i < profile.samples.length; i++) {
          const nodeId = profile.samples[i]!;
          const delta = profile.timeDeltas[i] ?? 0;

          selfUsByNode.set(nodeId, (selfUsByNode.get(nodeId) ?? 0) + delta);
        }
      } else {
        const totalHits = profile.nodes.reduce((sum, node) => sum + (node.hitCount ?? 0), 0);
        const spanUs = profile.endTime - profile.startTime;

        for (const node of profile.nodes) {
          if (totalHits > 0 && node.hitCount) {
            selfUsByNode.set(node.id, (node.hitCount / totalHits) * spanUs);
          }
        }
      }

      const byFrame = new Map<string, { functionName: string; source: string; selfMs: number }>();
      const byFile = new Map<string, number>();
      let totalSelfMs = 0;

      for (const node of profile.nodes) {
        const selfMs = (selfUsByNode.get(node.id) ?? 0) / 1000;

        if (selfMs <= 0) {
          continue;
        }

        const source = `${shortenProfileUrl(node.callFrame.url)}:${node.callFrame.lineNumber + 1}`;
        const fileSource = shortenProfileUrl(node.callFrame.url);
        const key = `${node.callFrame.functionName}@${source}`;
        const existing = byFrame.get(key);

        if (existing === undefined) {
          byFrame.set(key, { functionName: node.callFrame.functionName, source, selfMs });
        } else {
          existing.selfMs += selfMs;
        }

        byFile.set(fileSource, (byFile.get(fileSource) ?? 0) + selfMs);
        totalSelfMs += selfMs;
      }

      const rows: ProfileRow[] = [...byFrame.values()]
        .map(entry => ({ ...entry, selfPercent: totalSelfMs > 0 ? (entry.selfMs / totalSelfMs) * 100 : 0 }))
        .sort((a, b) => b.selfMs - a.selfMs);

      const files = [...byFile.entries()]
        .map(([source, selfMs]) => ({ source, selfMs, selfPercent: totalSelfMs > 0 ? (selfMs / totalSelfMs) * 100 : 0 }))
        .sort((a, b) => b.selfMs - a.selfMs);

      return {
        spec,
        provenance: { adapter, backend: spec.backend, flags, headless: true, engineVersion, timestamp: new Date().toISOString(), software: isSoftwareRenderer(adapter) },
        frames,
        wallMs,
        totalSelfMs,
        rows,
        byFile: files,
      };
    } finally {
      await browser.close();
    }
  } finally {
    await server.close();
  }
};

/** Full outcome of a matrix run: per-backend provenance, competitor-library provenance, and every cell result. */
export interface MatrixOutcome {
  /** One provenance stamp per backend exercised. */
  readonly provenance: Provenance[];
  /** Version + resolution provenance for each committed competitor library arm. */
  readonly libraries: LibraryProvenance[];
  /** One result per matrix cell, in completion order. */
  readonly results: CellResult[];
}

/**
 * Runs the whole baseline matrix end-to-end against the real GPU.
 *
 * One browser per backend: WebGL2 and WebGPU need different launch flags, so
 * each backend runs its full cell list in its own single session. The
 * same-session rule holds per backend; a WebGL2-vs-WebGPU comparison is a
 * cross-backend comparison, satisfied by running the two sessions back-to-back
 * on the same machine in one invocation, with a provenance block recorded per
 * backend. Requested backend order is preserved so the report lists WebGL2
 * first.
 *
 * `onCellResult` (optional) fires after every cell so the caller can persist it
 * immediately; the returned {@link MatrixOutcome} is the same set aggregated.
 */
export const runMatrix = async (options: {
  backends: readonly Backend[];
  filter?: Partial<CellSpec>;
  /** Multi-value selection applied after `filter`; see {@link MatrixSelection}. */
  selection?: MatrixSelection;
  /**
   * Forces every selected cell's timed-frame count to this value. Reserved for
   * the smoke test, which measures a single tiny cell and needs only a handful
   * of frames — a real reportable run must never set it (it would flatten the
   * per-node-count frame budgets recorded in the report).
   */
  timedFramesOverride?: number;
  /** Invoked once per completed cell, in order, for incremental checkpointing. */
  onCellResult?: CellResultSink;
}): Promise<MatrixOutcome> => {
  const engineVersion = readEngineVersion();
  const libraries = readLibraryProvenance(LIBRARY_ARMS);
  const allCells = buildMatrix(ADAPTER_CAPABILITIES, options.backends);
  const filtered = options.filter ? applyFilter(allCells, options.filter) : allCells;
  const selected = options.selection ? applySelection(filtered, options.selection) : filtered;
  const cells = options.timedFramesOverride === undefined ? selected : selected.map(cell => ({ ...cell, timedFrames: options.timedFramesOverride! }));

  if (cells.length === 0) {
    throw new Error('The baseline matrix is empty: no adapter supports the requested backends/filter.');
  }

  const onCellResult: CellResultSink = options.onCellResult ?? ((): void => undefined);
  const server = await startViteServer(engineVersion);

  try {
    const baseUrl = server.resolvedUrls?.local[0];

    if (baseUrl === undefined) {
      throw new Error('The Vite dev server did not report a local URL.');
    }

    const provenance: Provenance[] = [];
    const results: CellResult[] = [];

    for (const backend of options.backends) {
      const backendCells = cells.filter(cell => cell.backend === backend);

      if (backendCells.length === 0) {
        continue;
      }

      const outcome = await runBackend({ baseUrl, backend, cells: backendCells, engineVersion, onCellResult });

      provenance.push(outcome.provenance);
      results.push(...outcome.results);
    }

    return { provenance, libraries, results };
  } finally {
    await server.close();
  }
};
