import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { srcConditions } from '@codexo/exojs-config/vitest';

/** Minimal surface of the programmatic Vite dev server the callers consume. */
export interface ViteDevServer {
  listen: () => Promise<unknown>;
  close: () => Promise<unknown>;
  resolvedUrls: { local: string[]; network: string[] } | null;
}

const HERE = dirname(fileURLToPath(import.meta.url));
/**
 * Repository root, four levels up from this file (shared → src → exojs-bench →
 * packages → root).
 */
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..');
/** The engine's TypeScript source root every harness page benchmarks (`<repo>/src`). */
const ENGINE_SRC = resolve(REPO_ROOT, 'src');

/** Shader extensions the engine imports as text. */
const SHADER_EXTENSIONS = ['.vert', '.frag', '.glsl'] as const;

/**
 * Competitor library arms whose installed version + resolution are stamped into
 * every report header (via the shared `readLibraryProvenance`) and, when
 * resolvable, pre-bundled by Vite (see {@link resolvableCompetitors}). Pinned
 * exact in `@codexo/exojs-bench`'s devDependencies, so an "ExoJS vs X" number is
 * auditable against a reproducible build.
 */
export const LIBRARY_ARMS = ['pixi.js', 'phaser', 'excalibur'] as const;

/** ExoJS package version, read from the repository root manifest. */
export const readEngineVersion = (): string => {
  const manifest = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8')) as { version?: string };

  return manifest.version ?? '0.0.0';
};

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
 * `__DEV__` value the engine graph is compiled with for the benchmark.
 *
 * MUST be `false`: the competitor arms are pre-bundled from their published npm
 * dist (`optimizeDeps.include`), i.e. their PRODUCTION builds with dev-only
 * guards already stripped. Measuring exojs source with `__DEV__=true` therefore
 * pits an unshipped dev build — carrying per-frame dev diagnostics that can scan
 * the whole captured set on a clean retained frame — against competitors' prod
 * builds. That asymmetry inflated the exojs numbers by 20-30x on the
 * static-heavy retained arm alone (2.3 ms vs the real ~0.1 ms prod floor).
 * `false` compiles the same path a shipped exojs game runs, making the
 * cross-arm comparison apples-to-apples.
 */
const ENGINE_DEV_BUILD = false;

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
        children: `globalThis.__DEV__=${String(ENGINE_DEV_BUILD)};globalThis.__VERSION__=${JSON.stringify(version)};globalThis.__REVISION__="baseline";`,
      },
    ];
  },
});

/**
 * Response headers that place a harness page in a cross-origin-isolated
 * context. `crossOriginIsolated === true` lifts the browser's Spectre-mitigation
 * clamp on `performance.now()` (~100µs in a non-isolated context) back to high
 * resolution (~5µs), so the CPU timer can actually resolve the small per-frame
 * costs the low-node-count cells sit on instead of quantising them to the timer
 * floor. It also unlocks `SharedArrayBuffer`. Isolation requires BOTH:
 *   - COOP `same-origin` — severs the opener relationship.
 *   - COEP `require-corp` — every subresource must opt in via CORP/CORS.
 * Every resource a harness page loads (the page, its entry module, engine
 * source, shaders) is served by this same Vite origin, so it is same-origin and
 * passes the COEP check without a CORP header; textures are generated in-page
 * from a canvas, never fetched. `CORP: same-origin` is set defensively so any
 * same-origin subresource is unambiguously embeddable.
 *
 * Isolation additionally requires a SECURE context, which `http://` on a LAN
 * address is not — see {@link StartViteServerOptions.https}.
 */
const CROSS_ORIGIN_ISOLATION_HEADERS: Readonly<Record<string, string>> = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

/** Options for {@link startViteServer}. */
export interface StartViteServerOptions {
  /** Absolute path of the directory holding the page's `index.html`. */
  readonly pageDir: string;
  /** ExoJS version stamped into `__VERSION__` for the served engine graph. */
  readonly version: string;
  /**
   * Interface to bind. Defaults to `127.0.0.1` (the Playwright-driven matrix
   * harness, which never leaves the machine). A manual probe that must be opened
   * from a phone on the same network binds `0.0.0.0` instead.
   */
  readonly host?: string;
  /**
   * TLS key/cert pair. Present ⇒ the server speaks HTTPS. A LAN `http://` origin
   * is NOT a secure context, so without this neither `crossOriginIsolated` (and
   * with it the high-resolution `performance.now()` the COOP/COEP headers buy)
   * nor `navigator.gpu` is available on the phone.
   */
  readonly https?: { readonly key: string | Buffer; readonly cert: string | Buffer };
  /**
   * Extra compile-time constants folded into the served modules, on top of the
   * engine's `__DEV__` / `__VERSION__` / `__REVISION__`. Values are inserted
   * verbatim, so a string must arrive already JSON-encoded. Used by the DPR
   * probe to stamp the serving commit into a capture the tester copies off a
   * phone, where no shell is available to record it.
   */
  readonly extraDefine?: Readonly<Record<string, string>>;
}

/** Starts a programmatic Vite dev server rooted at a harness page directory. */
export const startViteServer = async (options: StartViteServerOptions): Promise<ViteDevServer> => {
  const { pageDir, version, host = '127.0.0.1', https, extraDefine } = options;
  const vite = await loadVite();
  const server = await vite.createServer({
    configFile: false,
    root: pageDir,
    logLevel: 'warn',
    // Allow the page (under its own root) to import engine source above it.
    // The COOP/COEP/CORP headers make the page `crossOriginIsolated`, restoring
    // high-resolution `performance.now()` for the CPU timer (see the constant).
    server: {
      host,
      fs: { allow: [REPO_ROOT] },
      headers: { ...CROSS_ORIGIN_ISOLATION_HEADERS },
      ...(https !== undefined && { https: { key: https.key, cert: https.cert } }),
    },
    // Resolve the engine's `#*` subpath imports to its TypeScript source.
    //
    // The nearest package.json to the adapter files is `@codexo/exojs-bench`'s —
    // which deliberately does NOT redefine `#*` (Node forbids an `imports` target
    // escaping the package with `../`). A single alias maps every `#…` specifier
    // straight to `<repo>/src/…`, reproducing the root map's pure `#* → ./src/*`
    // wildcard exactly. Engine modules imported through it still resolve their OWN
    // internal `#*` imports via the root package.json map + `@codexo/source`
    // condition below, so the engine graph is measured exactly as it ships.
    // `.vert`/`.frag` specifiers carry their extension and are handled by
    // `realShaderPlugin`'s transform.
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
    define: { __DEV__: String(ENGINE_DEV_BUILD), __VERSION__: JSON.stringify(version), __REVISION__: JSON.stringify('baseline'), ...extraDefine },
    plugins: [realShaderPlugin, devGlobalsPlugin(version)],
  });

  await server.listen();

  return server;
};
