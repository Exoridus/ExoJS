# Archived render-bundle reproducer

This is a disposable source snapshot, not a supported runtime feature or maintained performance gate. Use source revision `07d5ea5496381a24b82d491edf763578448574c5` with the repository's development dependencies and Playwright Chromium installed. The browser probe uses internal renderer state and is intentionally limited to the static fixture in the report.

Create an ignored `.cache/render-bundle-spike/` directory at the repository root and save the three code blocks below with the indicated filenames. The path has been normalized for reproduction. Timing acquisition is unchanged; the parity check now uses a RenderTexture and synchronized readback instead of canvas presentation. From the repository root run `node .cache/render-bundle-spike/run.mjs`, followed by `node .cache/render-bundle-spike/summarize.mjs`. The runner writes raw readings to `.cache/render-bundle-spike/results.json`, overwriting any previous run. Keep the committed readings untouched. It uses a local Vite server on port 5199 and launches three fresh headless Chromium processes sequentially.

The committed `results.json` can also be copied next to the summary script to recompute the report without reacquiring timings. The eligibility gate is evaluated on every new acquisition, so a different host may not enable the candidate. Vite transforms only the loaded sprite renderer; no engine source file is edited.

For a correctness-only acquisition, run `node .cache/render-bundle-spike/run.mjs --parity-only`. It checks the 10,000-sprite fixture in three fresh browser processes and writes `parity-results.json` separately, without replacing the historical timings. Changing from the canvas to the offscreen target explicitly resets the disposable native-bundle cache because the target format may differ. Pixel comparisons cover both bundle creation and cached replay, with a clear-only negative control to reject empty or stale readbacks. This does not establish general render-target invalidation support.

## run.mjs

```js
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const vitestRequire = createRequire(require.resolve('vitest/package.json'));
const { createServer } = await import(pathToFileURL(vitestRequire.resolve('vite')).href);
import { createShaderPlugin } from '@codexo/exojs-build';
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const source = readFileSync('src/rendering/webgpu/WebGpuSpriteRenderer.ts', 'utf8');
const start = source.indexOf('    pass.setPipeline(', source.indexOf('public replayRetainedBatch('));
const end = source.indexOf('\n\n    if (customResources', start);
if (start < 0 || end < 0) throw new Error('Replay seam missing');
const commands = source.slice(start, end);
const replacement = `
    if (globalThis.bundleMode) {
      let native = globalThis.bundleCache.get(payload);
      if (!native) {
        const pass = device.createRenderBundleEncoder({ colorFormats: [backend.renderTargetFormat] });
        ${commands}
        native = [pass.finish()];
        globalThis.bundleCache.set(payload, native);
        globalThis.bundleBuilds++;
      }
      pass.executeBundles(native);
    } else {
      ${commands}
    }
`;
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  optimizeDeps: { noDiscovery: true, entries: [] },
  resolve: { conditions: ['@codexo/exojs-source'] },
  define: { __DEV__: 'false', __VERSION__: '"spike"', __REVISION__: '"spike"' },
  plugins: [
    createShaderPlugin(),
    {
      name: 'throwaway-native-bundle-probe',
      enforce: 'pre',
      transform(code, id) {
        if (id.replaceAll('\\', '/').endsWith('/WebGpuSpriteRenderer.ts')) {
          if (!code.includes(commands)) throw new Error('Replay seam changed');
          return code.replace(commands, replacement);
        }
      },
    },
  ],
  server: {
    host: '127.0.0.1',
    port: 5199,
    strictPort: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
await server.listen();
const results = [];
const parityOnly = process.argv.includes('--parity-only');
try {
  for (let run = 0; run < 3; run++) {
    const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--ignore-gpu-blocklist', '--enable-webgpu'] });
    try {
      const page = await browser.newPage();
      page.on('pageerror', error => console.error(error));
      await page.goto('http://127.0.0.1:5199/.cache/render-bundle-spike/index.html', { timeout: 120000 });
      await page.waitForFunction(() => typeof window.probe === 'function');
      for (const count of parityOnly ? [10000] : [1000, 10000]) {
        const result = await page.evaluate(({ count, parityOnly }) => window.probe(count, parityOnly), { count, parityOnly });
        results.push({ run, browser: browser.version(), ...result });
        writeFileSync(
          `.cache/render-bundle-spike/${parityOnly ? 'parity-results' : 'results'}.json`,
          JSON.stringify(
            { revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), date: new Date().toISOString(), results },
            null,
            2,
          ),
        );
        console.log(JSON.stringify({ ...results.at(-1), samples: result.samples.map(({ rawMs, ...sample }) => sample) }));
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}
```

## index.html

