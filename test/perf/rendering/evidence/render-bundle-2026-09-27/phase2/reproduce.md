# Phase 2 reproducer

Use the source revision and prerequisites in the adjacent report. Save the following snapshots under ignored `.cache/render-bundle-phase2/` at the repository root. Run `node .cache/render-bundle-phase2/run.mjs` for scale, then run it with each argument `camera`, `texture`, `groups`, `mixed` sequentially. Each invocation acquires three new browser processes per cell and overwrites its result file. `--resume` explicitly resumes missing cells of the same source revision. Do not run measurement browsers concurrently.

Run `node .cache/render-bundle-phase2/summarize.mjs` with the same optional cell-set argument to derive summaries. Copying committed raw result files into that scratch directory permits analysis without reacquisition. The optional plot script requires existing matplotlib and numpy and reads the scale summary; it does not affect measurement.

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
      name: 'disposable-bundle-matrix',
      enforce: 'pre',
      transform(code, id) {
        const name = names.find(name => id.replaceAll('\\', '/').endsWith('/' + name));
        if (!name) return;
        const method = code.indexOf('public replayRetainedBatch(');
        const start = code.indexOf('    pass.setPipeline(', method);
        const draw = code.indexOf('    pass.drawIndexed(', start);
        const end = code.indexOf(';', draw) + 1;
        if (method < 0 || start < 0 || draw < 0) throw Error('Missing replay seam ' + name);
        const commands = code.slice(start, end);
        const replacement = `
      if (globalThis.bundleMode) {
        let native = globalThis.bundleCache.get(payload);
        if (!native) {
          const began = globalThis.profileBuilds ? performance.now() : 0;
          const pass = device.createRenderBundleEncoder({ colorFormats: [backend.renderTargetFormat] });
          ${commands}
          native = [pass.finish()];
          globalThis.bundleCache.set(payload, native);
          globalThis.bundleBuilds++;
          if (globalThis.profileBuilds) globalThis.buildMs += performance.now() - began;
        }
        pass.executeBundles(native);
      } else {
        ${commands}
      }
      `;
        return code.slice(0, start) + replacement + code.slice(end);
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
const cells = [
  { id: '1k', count: 1000, runLength: 64 },
  { id: '10k', count: 10000, runLength: 64 },
  { id: '50k', count: 50000, runLength: 64 },
  { id: '100k', count: 100000, runLength: 64 },
  { id: 'stress-2000', count: 2000, runLength: 1, stress: true },
];
const requested = process.argv.slice(2).find(arg => !arg.startsWith('--'));
const selected = requested ? cells.filter(c => c.id === requested) : cells;
if (requested && !selected.length) selected.push({ id: requested, count: 10000, runLength: 64, mode: requested });
const resultFile = `.cache/render-bundle-phase2/${requested ?? 'scale'}-results.json`;
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
        await page.goto(`http://127.0.0.1:5199/.cache/render-bundle-phase2/${cell.mode ? 'dynamic' : 'index'}.html`, { timeout: 120000 });
        await page.waitForFunction(() => typeof window.probe === 'function', null, { timeout: 120000 });
        const result = await page.evaluate(cell => window.probe(cell), cell);
        results.push({ run, browser: browser.version(), ...result });
        writeFileSync(
          `.cache/render-bundle-phase2/${requested ?? 'scale'}-results.json`,
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
        console.log(JSON.stringify({ run, id: cell.id, batches: result.batches, parity: result.parity, cold: result.cold.map(p => p.coldMs - p.warmMs) }));
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
    globalThis.bundleMode = true;
    for (let i = 0; i < 30; i++) await step();
    for (let pair = 0; pair < 12; pair++) {
      const measure = async cold => {
        if (cold) globalThis.bundleCache = new WeakMap();
        const before = globalThis.bundleBuilds;
        const start = performance.now();
        frame();
        const ms = performance.now() - start;
        await device.queue.onSubmittedWorkDone();
        return { ms, builds: globalThis.bundleBuilds - before };
      };
      let cold, warm;
      if (pair % 2) {
        warm = await measure(false);
        cold = await measure(true);
      } else {
        cold = await measure(true);
        warm = await measure(false);
      }
      if (cold.builds !== batches || warm.builds !== 0) throw Error('Unexpected cold/warm builds');
      result.cold.push({ pair, coldMs: cold.ms, warmMs: warm.ms, builds: cold.builds });
    }
    globalThis.profileBuilds = true;
    globalThis.bundleCache = new WeakMap();
    globalThis.buildMs = 0;
    await step();
    result.instrumentedBuildMs = globalThis.buildMs;
    globalThis.profileBuilds = false;
    for (const rate of [0, 0.01, 0.05, 0.1]) {
      evictRate = rate;
      for (let block = 0; block < 6; block++) {
        for (const mode of block % 2 ? [true, false] : [false, true]) {
          globalThis.bundleMode = mode;
          evictCursor = 0;
          evictDebt = 0;
          for (let i = 0; i < 20; i++) await step();
          evictCursor = 0;
          evictDebt = 0;
          const before = globalThis.bundleBuilds,
            rawMs = [];
          for (let i = 0; i < 60; i++) {
            const start = performance.now();
            frame();
            rawMs.push(performance.now() - start);
            await device.queue.onSubmittedWorkDone();
          }
          result.samples.push({ rate, block, mode: mode ? 'bundle' : 'baseline', medianMs: median(rawMs), builds: globalThis.bundleBuilds - before, rawMs });
        }
      }
      console.log('PROGRESS ' + cell.id + ' rebuild ' + rate);
    }
    evictRate = 0;
    evictDebt = 0;
    const capture = async mode => {
      globalThis.bundleMode = mode;
      frameNo = 0;
      frame();
      await device.queue.onSubmittedWorkDone();
      return backend.readPixels(target, 0, 0, 1280, 720);
    };
    const a = await capture(false),
      b = await capture(true),
      c = await capture(true);
    const differences = (a, b) => a.reduce((n, v, i) => n + (v !== b[i] ? 1 : 0), 0);
    backend.clear();
    backend.flush();
    await device.queue.onSubmittedWorkDone();
    const blank = await backend.readPixels(target, 0, 0, 1280, 720);
    result.parity = { differences: differences(a, b), replayDifferences: differences(a, c), clearDifferences: differences(a, blank) };
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

## dynamic.html

```html
<script type="module">
  import { createWebGpuHarness, makeCanvasTexture, renderOnce } from '/test/perf/webgpu/webgpuAllocHarness.ts';
  import { buildSpriteScene } from '/test/perf/rendering/fixtures.ts';
  import { mixedScene } from './mixed.mjs';
  import { Container, RetainedContainer, Sprite } from '@codexo/exojs';
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
    device.addEventListener('uncapturederror', e => errors.push(e.error.message));
    device.pushErrorScope('validation');
    const target = backend.acquireRenderTexture(1280, 720);
    backend.setRenderTarget(target);
    backend.setView(target.view);
    const texture = makeCanvasTexture(8, 1);
    let { root, sprites } = buildSpriteScene({
      count: cell.count,
      textures: [texture],
      size: 8,
      blendModes: cell.stress ? [BlendModes.Normal, BlendModes.Additive] : [BlendModes.Normal, BlendModes.Additive, BlendModes.Subtract, BlendModes.Multiply],
      blendRunLength: cell.runLength,
    });
    let cleanup = () => {};
    const groups = [];
    if (cell.mode === 'mixed') {
      root.destroy();
      ({ root, sprites, cleanup } = mixedScene(backend, texture));
    }
    if (cell.mode === 'groups') {
      root.destroy();
      root = new Container();
      sprites = [];
      for (let g = 0; g < 100; g++) {
        const group = new RetainedContainer();
        for (let i = 0; i < 100; i++) {
          const sprite = new Sprite(texture);
          sprite.setPosition((i % 10) * 8, Math.floor(i / 10) * 8);
          group.addChild(sprite);
        }
        group.setPosition((g % 10) * 96, Math.floor(g / 10) * 60);
        root.addChild(group);
        groups.push(group);
      }
    }
    let groupInvalidations = 0;
    let frameNo = 0,
      evictCursor = 0,
      evictDebt = 0,
      evictRate = 0;
    let payloads = [];
    const frame = () => {
      evictDebt += (cell.mode === 'groups' ? groups.length : payloads.length) * evictRate;
      while (evictDebt >= 1) {
        if (cell.mode === 'groups') {
          groups[evictCursor++ % groups.length].invalidateContent();
          groupInvalidations++;
        } else globalThis.bundleCache.delete(payloads[evictCursor++ % payloads.length]);
        evictDebt--;
      }
      if (cell.mode === 'camera') target.view.setCenter(640 + (frameNo % 2), 360);
      if (cell.mode === 'texture') {
        const ctx = texture.source.getContext('2d');
        ctx.fillStyle = frameNo % 2 ? '#ff4040' : '#4080ff';
        ctx.fillRect(0, 0, 8, 8);
        texture.updateSource();
      }
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
    globalThis.bundleMode = true;
    for (let i = 0; i < 30; i++) await step();
    for (let pair = 0; pair < 12; pair++) {
      const measure = async cold => {
        if (cold) globalThis.bundleCache = new WeakMap();
        const before = globalThis.bundleBuilds;
        const start = performance.now();
        frame();
        const ms = performance.now() - start;
        await device.queue.onSubmittedWorkDone();
        return { ms, builds: globalThis.bundleBuilds - before };
      };
      let cold, warm;
      if (pair % 2) {
        warm = await measure(false);
        cold = await measure(true);
      } else {
        cold = await measure(true);
        warm = await measure(false);
      }
      if (cold.builds !== batches || warm.builds !== 0) throw Error('Unexpected cold/warm builds');
      result.cold.push({ pair, coldMs: cold.ms, warmMs: warm.ms, builds: cold.builds });
    }
    globalThis.profileBuilds = true;
    globalThis.bundleCache = new WeakMap();
    globalThis.buildMs = 0;
    await step();
    result.instrumentedBuildMs = globalThis.buildMs;
    globalThis.profileBuilds = false;
    for (const rate of [0, 0.01, 0.05, 0.1]) {
      evictRate = rate;
      for (let block = 0; block < 6; block++) {
        for (const mode of block % 2 ? [true, false] : [false, true]) {
          globalThis.bundleMode = mode;
          evictCursor = 0;
          evictDebt = 0;
          for (let i = 0; i < 20; i++) await step();
          evictCursor = 0;
          evictDebt = 0;
          const before = globalThis.bundleBuilds,
            invalidationsBefore = groupInvalidations,
            rawMs = [];
          for (let i = 0; i < 60; i++) {
            const start = performance.now();
            frame();
            rawMs.push(performance.now() - start);
            await device.queue.onSubmittedWorkDone();
          }
          result.samples.push({
            rate,
            block,
            mode: mode ? 'bundle' : 'baseline',
            medianMs: median(rawMs),
            builds: globalThis.bundleBuilds - before,
            groupInvalidations: groupInvalidations - invalidationsBefore,
            rawMs,
          });
        }
      }
      const rateCapture = async mode => {
        globalThis.bundleMode = mode;
        frameNo = 0;
        evictCursor = 0;
        evictDebt = 0;
        frame();
        await device.queue.onSubmittedWorkDone();
        return backend.readPixels(target, 0, 0, 1280, 720);
      };
      const rateBaseline = await rateCapture(false),
        rateCandidate = await rateCapture(true);
      const rateDifferences = rateBaseline.reduce((n, v, i) => n + (v !== rateCandidate[i] ? 1 : 0), 0);
      (result.rateParity ??= []).push({ rate, differences: rateDifferences });
      if (rateDifferences) throw Error('Churn pixel mismatch ' + rate + ': ' + rateDifferences);
      console.log('PROGRESS ' + cell.id + ' rebuild ' + rate);
    }
    evictRate = 0;
    evictDebt = 0;
    const capture = async mode => {
      globalThis.bundleMode = mode;
      frameNo = 0;
      frame();
      await device.queue.onSubmittedWorkDone();
      return backend.readPixels(target, 0, 0, 1280, 720);
    };
    globalThis.bundleMode = false;
    await step();
    await step();
    const a = await capture(false),
      b = await capture(true),
      c = await capture(true);
    const differences = (a, b) => a.reduce((n, v, i) => n + (v !== b[i] ? 1 : 0), 0);
    backend.clear();
    backend.flush();
    await device.queue.onSubmittedWorkDone();
    const blank = await backend.readPixels(target, 0, 0, 1280, 720);
    result.parity = { differences: differences(a, b), replayDifferences: differences(a, c), clearDifferences: differences(a, blank) };
    const validation = await device.popErrorScope();
    if (validation) errors.push(validation.message);
    result.errors = errors;
    if (result.parity.differences || result.parity.replayDifferences || !result.parity.clearDifferences || errors.length)
      throw Error(JSON.stringify({ parity: result.parity, errors }));
    root.destroy();
    cleanup();
    texture.destroy();
    backend.setRenderTarget(null);
    backend.releaseRenderTexture(target);
    h.destroy();
    return result;
  };
</script>
```

## mixed.mjs

```js
import { Container, RetainedContainer, Sprite, Text, NineSliceSprite, TextureRegion } from '@codexo/exojs';
import { materializeRendererBindings } from '/src/extensions/materialize.ts';
import { TileLayer, TileMap, TileMapNode, TileSet, TILE_TRANSFORM_IDENTITY, tilemapExtension } from '/packages/exojs-tilemap/src/index.ts';
export const mixedScene = (backend, texture) => {
  materializeRendererBindings(backend, tilemapExtension.renderers ?? []);
  const root = new Container();
  root.preserveDrawOrder = true;
  const maps = [];
  const tileset = new TileSet({
    name: 'probe',
    texture: new TextureRegion(texture, { x: 0, y: 0, width: 8, height: 8 }),
    tileWidth: 8,
    tileHeight: 8,
    tileCount: 1,
  });
  for (let i = 0; i < 40; i++) {
    const group = new RetainedContainer();
    group.preserveDrawOrder = true;
    root.addChild(group);
    const x = (i % 20) * 24,
      y = Math.floor(i / 20) * 24;
    const first = new Sprite(texture);
    first.setPosition(x, y);
    group.addChild(first);
    const text = new Text('M', { fontSize: 8 });
    text.setPosition(x + 8, y);
    group.addChild(text);
    const layer = new TileLayer({ id: i, name: 'probe', width: 1, height: 1, tileWidth: 8, tileHeight: 8, tilesets: [tileset] });
    layer.setTileAt(0, 0, { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });
    const map = new TileMap({ name: 'probe', width: 1, height: 1, tileWidth: 8, tileHeight: 8, tilesets: [tileset], layers: [layer] });
    maps.push(map);
    const node = new TileMapNode(map);
    node.setPosition(x, y + 8);
    group.addChild(node);
    const nine = new NineSliceSprite(texture, { slices: 2, width: 8, height: 8 });
    nine.setPosition(x + 8, y + 8);
    group.addChild(nine);
    const last = new Sprite(texture);
    last.setPosition(x + 16, y + 8);
    group.addChild(last);
  }
  return { root, sprites: [], cleanup: () => maps.forEach(map => map.destroy()) };
};
```

## summarize.mjs

```js
import { readFileSync, writeFileSync } from 'node:fs';
const input = process.argv[2] ?? 'scale';
const data = JSON.parse(readFileSync(`.cache/render-bundle-phase2/${input}-results.json`, 'utf8'));
const median = a => [...a].sort((a, b) => a - b)[Math.floor(a.length / 2)];
const rows = data.results.map(r => {
  const constructionMs = median(r.cold.map(p => p.coldMs - p.warmMs));
  const rates = [0, 0.01, 0.05, 0.1].map(rate => {
    const samples = r.samples.filter(s => s.rate === rate);
    const base = samples.filter(s => s.mode === 'baseline');
    const candidate = samples.filter(s => s.mode === 'bundle');
    const savings = candidate.map(s => base.find(b => b.block === s.block).medianMs - s.medianMs).map(v => (Math.abs(v) < 1e-6 ? 0 : v));
    return {
      rate,
      baselineMs: median(base.map(s => s.medianMs)),
      bundleMs: median(candidate.map(s => s.medianMs)),
      savingMs: median(savings),
      positivePairs: savings.filter(v => v > 0).length,
      buildsPerFrame: candidate.reduce((n, s) => n + s.builds, 0) / (candidate.length * 60),
    };
  });
  return {
    run: r.run,
    id: r.cell.id,
    batches: r.batches,
    constructionMs,
    instrumentedBuildMs: r.instrumentedBuildMs,
    breakEvenFrames: rates[0].savingMs > 0 ? constructionMs / rates[0].savingMs : null,
    rates,
    parity: r.parity,
    errors: r.errors,
  };
});
writeFileSync(`.cache/render-bundle-phase2/${input}-summary.json`, JSON.stringify(rows, null, 2));
for (const r of rows) console.log(JSON.stringify(r));
```

## plot.py

```python
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

rows = json.loads(Path('.cache/render-bundle-phase2/scale-summary.json').read_text())
ids = ['1k', '10k', '50k', '100k']
groups = [[r for r in rows if r['id'] == name] for name in ids]
if any(len(group) != 3 for group in groups):
    raise ValueError('Three independent records required for every scale cell')
x = [group[0]['batches'] for group in groups]
fig, axes = plt.subplots(1, 3, figsize=(14, 4.3), layout='constrained')
for rate in [0, .01, .05, .1]:
    values = [[next(v['savingMs'] for v in row['rates'] if v['rate'] == rate) for row in group] for group in groups]
    middle = [np.median(v) for v in values]
    low, high = [min(v) for v in values], [max(v) for v in values]
    line, = axes[0].plot(x, middle, marker='o', label=f'{rate:.0%} native rebuild/frame')
    axes[0].fill_between(x, low, high, alpha=.13, color=line.get_color())
axes[0].axhline(0, color='black', linewidth=.7)
axes[0].set(title='CPU saving after rebuild cost', ylabel='Paired frame saving (ms)')
axes[0].legend(fontsize=8)
for axis, key, title, unit in [
    (axes[1], 'constructionMs', 'Full native-cache reconstruction', 'Cold minus warm frame (ms)'),
    (axes[2], 'breakEvenFrames', 'Estimated static break-even', 'Frames, reconstruction / saving'),
]:
    valid = [(point, group) for point, group in zip(x, groups) if all(r[key] is not None for r in group)]
    values = [[r[key] for r in group] for point, group in valid]
    middle = np.array([np.median(v) for v in values])
    axis.errorbar([point for point, group in valid], middle, yerr=[middle-[min(v) for v in values], [max(v) for v in values]-middle], marker='o', capsize=4)
    axis.set(title=title, ylabel=unit)
for axis in axes:
    axis.set_xlabel('Observed retained batches')
    axis.grid(alpha=.2)
fig.suptitle('RTX 5070 Ti / Chromium: median of 3 processes, ranges show min-max\nSynthetic cache eviction; serial GPU-completion waits; stress-2000 is a separate workload', fontsize=11)
fig.savefig('.cache/render-bundle-phase2/scaling.png', dpi=160)
fig.savefig('.cache/render-bundle-phase2/scaling.svg')
```
