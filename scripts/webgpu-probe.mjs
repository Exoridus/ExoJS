// Ad-hoc WebGPU probe — render ONE playground example on REAL headless WebGPU
// and report whether it draws, plus the adapter/device the run actually used.
//
// WHY THIS EXISTS: "WebGPU can't be tested headless" is FALSE and has been a
// recurring wrong assumption. It IS testable headless on a real GPU. The two
// traps that make it *look* broken — both baked into the correct config below:
//   1. Use `channel: 'chromium'` (system Chromium, new headless). The
//      playwright-BUNDLED chromium returns a null WebGPU adapter no matter the
//      flags.
//   2. Do NOT pass `--use-angle=d3d11`. It forces D3D11-WebGPU whose
//      requestDevice() needs a dxil.dll that may be absent → throws
//      "dxil.dll Windows Error 87" (adapter ok, DEVICE throws). That is the
//      engine's webgpu→webgl2 fallback condition, NOT "WebGPU is unavailable".
// The formal equivalent is `pnpm test:browser:webgpu` (the green vitest lane);
// this script is for eyeballing a single example ad-hoc.
//
// Usage:
//   node scripts/webgpu-probe.mjs                         # capability check only
//   node scripts/webgpu-probe.mjs debug-layer/asset-browser.js   # render one example
//
// Requires a built + vendored site (pnpm build && pnpm --dir site vendor:sync:exo
// && pnpm --dir site examples:sync) so site/public has the current engine.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { createRequire } from 'node:module';

const REPO = resolve(import.meta.dirname, '..');
const PUBLIC = resolve(REPO, 'site/public');
const OUT = resolve(REPO, '.webgpu-probe');
const BASE = '/ExoJS';
const example = process.argv[2] ?? null;

const require = createRequire(resolve(REPO, 'site') + '/');
const { chromium } = require('playwright');

const MIME = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.fnt': 'text/xml',
  '.atlas': 'text/plain',
};

function startServer() {
  const server = createServer((req, res) => {
    try {
      let urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
      if (urlPath.startsWith(BASE)) urlPath = urlPath.slice(BASE.length) || '/';
      let filePath = resolve(join(PUBLIC, urlPath));
      if (!filePath.startsWith(PUBLIC)) {
        res.writeHead(403);
        res.end();
        return;
      }
      if (existsSync(filePath) && statSync(filePath).isDirectory()) filePath = join(filePath, 'index.html');
      if (!existsSync(filePath)) {
        res.writeHead(404);
        res.end('Not found: ' + urlPath);
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(readFileSync(filePath));
    } catch (e) {
      res.writeHead(500);
      res.end(String(e));
    }
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ port: server.address().port, server })));
}

const { port, server } = await startServer();
const baseUrl = `http://127.0.0.1:${port}`;

// THE CORRECT WEBGPU HEADLESS CONFIG — see the file header for the two traps.
const browser = await chromium.launch({
  headless: true,
  channel: 'chromium',
  args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, colorScheme: 'dark', deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('console', m => {
  if (m.type() === 'error') errors.push(m.text().replace(/\s+/g, ' ').slice(0, 200));
});
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message.replace(/\s+/g, ' ').slice(0, 200)));

await page.goto(`${baseUrl}${BASE}/preview.html`, { waitUntil: 'domcontentloaded', timeout: 20000 });

const caps = await page.evaluate(async () => {
  const out = { secureContext: isSecureContext, hasGpu: !!navigator.gpu };
  if (navigator.gpu) {
    try {
      const a = await navigator.gpu.requestAdapter();
      out.adapter = a ? 'non-null' : 'null';
      if (a) {
        out.adapterInfo = a.info ? `${a.info.vendor}/${a.info.architecture}` : 'n/a';
        try {
          out.device = (await a.requestDevice()) ? 'non-null' : 'null';
        } catch (e) {
          out.device = 'THROW: ' + e.message.slice(0, 80);
        }
      }
    } catch (e) {
      out.adapter = 'THROW: ' + e.message.slice(0, 80);
    }
  }
  return out;
});
console.log('[webgpu-probe] caps:', JSON.stringify(caps));
if (caps.device !== 'non-null') {
  console.log('[webgpu-probe] WARNING: no usable WebGPU device — check channel:chromium and that you did NOT pass --use-angle=d3d11.');
}

if (example) {
  const srcFile = join(PUBLIC, 'examples', example);
  if (!existsSync(srcFile)) {
    console.log('[webgpu-probe] example source missing:', example);
  } else {
    const source = readFileSync(srcFile, 'utf8');
    await page.evaluate(
      async ({ exampleSource, meta }) => {
        window.__EXAMPLE_META__ = meta;
        try {
          const c = await import('./assets/catalog.js');
          window.assets = c.assets ?? {};
        } catch {
          window.assets = {};
        }
        const s = document.createElement('script');
        s.type = 'module';
        s.textContent = exampleSource + '\n';
        document.body.appendChild(s);
      },
      { exampleSource: source, meta: { path: example } },
    );
    await page.waitForTimeout(3000);
    const backendType = await page.evaluate(() => globalThis.__app?._backendType ?? 'unknown (example does not expose globalThis.__app)');
    const buf = await page.screenshot({ clip: { x: 0, y: 0, width: 1280, height: 720 } });
    mkdirSync(OUT, { recursive: true });
    const shot = join(OUT, example.replace(/[\\/]/g, '__').replace(/\.js$/, '') + '.png');
    writeFileSync(shot, buf);
    const blank = await page.evaluate(
      async url => {
        const img = new Image();
        img.src = url;
        await img.decode();
        const W = 80,
          H = 45;
        const off = document.createElement('canvas');
        off.width = W;
        off.height = H;
        const ctx = off.getContext('2d');
        ctx.drawImage(img, 0, 0, W, H);
        const d = ctx.getImageData(0, 0, W, H).data;
        const n = W * H;
        const counts = new Map();
        let rs = 0,
          gs = 0,
          bs = 0;
        for (let i = 0; i < d.length; i += 4) {
          const k = (d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4);
          counts.set(k, (counts.get(k) || 0) + 1);
          rs += d[i];
          gs += d[i + 1];
          bs += d[i + 2];
        }
        return { uniqueColors: counts.size, avg: [Math.round(rs / n), Math.round(gs / n), Math.round(bs / n)] };
      },
      'data:image/png;base64,' + buf.toString('base64'),
    );
    console.log('[webgpu-probe] example:', example, '| active backend:', backendType);
    console.log('[webgpu-probe] render:', JSON.stringify(blank), blank.uniqueColors <= 3 ? '→ BLANK' : '→ RENDERS');
    console.log('[webgpu-probe] screenshot:', shot);
    if (errors.length) console.log('[webgpu-probe] errors:', JSON.stringify(errors.slice(0, 5)));
  }
}

await browser.close();
await new Promise(r => server.close(r));
console.log('[webgpu-probe] done');
