import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { srcConditions } from '@codexo/exojs-config/vitest';
import { chromium } from 'playwright';

import type { BaseProvenance, LibraryProvenance } from '../shared/provenance';
import { readLibraryProvenance } from '../shared/provenance';
import { buildMatrix } from './archetypes';
import type { Backend, CellResult, CellSpec, EngineAdapter } from './EngineAdapter';

// Re-exported so `rendering/index.ts` and the CLI keep importing `LibraryProvenance`
// from the rendering barrel unchanged while the definition lives in `shared/`.
export type { LibraryProvenance } from '../shared/provenance';

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
}

/** Minimal surface of the programmatic Vite dev server the driver consumes. */
interface ViteDevServer {
  listen: () => Promise<unknown>;
  close: () => Promise<unknown>;
  resolvedUrls: { local: string[]; network: string[] } | null;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE_DIR = resolve(HERE, 'page');
// This file now lives at `packages/exojs-bench/src/rendering/driver.ts`, so the
// repository root is four levels up (rendering → src → exojs-bench → packages →
// root), not three as it was under the old `test/perf/baseline/` location.
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..');
/** The engine's TypeScript source root the harness benchmarks (`<repo>/src`). */
const ENGINE_SRC = resolve(REPO_ROOT, 'src');

/** Chromium flag set for the WebGL2 browser. Pinning the device scale factor keeps `devicePixelRatio` at 1 so canvas backing size is deterministic. NO `--use-angle=swiftshader`: that would force a software rasterizer and make every timing worthless. */
const LAUNCH_FLAGS: readonly string[] = ['--force-device-scale-factor=1'];

/**
 * Chromium flag set for the WebGPU browser. Adds only `--enable-unsafe-webgpu`
 * to the WebGL2 flags: on Windows this keeps WebGPU on the real platform adapter
 * (D3D12). Deliberately NOT `--enable-features=Vulkan` — forcing Vulkan lands on
 * SwiftShader, which would make every WebGPU timing a software number.
 */
const WEBGPU_LAUNCH_FLAGS: readonly string[] = [...LAUNCH_FLAGS, '--enable-unsafe-webgpu'];

/** Adapter identity substrings that name a software WebGPU implementation rather than a real GPU. */
const SOFTWARE_WEBGPU_PATTERN = /swiftshader|lavapipe|llvmpipe|warp|software|basic render/i;

/** Shader extensions the engine imports as text. */
const SHADER_EXTENSIONS = ['.vert', '.frag', '.glsl'] as const;

/** ExoJS package version, read from the repository root manifest. */
const readEngineVersion = (): string => {
  const manifest = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8')) as { version?: string };

  return manifest.version ?? '0.0.0';
};

/**
 * Competitor library arms whose installed version + resolution are stamped into
 * every report header (via the shared {@link readLibraryProvenance}) and, when
 * resolvable, pre-bundled by Vite (see {@link resolvableCompetitors}). Pinned
 * exact in `@codexo/exojs-bench`'s devDependencies, so an "ExoJS vs X" number is
 * auditable against a reproducible build.
 */
const LIBRARY_ARMS = ['pixi.js', 'phaser', 'excalibur'] as const;

/**
 * Adapter capability descriptors known to the driver. Only `engine`, `config`
 * and `supports` are consulted by {@link buildMatrix}; the lifecycle methods run
 * inside the harness page (see `page/harness.ts`), never in this Node process, so
 * they throw if called here rather than pretending to do work.
 */
const driverSideOnly = (): never => {
  throw new Error('Adapter lifecycle runs in the harness page, not in the driver process.');
};

const capabilityDescriptor = (engine: string, config: string, backends: readonly Backend[]): EngineAdapter => ({
  engine,
  config,
  supports: (backend: Backend): boolean => backends.includes(backend),
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
  capabilityDescriptor('phaser', 'default', ['webgl2']),
  capabilityDescriptor('excalibur', 'default', ['webgl2']),
];

/**
 * The subset of {@link LIBRARY_ARMS} actually resolvable from this package, so
 * Vite's `optimizeDeps.include` only pre-bundles competitors that are present. A
 * competitor left unlinked (no `bench:setup`) is simply omitted rather than
 * crashing esbuild's optimizer at server startup — an ExoJS-only run then needs
 * none of the competitor deps present.
 */
const resolvableCompetitors = (): string[] => {
  const nodeRequire = createRequire(import.meta.url);

  return LIBRARY_ARMS.filter(name => {
    try {
      nodeRequire.resolve(name);

      return true;
    } catch {
      return false;
    }
  });
};

/**
 * Load Vite through the copy vitest already depends on. Vite is not a direct
 * dependency of this package (adding one would drift the lockfile), but it is
 * present in the store as a transitive dependency of vitest, so we resolve it
 * from there and import it dynamically.
 */
const loadVite = async (): Promise<{ createServer: (config: Record<string, unknown>) => Promise<ViteDevServer> }> => {
  const nodeRequire = createRequire(import.meta.url);
  const viteEntry = createRequire(nodeRequire.resolve('vitest')).resolve('vite');

  return import(pathToFileURL(viteEntry).href) as Promise<{ createServer: (config: Record<string, unknown>) => Promise<ViteDevServer> }>;
};

/**
 * Serves `.vert`/`.frag`/`.glsl` imports as their REAL source text (mirrors the
 * production `rollup-plugin-string`). This is the deliberate inverse of the
 * vitest browser project's `shaderStubPlugin`, which replaces shaders with `""`
 * — benchmarking a renderer with empty shaders measures nothing.
 */
const realShaderPlugin = {
  name: 'baseline-real-shader',
  transform(code: string, id: string): { code: string } | undefined {
    if (SHADER_EXTENSIONS.some(extension => id.endsWith(extension))) {
      return { code: `export default ${JSON.stringify(code)}` };
    }

    return undefined;
  },
};

/**
 * Installs the compile-time build flags (`__DEV__`, `__VERSION__`,
 * `__REVISION__`) as real globals before any engine module evaluates. Vite's
 * `define` replaces literal references, but modules pre-bundled by esbuild's
 * optimizer do not see `define`; installing globals covers both paths (mirrors
 * the browser test suite's `_setup-dev-global`).
 */
const devGlobalsPlugin = (version: string) => ({
  name: 'baseline-dev-globals',
  transformIndexHtml(): Array<{ tag: string; injectTo: string; children: string }> {
    return [
      {
        tag: 'script',
        injectTo: 'head-prepend',
        children: `globalThis.__DEV__=true;globalThis.__VERSION__=${JSON.stringify(version)};globalThis.__REVISION__="baseline";`,
      },
    ];
  },
});

/**
 * Response headers that place the harness page in a cross-origin-isolated
 * context. `crossOriginIsolated === true` lifts the browser's Spectre-mitigation
 * clamp on `performance.now()` (~100µs in a non-isolated context) back to high
 * resolution (~5µs), so the CPU timer can actually resolve the small per-frame
 * costs the low-node-count cells sit on instead of quantising them to the timer
 * floor. It also unlocks `SharedArrayBuffer`. Isolation requires BOTH:
 *   - COOP `same-origin` — severs the opener relationship.
 *   - COEP `require-corp` — every subresource must opt in via CORP/CORS.
 * Every resource the harness loads (the page, `harness.ts`, engine source,
 * shaders) is served by this same Vite origin, so it is same-origin and passes
 * the COEP check without a CORP header; textures are generated in-page from a
 * canvas, never fetched. `CORP: same-origin` is set defensively so any
 * same-origin subresource is unambiguously embeddable.
 */
const CROSS_ORIGIN_ISOLATION_HEADERS: Readonly<Record<string, string>> = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

/** Starts a programmatic Vite dev server rooted at the harness page. */
const startViteServer = async (version: string): Promise<ViteDevServer> => {
  const vite = await loadVite();
  const server = await vite.createServer({
    configFile: false,
    root: PAGE_DIR,
    logLevel: 'warn',
    // Allow the harness (under page/) to import engine source above its root.
    // The COOP/COEP/CORP headers make the page `crossOriginIsolated`, restoring
    // high-resolution `performance.now()` for the CPU timer (see the constant).
    server: { host: '127.0.0.1', fs: { allow: [REPO_ROOT] }, headers: { ...CROSS_ORIGIN_ISOLATION_HEADERS } },
    // Resolve the engine's `#*` subpath imports to its TypeScript source.
    //
    // Under the OLD location (`test/perf/baseline/`, inside the repo-root
    // package) the harness's `#core/*` imports resolved through the ROOT
    // package.json `imports` map with the `@codexo/source` condition. Now that
    // the harness is its own package, the nearest package.json to the adapter
    // files is `@codexo/exojs-bench`'s — which deliberately does NOT redefine
    // `#*` (Node forbids an `imports` target escaping the package with `../`).
    // A single alias maps every `#…` specifier straight to `<repo>/src/…`,
    // reproducing the root map's pure `#* → ./src/*` wildcard exactly. Engine
    // modules imported through it still resolve their OWN internal `#*` imports
    // via the root package.json map + `@codexo/source` condition below, so the
    // engine graph is measured exactly as it ships. `.vert`/`.frag` specifiers
    // carry their extension and are handled by `realShaderPlugin`'s transform.
    resolve: { alias: [{ find: /^#(.*)$/, replacement: `${ENGINE_SRC}/$1` }], conditions: srcConditions },
    ssr: { resolve: { conditions: srcConditions } },
    // `noDiscovery` keeps the automatic dep scanner OFF — it runs esbuild over
    // the whole import graph, which would choke on the engine's `.vert`/`.frag`
    // imports the real-shader plugin only handles in the transform pass. But the
    // competitor arms are real npm dependencies whose bundles/transitive deps
    // include CommonJS modules (e.g. Pixi's `eventemitter3`); without
    // pre-bundling, the browser's native ESM loader rejects them ("does not
    // provide an export named 'default'"). Explicitly `include` each RESOLVABLE
    // competitor so esbuild pre-bundles it and its CJS deps with interop, WITHOUT
    // scanning the engine graph. A competitor that is not linked is omitted here
    // (see `resolvableCompetitors`) rather than crashing the optimizer. Engine
    // source still resolves to local `.ts` files via the `#*` alias and is never
    // pre-bundled.
    optimizeDeps: { noDiscovery: true, include: resolvableCompetitors() },
    define: { __DEV__: 'true', __VERSION__: JSON.stringify(version), __REVISION__: JSON.stringify('baseline') },
    plugins: [realShaderPlugin, devGlobalsPlugin(version)],
  });

  await server.listen();

  return server;
};

/**
 * In-page snippet: read the unmasked WebGL2 renderer string for provenance
 * FROM THE STAGE CANVAS'S OWN CONTEXT — the same `#stage` element and context
 * the just-run matrix cells actually measured.
 *
 * Review B8: this used to `document.createElement('canvas').getContext('webgl2')`
 * on a fresh, detached, never-attached canvas. Chrome can (rarely) hand out a
 * different GPU adapter per canvas/context (e.g. multi-GPU laptops), so a
 * throwaway canvas's renderer string is not guaranteed to be the adapter that
 * actually rendered the measured cells. Reading `#stage`'s context instead
 * closes that gap — but only AFTER the matrix has run at least one cell: this
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
interface WebGpuIdentity {
  /** Human-readable adapter string stamped into provenance. */
  readonly adapter: string;
  /** True when the adapter is real and should be measured; false emits `unavailable` cells. */
  readonly usable: boolean;
  /** Explanation attached to each cell when the adapter is unusable. */
  readonly note: string;
}

/**
 * Request the WebGPU adapter in-page and classify it. Returns `usable: false`
 * (with a note naming exactly what was found) when `navigator.gpu` is absent,
 * no adapter is offered, or the adapter names a software implementation — so the
 * caller can emit `unavailable` cells instead of measuring a software rasterizer
 * and passing it off as a GPU number.
 */
const readWebGpuAdapter = async (page: import('playwright').Page): Promise<WebGpuIdentity> => {
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

    return {
      present: true as const,
      acquired: true as const,
      vendor: info.vendor ?? '',
      architecture: info.architecture ?? '',
      device: info.device ?? '',
      description: info.description ?? '',
    };
  });

  if (!probe.present) {
    return { adapter: 'navigator.gpu is undefined', usable: false, note: 'WebGPU unavailable: navigator.gpu is undefined' };
  }

  if (!probe.acquired) {
    const reason = probe.error.length > 0 ? `requestAdapter failed: ${probe.error}` : 'requestAdapter returned null';

    return { adapter: `no-webgpu-adapter (${reason})`, usable: false, note: `WebGPU unavailable: ${reason}` };
  }

  const identity = [probe.vendor, probe.architecture, probe.device, probe.description]
    .map(part => part.trim())
    .filter(part => part.length > 0)
    .join(' ');
  const adapter = identity.length > 0 ? identity : 'webgpu-adapter (info masked)';

  if (SOFTWARE_WEBGPU_PATTERN.test(adapter)) {
    return { adapter, usable: false, note: `WebGPU software adapter refused: ${adapter}` };
  }

  return { adapter, usable: true, note: '' };
};

/** A cell that could not be measured: zeroed timings/structure, `unavailable` status, and an explanatory note. */
const unavailableCell = (spec: CellSpec, note: string): CellResult => ({
  spec,
  cpuMsMedian: 0,
  cpuMsP95: 0,
  frameMsMedian: null,
  frameMsP95: null,
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

  // WebGL2 renderer string, captured from `#stage`'s OWN context (review B8) the
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
  const cells = options.timedFramesOverride === undefined ? filtered : filtered.map(cell => ({ ...cell, timedFrames: options.timedFramesOverride! }));

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
