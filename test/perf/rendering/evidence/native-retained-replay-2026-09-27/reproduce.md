# Reproduce the integrated measurement

Use the source accompanying this report and installed development dependencies. Verify the source manifest, then create the following disposable files under `.cache/native-integrated/`. Run `node .cache/native-integrated/run.mjs` from the repository root for timing, or add `--parity-only` for a separate correctness acquisition. Each runs three fresh processes per scale cell. No maintained runtime switch is added. The archived idle acquisition uses this corrected parity settling after timing. Reserve the PC for the run and do not run concurrent builds or tests.

## run.mjs

```js
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createShaderPlugin } from '@codexo/exojs-build';
import { chromium } from 'playwright';
const require = createRequire(import.meta.url);
const { createServer } = await import(pathToFileURL(createRequire(require.resolve('vitest/package.json')).resolve('vite')).href);
const names = ['WebGpuSpriteRenderer.ts', 'WebGpuTextRenderer.ts', 'WebGpuScalableSpriteRenderer.ts', 'WebGpuTileChunkRenderer.ts'];
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  optimizeDeps: { noDiscovery: true, entries: [] },
  resolve: {
    conditions: ['@codexo/exojs-source'],
    alias: [
      { find: '@codexo/exojs/renderer-sdk', replacement: `${process.cwd()}/src/renderer-sdk.ts` },
      { find: /^@codexo\/exojs$/, replacement: `${process.cwd()}/src/index.ts` },
    ],
  },
  define: { __DEV__: 'false', __VERSION__: '"phase2"', __REVISION__: '"phase2"' },
  plugins: [
    createShaderPlugin(),
    {
      name: 'integrated-baseline-toggle',
      enforce: 'pre',
      transform(code, id) {
        if (!names.some(n => id.endsWith('/' + n))) return;
        return code.replace('!nativeCompatible ||', '!globalThis.bundleMode || !nativeCompatible ||');
      },
    },
  ],
  server: {
    host: '127.0.0.1',
    port: 5200,
    strictPort: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
const cells = [
  { id: '10k', count: 10000, runLength: 64 },
  { id: '50k', count: 50000, runLength: 64 },
  { id: '100k', count: 100000, runLength: 64 },
];
const requested = process.argv.slice(2).find(arg => !arg.startsWith('--'));
const selected = requested ? cells.filter(c => c.id === requested) : cells;
if (requested && !selected.length) selected.push({ id: requested, count: 10000, runLength: 64, mode: requested });
const parityOnly = process.argv.includes('--parity-only');
if (parityOnly) for (const cell of selected) cell.parityOnly = true;
const outputName = parityOnly ? 'parity' : (requested ?? 'scale');
const resultFile = `.cache/native-integrated/${outputName}-results.json`;
const previous = process.argv.includes('--resume') && existsSync(resultFile) ? JSON.parse(readFileSync(resultFile, 'utf8')) : null;
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (previous && previous.revision !== revision) throw Error('Cannot resume a different source revision');
const results = previous?.results ?? [];
await server.listen();
try {
  for (let run = 0; run < 3; run++) {
    for (const cell of selected) {
      if (results.some(result => result.run === run && result.cell.id === cell.id)) continue;
      const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--ignore-gpu-blocklist', '--enable-webgpu'] });
      try {
        const page = await browser.newPage();
        page.on('pageerror', e => console.error(e));
        page.on('console', msg => {
          if (msg.text().startsWith('PROGRESS')) console.log(msg.text());
        });
        await page.goto(`http://127.0.0.1:5200/.cache/native-integrated/${cell.mode ? 'dynamic' : 'index'}.html`, { timeout: 120000 });
        await page.waitForFunction(() => typeof window.probe === 'function', null, { timeout: 120000 });
        const result = await page.evaluate(cell => window.probe(cell), cell);
        results.push({ run, browser: browser.version(), ...result });
        writeFileSync(
          `.cache/native-integrated/${outputName}-results.json`,
          JSON.stringify(
            {
              revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
              tree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim(),
              date: new Date().toISOString(),
              results,
            },
            null,
            2,
          ),
        );
        console.log(
          JSON.stringify({
            run,
            id: cell.id,
            batches: result.batches,
            parity: result.parity,
            maxBuilds: result.promotion ? Math.max(...result.promotion.map(f => f.builds)) : null,
            saving: result.saving,
          }),
        );
      } finally {
        await browser.close();
      }
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
  globalThis.bundleMode = false;
  globalThis.bundleCache = new WeakMap();
  globalThis.bundleBuilds = 0;
  globalThis.profileBuilds = false;
  globalThis.buildMs = 0;
  window.probe = async cell => {
    const h = await createWebGpuHarness();
    if (!h) throw Error('No WebGPU adapter');
    const { backend, device } = h;
    const errors = [];
    let builds = 0;
    const encode = device.createRenderBundleEncoder.bind(device);
    device.createRenderBundleEncoder = d => {
      builds++;
      return encode(d);
    };
    device.addEventListener('uncapturederror', e => errors.push(e.error.message));
    device.pushErrorScope('validation');
    const target = backend.acquireRenderTexture(1280, 720);
    backend.setRenderTarget(target);
    backend.setView(target.view);
    const texture = makeCanvasTexture(8, 1);
    const { root, sprites } = buildSpriteScene({
      count: cell.count,
      textures: [texture],
      size: 8,
      blendModes: cell.stress ? [BlendModes.Normal, BlendModes.Multiply] : [BlendModes.Normal, BlendModes.Additive, BlendModes.Subtract, BlendModes.Multiply],
      blendRunLength: cell.runLength,
    });
    if (cell.stress) root.preserveDrawOrder = true;
    let frameNo = 0,
      evictCursor = 0,
      evictDebt = 0,
      evictRate = 0;
    let payloads = [];
    const frame = () => {
      evictDebt += payloads.length * evictRate;
      while (evictDebt >= 1) {
        globalThis.bundleCache.delete(payloads[evictCursor++ % payloads.length]);
        evictDebt--;
      }
      if (cell.mode === 'camera') target.view.setCenter(640 + (frameNo % 2), 360);
      frameNo++;
      renderOnce(h, root);
    };
    const step = async () => {
      frame();
      await device.queue.onSubmittedWorkDone();
    };
    const median = a => [...a].sort((a, b) => a - b)[Math.floor(a.length / 2)];
    for (let i = 0; i < 120; i++) await step();
    const seen = new Set();
    const rendererCounts = {};
    const replay = backend.replayRetainedBatch;
    backend.replayRetainedBatch = function (batch) {
      seen.add(batch.payload);
      const name = batch.payload.renderer.constructor.name;
      rendererCounts[name] = (rendererCounts[name] ?? 0) + 1;
      return replay.call(this, batch);
    };
    await step();
    backend.replayRetainedBatch = replay;
    payloads = [...seen];
    const batches = backend.stats.batches;
    if (batches !== payloads.length || !batches) throw Error('Non-retained work: ' + batches + '/' + payloads.length);
    if (cell.stress && batches !== 2000) throw Error('Stress batch count ' + batches);
    const info = device.adapterInfo;
    const result = {
      cell,
      batches,
      rendererCounts,
      adapter: { vendor: info.vendor, architecture: info.architecture, device: info.device, description: info.description },
      isolated: crossOriginIsolated,
      cold: [],
      samples: [],
    };
    if (!cell.parityOnly) {
      globalThis.bundleMode = true;
      const buildFrames = [];
      for (let i = 0; i < 32 + Math.ceil(batches / 32) + 5; i++) {
        const before = builds,
          start = performance.now();
        frame();
        const ms = performance.now() - start;
        await device.queue.onSubmittedWorkDone();
        buildFrames.push({ frame: i, builds: builds - before, ms });
        if (builds - before > 32) throw Error('Build budget exceeded');
      }
      if (builds !== batches) throw Error('Incomplete promotion ' + builds + '/' + batches);
      result.promotion = buildFrames;
      for (let block = 0; block < 8; block++) {
        for (const mode of block % 2 ? [true, false] : [false, true]) {
          globalThis.bundleMode = mode;
          for (let i = 0; i < 100; i++) await step();
          const before = builds,
            rawMs = [];
          for (let i = 0; i < 100; i++) {
            const start = performance.now();
            frame();
            rawMs.push(performance.now() - start);
            await device.queue.onSubmittedWorkDone();
          }
          result.samples.push({ block, mode: mode ? 'bundle' : 'baseline', medianMs: median(rawMs), builds: builds - before, rawMs });
        }
      }
      result.saving = median(
        Array.from(
          { length: 8 },
          (_, block) =>
            result.samples.find(s => s.block === block && s.mode === 'baseline').medianMs -
            result.samples.find(s => s.block === block && s.mode === 'bundle').medianMs,
        ),
      );
    }
    evictRate = 0;
    evictDebt = 0;
    let executions = 0;
    const execute = GPURenderPassEncoder.prototype.executeBundles;
    GPURenderPassEncoder.prototype.executeBundles = function (bundles) {
      executions += bundles.length;
      return execute.call(this, bundles);
    };
    const captureCounts = [];
    const capture = async mode => {
      globalThis.bundleMode = mode;
      frameNo = 0;
      const before = executions;
      frame();
      await device.queue.onSubmittedWorkDone();
      captureCounts.push(executions - before);
      return backend.readPixels(target, 0, 0, 1280, 720);
    };
    const a = await capture(false);
    globalThis.bundleMode = true;
    for (let i = 0; i < 100; i++) await step();
    const b = await capture(true),
      c = await capture(true);
    GPURenderPassEncoder.prototype.executeBundles = execute;
    if (captureCounts[0] !== 0 || captureCounts[1] !== batches || captureCounts[2] !== batches)
      throw Error('Parity did not exercise native replay ' + captureCounts);
    const differences = (a, b) => a.reduce((n, v, i) => n + (v !== b[i] ? 1 : 0), 0);
    backend.clear();
    backend.flush();
    await device.queue.onSubmittedWorkDone();
    const blank = await backend.readPixels(target, 0, 0, 1280, 720);
    result.parity = { captureCounts, differences: differences(a, b), replayDifferences: differences(a, c), clearDifferences: differences(a, blank) };
    const validation = await device.popErrorScope();
    if (validation) errors.push(validation.message);
    result.errors = errors;
    if (result.parity.differences || result.parity.replayDifferences || !result.parity.clearDifferences || errors.length)
      throw Error(JSON.stringify({ parity: result.parity, errors }));
    root.destroy();
    texture.destroy();
    backend.setRenderTarget(null);
    backend.releaseRenderTexture(target);
    h.destroy();
    return result;
  };
</script>
```