```html
<script type="module">
  import { createWebGpuHarness, makeCanvasTexture, renderOnce } from '/test/perf/webgpu/webgpuAllocHarness.ts';
  import { buildSpriteScene } from '/test/perf/rendering/fixtures.ts';
  import { BlendModes } from '/src/rendering/types.ts';
  globalThis.__DEV__ = false;
  globalThis.bundleCache = new WeakMap();
  globalThis.bundleBuilds = 0;
  globalThis.bundleMode = false;
  window.probe = async (count, parityOnly = false) => {
    const harness = await createWebGpuHarness();
    if (!harness) throw new Error('No hardware WebGPU adapter');
    const { backend, device } = harness;
    const errors = [];
    device.addEventListener('uncapturederror', event => errors.push(event.error.message));
    device.pushErrorScope('validation');
    const texture = makeCanvasTexture(8, 1);
    const { root } = buildSpriteScene({
      count,
      textures: [texture],
      size: 8,
      blendModes: [BlendModes.Normal, BlendModes.Additive, BlendModes.Subtract, BlendModes.Multiply],
      blendRunLength: 64,
    });
    const frame = () => renderOnce(harness, root);
    const step = async () => {
      frame();
      await device.queue.onSubmittedWorkDone();
    };
    const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    globalThis.bundleMode = false;
    for (let i = 0; i < 150; i++) await step();
    let replayMs = 0,
      replayCalls = 0;
    const replay = backend.replayRetainedBatch;
    backend.replayRetainedBatch = function (batch) {
      const start = performance.now();
      replay.call(this, batch);
      replayMs += performance.now() - start;
      replayCalls++;
    };
    for (let i = 0; i < 100; i++) await step();
    backend.replayRetainedBatch = replay;
    const batches = backend.stats.batches;
    const info = device.adapterInfo;
    const result = {
      count,
      batches,
      replayCallsPerFrame: replayCalls / 100,
      instrumentedReplayMs: replayMs / 100,
      isolated: crossOriginIsolated,
      adapter: { vendor: info.vendor, architecture: info.architecture, device: info.device, description: info.description },
      samples: [],
    };
    const allowed = batches >= 100 && replayCalls > 0 && (parityOnly || replayMs / 100 >= 0.1);
    const buildsBefore = globalThis.bundleBuilds;
    for (let block = 0; block < (parityOnly ? 0 : 8); block++) {
      for (const mode of block % 2 ? [true, false] : [false, true]) {
        if (mode && !allowed) continue;
        globalThis.bundleMode = mode;
        for (let i = 0; i < 30; i++) await step();
        const samples = [];
        for (let i = 0; i < 100; i++) {
          const start = performance.now();
          frame();
          samples.push(performance.now() - start);
          await device.queue.onSubmittedWorkDone();
        }
        result.samples.push({ block, mode: mode ? 'bundle' : 'baseline', medianMs: median(samples), rawMs: samples });
      }
    }
    result.bundleBuilds = globalThis.bundleBuilds - buildsBefore;
    if (allowed) {
      const previousTarget = backend.renderTarget;
      const target = backend.acquireRenderTexture(1280, 720);
      backend.setRenderTarget(target);
      globalThis.bundleMode = false;
      globalThis.bundleCache = new WeakMap();
      await step();
      await step();
      const parityBuildsBefore = globalThis.bundleBuilds;
      const capture = async mode => {
        globalThis.bundleMode = mode;
        frame();
        await device.queue.onSubmittedWorkDone();
        return backend.readPixels(target, 0, 0, 1280, 720);
      };
      const baseline = await capture(false);
      const candidate = await capture(true);
      result.parityBatches = backend.stats.batches;
      const replayed = await capture(true);
      result.parityBundleBuilds = globalThis.bundleBuilds - parityBuildsBefore;
      result.parityReadback = 'RenderTexture/readPixels';
      result.pixelByteDifferences = baseline.reduce((sum, value, i) => sum + (value !== candidate[i] ? 1 : 0), 0);
      result.replayPixelByteDifferences = baseline.reduce((sum, value, i) => sum + (value !== replayed[i] ? 1 : 0), 0);
      result.nonzeroRgbBytes = baseline.reduce((sum, value, i) => sum + (i % 4 !== 3 && value !== 0 ? 1 : 0), 0);
      backend.clear();
      backend.flush();
      await device.queue.onSubmittedWorkDone();
      const cleared = await backend.readPixels(target, 0, 0, 1280, 720);
      result.clearControlDifferences = baseline.reduce((sum, value, i) => sum + (value !== cleared[i] ? 1 : 0), 0);
      backend.setRenderTarget(previousTarget);
      backend.releaseRenderTexture(target);
      globalThis.bundleCache = new WeakMap();
      if (result.pixelByteDifferences !== 0 || result.replayPixelByteDifferences !== 0) throw new Error('Pixel mismatch');
      if (!result.nonzeroRgbBytes || !result.clearControlDifferences) throw new Error('Empty or stale readback');
      if (result.parityBundleBuilds !== result.parityBatches || result.parityBatches < 100) throw new Error('Native replay not exercised');
    }
    await device.queue.onSubmittedWorkDone();
    const validation = await device.popErrorScope();
    if (validation) errors.push(validation.message);
    result.errors = errors;
    root.destroy();
    texture.destroy();
    harness.destroy();
    if (errors.length) throw new Error(errors.join('\n'));
    return result;
  };
</script>
```

## summarize.mjs

```js
import { readFileSync } from 'node:fs';
const { results } = JSON.parse(readFileSync(new URL('./results.json', import.meta.url)));
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
for (const result of results) {
  const baseline = median(result.samples.filter(s => s.mode === 'baseline').map(s => s.medianMs));
  const candidate = result.samples.filter(s => s.mode === 'bundle');
  const bundle = candidate.length ? median(candidate.map(s => s.medianMs)) : null;
  const paired = candidate.map(s => result.samples.find(b => b.block === s.block && b.mode === 'baseline').medianMs - s.medianMs);
  console.log(
    JSON.stringify({
      run: result.run,
      count: result.count,
      batches: result.batches,
      baseline,
      bundle,
      pairedMedianSavingMs: paired.length ? median(paired) : null,
      positivePairs: paired.filter(value => value > 0).length,
      instrumentedReplayMs: result.instrumentedReplayMs,
      pixelByteDifferences: result.pixelByteDifferences,
      bundleBuilds: result.bundleBuilds,
      errors: result.errors,
    }),
  );
}
```
