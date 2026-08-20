import { fileURLToPath } from 'node:url';

import { createShaderPlugin } from '@codexo/exojs-build';
import { createJsdomTestProject, srcConditions, workerTransformPlugin, workletTransformPlugin } from '@codexo/exojs-config/vitest';
import { playwright } from '@vitest/browser-playwright';
import { webdriverio } from '@vitest/browser-webdriverio';
import { defineConfig } from 'vitest/config';

import { emitAllocationRecord, startHeapSampling, stopHeapSampling } from './test/perf/webgpu/heapSamplingCommands';
import { resetParityEvidence, writeParityEvidence } from './test/rendering/parity/evidenceSink';

// Note: Vite alias matching uses longest-first order. Subpath aliases must come
// before the root alias so '@codexo/exojs/renderer-sdk' resolves before '@codexo/exojs'.
// These map the PUBLIC cross-package specifiers to source for in-repo tests.
// Package-internal `#*` imports are NOT aliased - they resolve through each
// package's own package.json#imports map via the source conditions (see
// @codexo/exojs-config/vitest `srcConditions`).
const aliasConfig = [
  { find: '@codexo/exojs/extensions', replacement: fileURLToPath(new URL('./src/extensions/index.ts', import.meta.url)) },
  { find: '@codexo/exojs/renderer-sdk', replacement: fileURLToPath(new URL('./src/renderer-sdk.ts', import.meta.url)) },
  { find: '@codexo/exojs/debug', replacement: fileURLToPath(new URL('./src/debug/index.ts', import.meta.url)) },
  { find: '@codexo/exojs', replacement: fileURLToPath(new URL('./src/index.ts', import.meta.url)) },
  // @codexo/exojs-tiled depends on @codexo/exojs-tilemap; neither package
  // exports a `@codexo/exojs-source` condition, so alias to source for in-repo tests.
  // @codexo/exojs-physics is aliased too so the example physics↔tilemap bridge
  // recipe (examples/shared/physics-tilemap.ts) can be unit-tested in-repo.
  { find: '@codexo/exojs-tilemap', replacement: fileURLToPath(new URL('./packages/exojs-tilemap/src/index.ts', import.meta.url)) },
  { find: '@codexo/exojs-tiled', replacement: fileURLToPath(new URL('./packages/exojs-tiled/src/index.ts', import.meta.url)) },
  { find: '@codexo/exojs-aseprite', replacement: fileURLToPath(new URL('./packages/exojs-aseprite/src/index.ts', import.meta.url)) },
  { find: '@codexo/exojs-ldtk', replacement: fileURLToPath(new URL('./packages/exojs-ldtk/src/index.ts', import.meta.url)) },
  { find: '@codexo/exojs-physics', replacement: fileURLToPath(new URL('./packages/exojs-physics/src/index.ts', import.meta.url)) },
] as const;

// Loads every shader source (`.vert`/`.frag`/`.wgsl`) as its REAL text, exactly
// as the production build does. Tests read what ships: the renderer performance
// harness reflects attribute names out of the actual GLSL, the parity specs
// compare the two languages' declarations against each other, and
// `ShaderSource` rejects an empty source outright.
const realShaderPlugin = createShaderPlugin();

// Shared resolution/plugin wiring for the repository-local browser projects.
//
// The top-level Vite `define` replaces `__DEV__` in files Vite transforms
// directly. Under the `#` subpath-imports model some engine modules (e.g.
// `src/core/dev.ts`) resolve through `package.json#imports` and can be
// pre-bundled by esbuild's optimizer, which does NOT apply this `define` - so
// the bare `__DEV__` would survive and throw `__DEV__ is not defined` in the
// browser runtime. The `_setup-dev-global` setup file (wired into every browser
// project below) installs `__DEV__` as a real global so the reference resolves
// regardless of how the module was bundled.
const browserBase = {
  resolve: { alias: aliasConfig, conditions: srcConditions },
  ssr: { resolve: { conditions: srcConditions } },
  // `workletTransformPlugin` and `workerTransformPlugin` are the real (non-stub)
  // transforms - the browser-audio-chromium project renders converted worklets
  // through a genuine AudioContext and browser-tilemap-chromium runs worker
  // sources in a genuine Worker, so both need functioning code, not a stub.
  plugins: [realShaderPlugin, workletTransformPlugin, workerTransformPlugin],
  define: { __DEV__: JSON.stringify(true), __VERSION__: JSON.stringify('0.0.0'), __REVISION__: JSON.stringify('test') },
} as const;

