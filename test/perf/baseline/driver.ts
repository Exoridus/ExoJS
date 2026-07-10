import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { srcConditions } from '@codexo/exojs-config/vitest';
import { chromium } from 'playwright';

import { buildMatrix } from './archetypes';
import type { Backend, CellResult, CellSpec, EngineAdapter } from './EngineAdapter';

/**
 * Provenance stamped onto every baseline run. Without it a wall-clock number is
 * meaningless: the same matrix on a real GPU and on a software rasterizer
 * produce numbers that look comparable but are not. `software` is the honesty
 * bit — when true, {@link '../report'.writeReport} marks every timing column
 * untrusted.
 */
export interface Provenance {
  /** GPU/adapter identity string (`WEBGL_debug_renderer_info` unmasked renderer). */
  readonly adapter: string;
  /** Rendering backend this provenance describes. */
  readonly backend: Backend;
  /** Chromium launch flags used for the run. */
  readonly flags: readonly string[];
  /** Whether Chromium ran headless. */
  readonly headless: boolean;
  /** ExoJS package version under test. */
  readonly engineVersion: string;
  /** ISO-8601 timestamp of the run. */
  readonly timestamp: string;
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
const REPO_ROOT = resolve(HERE, '..', '..', '..');

/** Chromium flag set. Pinning the device scale factor keeps `devicePixelRatio` at 1 so canvas backing size is deterministic. NO `--use-angle=swiftshader`: that would force a software rasterizer and make every timing worthless. */
const LAUNCH_FLAGS: readonly string[] = ['--force-device-scale-factor=1'];

/** Shader extensions the engine imports as text. */
const SHADER_EXTENSIONS = ['.vert', '.frag', '.glsl'] as const;

/** ExoJS package version, read from the repository root manifest. */
const readEngineVersion = (): string => {
  const manifest = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8')) as { version?: string };

  return manifest.version ?? '0.0.0';
};

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

const ADAPTER_CAPABILITIES: readonly EngineAdapter[] = [capabilityDescriptor('exojs', 'current', ['webgl2'])];

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

/** Starts a programmatic Vite dev server rooted at the harness page. */
const startViteServer = async (version: string): Promise<ViteDevServer> => {
  const vite = await loadVite();
  const server = await vite.createServer({
    configFile: false,
    root: PAGE_DIR,
    logLevel: 'warn',
    // Allow the harness (under page/) to import engine source above its root.
    server: { host: '127.0.0.1', fs: { allow: [REPO_ROOT] } },
    // Activate the `@codexo/source` condition so `#*` resolves to ./src/*.ts.
    resolve: { conditions: srcConditions },
    ssr: { resolve: { conditions: srcConditions } },
    // Skip the dep scanner: it runs esbuild over the import graph, which would
    // choke on `.vert`/`.frag` imports the real-shader plugin only handles in
    // the transform pass. Engine source resolves to local files, not deps, so
    // nothing needs pre-bundling.
    optimizeDeps: { noDiscovery: true, include: [] },
    define: { __DEV__: 'true', __VERSION__: JSON.stringify(version), __REVISION__: JSON.stringify('baseline') },
    plugins: [realShaderPlugin, devGlobalsPlugin(version)],
  });

  await server.listen();

  return server;
};

/** In-page snippet: read the unmasked WebGL2 renderer string for provenance. */
const readRendererInPage = async (page: import('playwright').Page): Promise<string> =>
  page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');

    if (gl === null) {
      return 'no-webgl2-context';
    }

    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);

    return typeof renderer === 'string' ? renderer : String(renderer);
  });

/** Whether a renderer string names a software rasterizer rather than a real GPU. */
const isSoftwareRenderer = (renderer: string): boolean => /swiftshader|llvmpipe|software/i.test(renderer);

/** Keeps only the cells whose defined `filter` fields all match. */
const applyFilter = (cells: readonly CellSpec[], filter: Partial<CellSpec>): CellSpec[] => {
  const entries = Object.entries(filter).filter(([, value]) => value !== undefined);

  return cells.filter(cell => entries.every(([key, value]) => cell[key as keyof CellSpec] === value));
};

/**
 * Runs the whole baseline matrix end-to-end against the real GPU.
 *
 * The entire matrix runs in ONE page/session: cross-session timing comparison is
 * invalid (JIT warmth, GPU clock state and allocator state all differ between
 * sessions), so `__runBaselineMatrix` is invoked exactly once with the full cell
 * list, not once per cell.
 */
export const runMatrix = async (options: {
  backends: readonly Backend[];
  filter?: Partial<CellSpec>;
}): Promise<{ provenance: Provenance[]; results: CellResult[] }> => {
  const engineVersion = readEngineVersion();
  const allCells = buildMatrix(ADAPTER_CAPABILITIES, options.backends);
  const cells = options.filter ? applyFilter(allCells, options.filter) : allCells;

  if (cells.length === 0) {
    throw new Error('The baseline matrix is empty: no adapter supports the requested backends/filter.');
  }

  const server = await startViteServer(engineVersion);

  try {
    const baseUrl = server.resolvedUrls?.local[0];

    if (baseUrl === undefined) {
      throw new Error('The Vite dev server did not report a local URL.');
    }

    const browser = await chromium.launch({ channel: 'chromium', headless: true, args: [...LAUNCH_FLAGS] });

    try {
      const page = await browser.newPage();

      await page.goto(baseUrl, { waitUntil: 'load' });
      await page.waitForFunction(() => typeof globalThis.__runBaselineMatrix === 'function');

      const renderer = await readRendererInPage(page);
      const software = isSoftwareRenderer(renderer);
      const timestamp = new Date().toISOString();

      // The whole matrix, one evaluate call, one session.
      const results = await page.evaluate(cellList => globalThis.__runBaselineMatrix!(cellList), cells);

      const provenance: Provenance[] = options.backends.map(backend => ({
        adapter: renderer,
        backend,
        flags: LAUNCH_FLAGS,
        headless: true,
        engineVersion,
        timestamp,
        software,
      }));

      return { provenance, results };
    } finally {
      await browser.close();
    }
  } finally {
    await server.close();
  }
};