// Per-project browser headedness:
//  - WebGL2 Chromium: new headless. EXOJS_BROWSER_HEADED=1 only for local headed debug.
//  - WebGL2 Firefox:  headless locally (Windows/macOS need no X server and give a
//    context either way); headed under xvfb in CI via EXOJS_FIREFOX_CI_HEADED=1,
//    because Firefox on Linux disables WebGL entirely in headless mode.
//  - WebGPU Chromium: headless by default (safe for local dev with no display server).
//    CI opts into headed mode via EXOJS_WEBGPU_CI_HEADED=1 - Mesa lavapipe needs a
//    real display to report a real Vulkan adapter instead of falling back to
//    SwiftShader, and CI supplies one via xvfb (see `browser-tests-webgpu-chromium`
//    in `_ci-checks.yml`). Without this gate, `headless: false` would pop a real,
//    visible Chromium window on every local `pnpm test:browser:webgpu` run.
//  - WebGPU Firefox:  headed - Firefox only exposes a WebGPU adapter in a headed session.
const headed = process.env['EXOJS_BROWSER_HEADED'] === '1';
const webgl2Headless = !headed;
const webgpuCiHeaded = process.env['EXOJS_WEBGPU_CI_HEADED'] === '1';
const firefoxCiHeaded = process.env['EXOJS_FIREFOX_CI_HEADED'] === '1';

// Setup run in every browser project to install the `__DEV__` global (see the
// browserBase note) before any engine module evaluates.
const browserSetupFiles = ['./test/rendering/browser/_setup-dev-global.ts'];

const renderingBrowserSetupFiles = browserSetupFiles;

// The parity runner executes in the browser and cannot write files, so it hands
// its evidence rows to these node-side commands.
const parityCommands = { writeParityEvidence, resetParityEvidence };

// The WebGPU allocation cell runs in the page; V8's allocation sampler is
// reachable only over CDP, which lives on the node side. See the command module.
const allocationCommands = { startHeapSampling, stopHeapSampling, emitAllocationRecord };

export default defineConfig({
  test: {
    coverage: {
      provider: 'istanbul',
      reporter: ['lcov', 'clover', 'text-summary'],
      // Core plus every extension package with a vitest project in
      // `test:coverage` - all packages have suites, so they all count.
      include: [
        'src/**/*.ts',
        'packages/exojs-particles/src/**/*.ts',
        'packages/exojs-tilemap/src/**/*.ts',
        'packages/exojs-tiled/src/**/*.ts',
        'packages/exojs-physics/src/**/*.ts',
        'packages/exojs-audio-fx/src/**/*.ts',
        'packages/exojs-aseprite/src/**/*.ts',
        'packages/exojs-ldtk/src/**/*.ts',
        'packages/exojs-react/src/**/*.tsx',
        'packages/exojs-react/src/**/*.ts',
      ],
      exclude: ['src/**/*.d.ts', 'packages/*/src/**/*.d.ts'],
      // Hard regression gate for the `unit-tests` job (already required in
      // `_ci-checks.yml`) - `.codecov.yml` posts project/patch coverage statuses
      // but they are NOT wired up as required checks, so a coverage drop
      // currently merges silently. These thresholds fail `pnpm test:coverage`
      // itself (the exact command the CI job runs) below the floor.
      //
      // A ratchet floor, not a target: set a few points below the measured
      // baseline (statements 86.61%, branches 81.95%, functions 90.31%, lines
      // 86.73% as of 2026-07-04 after the fleet-4 pass over the extension
      // packages - physics/audio-fx/tilemap/particles/tiled/ldtk/aseprite/
      // react; remaining gaps are almost entirely GPU renderer files covered
      // by the browser lanes) so normal test-suite churn doesn't flake the
      // gate, while still catching a real regression. Raise the floor as
      // coverage grows - never lower it without an explicit reason recorded
      // here.
      thresholds: {
        statements: 84,
        branches: 79,
        functions: 88,
        lines: 84,
      },
    },
    projects: [
      // ── jsdom unit/integration projects (Core + extensions) ──────────────
      // Every project loads shader sources as their real text - the same loader
      // the production build uses. An earlier stub blanked `.vert`/`.frag` to
      // `""`, which ran the biggest test project (`test:core`) against blank
      // shaders and made GLSL regressions invisible outside the 3 browser lanes
      // and `rendering-perf`; it also forced per-path `vi.mock` workarounds
      // wherever `ShaderSource`'s non-empty-string validation ran at module
      // scope. jsdom has no WebGL2 context to actually compile against (that is
      // what the browser lanes are for), so
      // `test/rendering/shader-source-structure.test.ts` adds a GPU-free
      // structural check instead.
      {
        ...createJsdomTestProject({
          name: 'exojs',
          alias: aliasConfig,
          include: ['test/**/*.test.ts'],
          // The parity matrix runs in `browser-webgpu`: its runner imports the
          // browser context module, which throws on import under jsdom. The
          // WebGPU allocation cell is the same story one project further down
          // (`browser-webgpu-alloc`) - it needs a real adapter and a CDP session.
          exclude: [
            'test/rendering/browser/**/*.test.ts',
            'test/rendering/parity/**/*.test.ts',
            'test/perf/rendering/**/*.test.ts',
            'test/perf/webgpu/**/*.test.ts',
          ],
        }),
        plugins: [realShaderPlugin, workletTransformPlugin, workerTransformPlugin],
      },
      {
        ...createJsdomTestProject({
          name: 'exojs-particles',
          alias: aliasConfig,
          include: ['packages/exojs-particles/test/**/*.test.ts'],
        }),
        plugins: [realShaderPlugin, workletTransformPlugin, workerTransformPlugin],
      },
      createJsdomTestProject({
        name: 'exojs-tilemap',
        alias: aliasConfig,
        include: ['packages/exojs-tilemap/test/**/*.test.ts'],
        // The test/browser/** suite needs a real Worker + URL.createObjectURL and
        // runs in the browser-tilemap-chromium project; exclude it from jsdom.
        exclude: ['packages/exojs-tilemap/test/browser/**'],
      }),
      createJsdomTestProject({
        name: 'exojs-tiled',
        alias: aliasConfig,
        include: ['packages/exojs-tiled/test/**/*.test.ts'],
      }),
      createJsdomTestProject({
        name: 'exojs-aseprite',
        alias: aliasConfig,
        include: ['packages/exojs-aseprite/test/**/*.test.ts'],
      }),
      createJsdomTestProject({
        name: 'exojs-ldtk',
        alias: aliasConfig,
        include: ['packages/exojs-ldtk/test/**/*.test.ts'],
      }),
      createJsdomTestProject({
        name: 'exojs-physics',
        alias: aliasConfig,
        include: ['packages/exojs-physics/test/**/*.test.ts'],
      }),
      createJsdomTestProject({
        name: 'exojs-audio-fx',
        alias: aliasConfig,
        include: ['packages/exojs-audio-fx/test/**/*.test.ts'],
        // The test/browser/** suite needs a real OfflineAudioContext + AudioWorklet
        // and runs in the browser-audio-chromium project; exclude it from jsdom.
        exclude: ['packages/exojs-audio-fx/test/browser/**'],
      }),

      // ── exojs-react - jsdom + React Testing Library (esbuild JSX) ────────
      // The shared jsdom factory is reused unchanged; the only addition is the
      // esbuild automatic JSX runtime so `.tsx` test files need no React import.
      // It is set at the project level (like rendering-perf's `plugins`) so the
      // other jsdom projects keep esbuild's defaults byte-for-byte.
      {
        ...createJsdomTestProject({
          name: 'exojs-react',
          alias: aliasConfig,
          include: ['packages/exojs-react/test/**/*.{test.ts,test.tsx}'],
          setupFiles: ['./packages/exojs-react/test/setup.ts'],
        }),
        esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
      },

      // ── exojs-bench - cross-library benchmark harness unit tests ─────────
      // The benchmark package's pure unit tests (timing, mutation-determinism,
      // structural probes, archetype matrix). Its `#*` engine-source imports are
      // aliased to `<repo>/src` here - the package deliberately defines no
      // `imports` map (Node forbids a `../`-escaping target), mirroring the Vite
      // alias the driver installs at runtime (see rendering/driver.ts). The
      // browser-driving smoke test self-skips without a real GPU. Deliberately
      // NOT added to the default `test`/`test:coverage` gate: per the bench
      // methodology (CI tiering), competitor arms must never red a contributor
      // PR - run it on demand via `pnpm --filter @codexo/exojs-bench test`.
      createJsdomTestProject({
        name: 'exojs-bench',
        alias: [...aliasConfig, { find: /^#(.*)$/, replacement: `${fileURLToPath(new URL('./src', import.meta.url))}/$1` }],
        include: ['packages/exojs-bench/test/**/*.test.ts'],
      }),

      // ── exojs-build: the published build-tooling package ───────────────
      // Plain Node, no jsdom and none of the shader/worklet/worker plugins: the
      // subject under test IS those plugins, so installing them here would test
      // the transform through itself. The external-consumer spec packs the
      // package and drives real Vite and Rollup builds against the tarball,
      // which is why the timeout is minutes rather than seconds. The browser
      // fixtures under `test/browser` need a real Worker/AudioWorklet and run in
      // `browser-build-chromium` instead.
      {
        test: {
          name: 'exojs-build',
          environment: 'node',
          globals: true,
          include: ['packages/exojs-build/test/**/*.test.ts'],
          exclude: ['packages/exojs-build/test/browser/**'],
          testTimeout: 300_000,
          hookTimeout: 300_000,
        },
      },

      // ── rendering-perf - Node renderer benchmark harness (real shaders) ──
      // Runs the real WebGL2 renderers against a recording fake GL context for
      // deterministic, GPU-free structural metrics. Uses the real-shader loader
      // instead of the stub so GLSL reflection resolves. Structural regression
      // tests run in normal CI; the opt-in sweep self-skips unless EXOJS_PERF_PROFILE.
      {
        ...createJsdomTestProject({
          name: 'rendering-perf',
          alias: aliasConfig,
          include: ['test/perf/rendering/**/*.test.ts'],
          // The allocation gate is its own project - see `rendering-alloc`.
          exclude: ['test/perf/rendering/allocation.test.ts'],
        }),
        plugins: [realShaderPlugin],
      },

      // ── rendering-alloc - the steady-state allocation gate ───────────────
      // Same harness as `rendering-perf`, separate project for exactly one
      // reason: this gate must never run under coverage instrumentation.
      // Istanbul rewrites every statement, which defeats V8's escape analysis,
      // and the numbers stop describing the code we ship - `mesh/1000` reads
      // 71 KB/frame instrumented against 0.65 KB/frame plain, a 100x gap on one
      // machine with one Node build. Kept out of `test:coverage` and run by
      // `test:alloc` instead; the suite itself refuses to assert when it detects
      // instrumentation, so this split cannot be undone silently.
      {
        ...createJsdomTestProject({
          name: 'rendering-alloc',
          alias: aliasConfig,
          include: ['test/perf/rendering/allocation.test.ts'],
        }),
        plugins: [realShaderPlugin],
      },

      // ── browser-webgl-chromium - WebGL2 via Chromium headless ────────────
      {
        ...browserBase,
        test: {
          name: 'browser-webgl-chromium',
          globals: true,
          setupFiles: renderingBrowserSetupFiles,
          include: ['test/rendering/browser/webgl2-*.test.ts'],
          browser: {
            enabled: true,
            headless: webgl2Headless,
            provider: playwright({
              launchOptions: { channel: 'chromium', args: ['--enable-webgl', '--use-angle=swiftshader'] },
            }),
            instances: [{ browser: 'chromium' }],
          },
        },
      },

      // ── browser-webgl-firefox - WebGL2 via Firefox headless ──────────────
      // On Linux this lane failed every file on `getContext('webgl2') === null`
      // - "This browser or hardware does not support WebGL" - while
      // `continue-on-error` kept the check green. The cause is not configuration
      // but Firefox itself: it disables WebGL in headless mode, and no
      // preference overrides that (playwright#1032, vitest#21783 - still current). A
      // window is the only configuration with a context, so CI runs this headed
      // against xvfb's virtual display, the same recipe the Chromium WebGPU lane
      // uses. Locally it stays headless: Windows and macOS need no X server and
      // hand out a context either way, which is exactly why the CI gap went
      // unnoticed for so long.
      //
      // The prefs are belt-and-braces for the runner: `webgl.force-enabled`
      // overrides the driver blocklist that rejects unknown CI hardware, and
      // `gfx.webrender.software` selects the software backend - the counterpart
      // to Chromium's `--use-angle=swiftshader`. (`webgl.out-of-process: false`
      // was tried and rejected: it kills the browser connection mid-run.)
      {
        ...browserBase,
        test: {
          name: 'browser-webgl-firefox',
          globals: true,
          setupFiles: renderingBrowserSetupFiles,
          include: ['test/rendering/browser/webgl2-*.test.ts'],
          browser: {
            enabled: true,
            headless: !firefoxCiHeaded,
            provider: playwright({
              launchOptions: {
                firefoxUserPrefs: {
                  'webgl.force-enabled': true,
                  'webgl.disabled': false,
                  'gfx.webrender.software': true,
                  'webgl.angle.force-warp': true,
                },
              },
            }),
            instances: [{ browser: 'firefox' }],
          },
        },
      },

      // ── browser-webgpu - WebGPU via Chromium (SwiftShader software backend) ──
      // The `--enable-features=Vulkan` / `--disable-vulkan-surface` flags are the
      // three.js-proven recipe for headless WebGPU on a free `ubuntu-latest`
      // runner (confirmed against three.js's own CI recipe, which matches this
      // baseline). Two later attempts to force real Mesa-lavapipe/Vulkan routing
      // via `--use-angle=vulkan` (optionally combined with
      // `--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan`) both
      // regressed `requestAdapter()` to returning `null` for almost every test -
      // the WebGPU browser suite dropped from 100/100 tests actually exercised
      // down to ~4/100, with the rest silently skip-passing. Reverted to this
      // plain baseline, which runs the full suite against Chromium's bundled
      // SwiftShader software WebGPU implementation - a real, working software
      // backend, just not Mesa lavapipe. Locally these args are harmless
      // (verified against a real Windows/NVIDIA adapter). `headless` stays true
      // by default so local dev never pops a visible browser window; CI opts
      // into `headless: false` via `EXOJS_WEBGPU_CI_HEADED=1` (see
      // `browser-tests-webgpu-chromium` in `_ci-checks.yml`).
      {
        ...browserBase,
        test: {
          name: 'browser-webgpu',
          globals: true,
          setupFiles: renderingBrowserSetupFiles,
          include: ['test/rendering/browser/webgpu-*.test.ts', 'test/rendering/parity/**/*.test.ts'],
          browser: {
            enabled: true,
            commands: parityCommands,
            headless: !webgpuCiHeaded,
            provider: playwright({
              launchOptions: {
                channel: 'chromium',
                args: [
                  '--enable-unsafe-webgpu',
                  '--enable-features=Vulkan',
                  '--disable-vulkan-surface',
                  '--ignore-gpu-blocklist',
                  '--no-sandbox',
                  '--disable-gpu-watchdog',
                  '--disable-gpu-driver-bug-workarounds',
                ],
              },
            }),
            instances: [{ browser: 'chromium' }],
          },
        },
      },

      // ── browser-webgpu-alloc - the WebGPU allocation audit harness ───────
      // Never part of `pnpm test`: it is driven one scene per invocation by
      // `test/perf/webgpu/run-webgpu-allocation.ts`, because a steady-state
      // allocation number is only a source of truth when nothing else rendered
      // in the same process first (the lesson `scrolling-world/10000` records in
      // `allocationScenes.ts`). The scene and the window shape arrive as
      // build-time defines rather than as test names so the run stays a single
      // test with a single browser.
      //
      // Same launch recipe as `browser-webgpu` on purpose - a measurement lane
      // that configured the adapter differently from the lane that proves
      // correctness would be measuring a renderer nobody ships.
      {
        ...browserBase,
        define: {
          ...browserBase.define,
          __EXOJS_ALLOC_ID__: JSON.stringify(process.env['EXOJS_ALLOC_ID'] ?? ''),
          __EXOJS_ALLOC_MODE__: JSON.stringify(process.env['EXOJS_ALLOC_MODE'] ?? 'alloc'),
          __EXOJS_ALLOC_FRAMES__: JSON.stringify(Number(process.env['EXOJS_ALLOC_FRAMES'] ?? 200)),
          __EXOJS_ALLOC_WARMUP__: JSON.stringify(Number(process.env['EXOJS_ALLOC_WARMUP'] ?? 0)),
          __EXOJS_ALLOC_TOP__: JSON.stringify(Number(process.env['EXOJS_ALLOC_TOP'] ?? 0)),
          __EXOJS_ALLOC_REPEATS__: JSON.stringify(Number(process.env['EXOJS_ALLOC_REPEATS'] ?? 1)),
        },
        test: {
          name: 'browser-webgpu-alloc',
          globals: true,
          setupFiles: renderingBrowserSetupFiles,
          include: ['test/perf/webgpu/webgpu-allocation-cell.test.ts'],
          testTimeout: 600_000,
          hookTimeout: 600_000,
          browser: {
            enabled: true,
            commands: allocationCommands,
            headless: !webgpuCiHeaded,
            provider: playwright({
              launchOptions: {
                channel: 'chromium',
                args: [
                  '--enable-unsafe-webgpu',
                  '--enable-features=Vulkan',
                  '--disable-vulkan-surface',
                  '--ignore-gpu-blocklist',
                  '--no-sandbox',
                  '--disable-gpu-watchdog',
                  '--disable-gpu-driver-bug-workarounds',
                ],
              },
            }),
            instances: [{ browser: 'chromium' }],
          },
        },
      },

      // ── browser-webgpu-firefox - WebGPU via Firefox headed ───────────────
      // `headless: false` is load-bearing, not a leftover: Firefox exposes
      // `navigator.gpu` either way, but `requestAdapter()` resolves to `null`
      // headless no matter which prefs are set (`dom.webgpu.enabled`,
      // `gfx.webgpu.force-enabled`, …). A window is the only configuration in
      // which Firefox has a WebGPU adapter at all - so this lane needs a real
      // display, which is why CI cannot run it and the matrix takes its Firefox
      // rows from local runs instead.
      {
        ...browserBase,
        test: {
          name: 'browser-webgpu-firefox',
          globals: true,
          setupFiles: renderingBrowserSetupFiles,
          include: ['test/rendering/browser/webgpu-*.test.ts', 'test/rendering/parity/**/*.test.ts'],
          browser: {
            enabled: true,
            commands: parityCommands,
            headless: false,
            provider: playwright(),
            instances: [{ browser: 'firefox' }],
          },
        },
      },

      // ── browser-parity-webkit - matrix rows from WebKit ──────────────────
      // Only the parity matrix, never the WebGPU spec suite: the Playwright
      // WebKit build has no `navigator.gpu` at all, so those specs would fail
      // on construction rather than report anything. The matrix instead records
      // `unavailable`, which is the finding. Headed for the same reason Firefox
      // is - if a WebGPU adapter appears on macOS, a window is the likeliest
      // configuration to get one, and a wrong `unavailable` row would be worse
      // than a visible browser during a manual run.
      {
        ...browserBase,
        test: {
          name: 'browser-parity-webkit',
          globals: true,
          setupFiles: renderingBrowserSetupFiles,
          include: ['test/rendering/parity/**/*.test.ts'],
          browser: {
            enabled: true,
            commands: parityCommands,
            headless: false,
            provider: playwright(),
            instances: [{ browser: 'webkit' }],
          },
        },
      },

      // ── browser-parity-safari - matrix rows from Safari itself ───────────
      // macOS only, and the reason it exists: Playwright's WebKit build has no
      // WebGPU, so its `unavailable` rows describe the test tool rather than
      // the browser. safaridriver drives the real Safari, which does ship
      // WebGPU - the rows land under the same `webkit` key and replace the
      // Playwright ones, since Safari is the measurement that speaks for users.
      //
      // Prerequisites on the Mac, once: `safaridriver --enable`, plus
      // Develop ▸ Allow Remote Automation in Safari's menu.
      //
      {
        ...browserBase,
        plugins: [realShaderPlugin, workletTransformPlugin, workerTransformPlugin],
        test: {
          name: 'browser-parity-safari',
          globals: true,
          setupFiles: browserSetupFiles,
          include: ['test/rendering/parity/**/*.test.ts'],
          browser: {
            enabled: true,
            commands: parityCommands,
            headless: false,
            provider: webdriverio(),
            instances: [{ browser: 'safari' }],
          },
        },
      },

      // ── browser-webgpu-firefox-dark - same as above, dark colour scheme ──
      {
        ...browserBase,
        test: {
          name: 'browser-webgpu-firefox-dark',
          globals: true,
          setupFiles: renderingBrowserSetupFiles,
          include: ['test/rendering/browser/webgpu-*.test.ts'],
          browser: {
            enabled: true,
            headless: false,
            provider: playwright(),
            instances: [{ browser: 'firefox', contextOptions: { colorScheme: 'dark' } }],
          },
        },
      },

      // ── browser-audio-chromium - real OfflineAudioContext + AudioWorklet ──
      // Renders the audio-fx worklet effects through a real Web Audio engine in
      // headless Chromium (the jsdom AudioContext mock cannot render). This is
      // the acoustic-contract layer for our own DSP (PitchShift/Vocoder/Granular)
      // - exactly where the shipped pitch/gain bugs lived. Path-gated in CI so it
      // only runs when audio-fx changes.
      {
        ...browserBase,
        test: {
          name: 'browser-audio-chromium',
          globals: true,
          setupFiles: browserSetupFiles,
          include: ['packages/exojs-audio-fx/test/browser/**/*.test.ts'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({ launchOptions: { channel: 'chromium' } }),
            instances: [{ browser: 'chromium' }],
          },
        },
      },

      // ── browser-tilemap-chromium - real Worker for WorkerSampledChunkSource ──
      // Runs the worker-backed procedural chunk provider through a real Worker in
      // headless Chromium (jsdom implements neither Worker nor
      // URL.createObjectURL). Path-gated in CI so it only runs when exojs-tilemap
      // changes.
      {
        ...browserBase,
        test: {
          name: 'browser-tilemap-chromium',
          globals: true,
          setupFiles: browserSetupFiles,
          include: ['packages/exojs-tilemap/test/browser/**/*.test.ts'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({ launchOptions: { channel: 'chromium' } }),
            instances: [{ browser: 'chromium' }],
          },
        },
      },

      // ── browser-build-chromium: the inlined strings, actually executed ──
      // The `?worklet`/`?worker` transforms only pay off if the string they
      // emit runs where it is meant to. jsdom implements neither
      // `audioWorklet.addModule` nor `Worker`/`URL.createObjectURL`, so the
      // node lane can prove the bundle's shape but not that a real engine
      // accepts it. These specs take the emitted source through the production
      // path - Blob, object URL, real AudioWorklet and real Worker - which is
      // also the DX a consumer of `@codexo/exojs-build` writes by hand.
      {
        ...browserBase,
        test: {
          name: 'browser-build-chromium',
          globals: true,
          include: ['packages/exojs-build/test/browser/**/*.test.ts'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({ launchOptions: { channel: 'chromium' } }),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
  benchmark: {
    include: ['test/bench/**/*.bench.ts'],
  },
});
