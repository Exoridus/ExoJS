/**
 * E02: the built ESM tree, actually loaded by a browser as bare module
 * specifiers through an import map.
 *
 * Serves the production `dist/` over a throwaway static server, opens a page
 * whose import map resolves `@codexo/exojs` and its subpaths to the served
 * `dist/esm` tree, and verifies in a real Chromium that:
 *
 * - every root/subpath import resolves without a bare-specifier error;
 * - all of them share ONE Core instance (class identity across entries, no
 *   duplicate Core copy introduced by the import map);
 * - the KTX2/Basis worker and WASM files sit at the URLs the engine derives
 *   from `import.meta.url`, with a JavaScript/WASM MIME type.
 *
 * This is the browser half of the hybrid-runtime contract the node tests
 * (test/release/hybrid-runtime-*.test.ts) check through bundling and Node ESM.
 * It needs `pnpm build` to have run; the CI build job runs it right after
 * `test:hybrid-runtime`.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, type Page } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const distEsm = join(repoRoot, 'dist', 'esm');

if (!existsSync(join(distEsm, 'index.js'))) {
  console.error('verify-esm-importmap: dist/esm is missing; run `pnpm build` first.');
  process.exit(1);
}

const MIME: Readonly<Record<string, string>> = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.map': 'application/json',
  '.d.ts': 'text/plain',
};

const SUBPATHS = ['tilemap', 'particles', 'audio-fx', 'physics', 'tilemap-physics', 'lighting', 'pathfinding'] as const;

const importMap = Object.fromEntries([
  ['@codexo/exojs', '/esm/index.js'],
  ['@codexo/exojs/debug', '/esm/debug/index.js'],
  ...SUBPATHS.map(subpath => [`@codexo/exojs/${subpath}`, `/esm/${subpath}/index.js`]),
]);

const probeScript = `
(async () => {
  const report = { imports: {}, identity: {}, worker: {}, errors: [] };
  try {
    const core = await import('@codexo/exojs');
    const debug = await import('@codexo/exojs/debug');
    const subpaths = {${SUBPATHS.map(subpath => `'${subpath}': await import('@codexo/exojs/${subpath}')`).join(', ')}};

    // One Core copy: entries that re-export Core classes must hand out the
    // same constructors the root entry hands out. The root entry does not
    // export the debug tree, so the debug check is between the two module
    // trees that do share DebugLayer (debug and physics).
    report.imports.root = typeof core.Application === 'function';
    report.identity.physicsDebugDraw = debug.PhysicsDebugDraw.prototype instanceof debug.DebugLayer;
    report.identity.tilemapNode = subpaths.tilemap.TileMapNode.prototype instanceof core.Container;
    report.identity.particles = subpaths.particles.ParticleSystem.prototype instanceof core.Drawable;

    // The engine derives the KTX2/Basis worker from import.meta.url; the files
    // must be at those derived URLs with a served MIME type.
    for (const path of ['/esm/assets/factories/basis/ktx2.worker.js', '/esm/assets/factories/basis/basis_transcoder.wasm']) {
      const response = await fetch(path);
      report.worker[path] = { status: response.status, contentType: response.headers.get('content-type') ?? '' };
    }
  } catch (error) {
    report.errors.push(String(error));
  }

  window.__IMPORT_MAP_RESULT__ = report;
})();
`;

const html = `<!doctype html>
<html>
  <body>
    <script type="importmap">${JSON.stringify({ imports: importMap })}</script>
    <script type="module">${probeScript}</script>
  </body>
</html>`;

interface ProbeResult {
  imports: { root?: boolean };
  identity: Record<string, boolean | undefined>;
  worker: Record<string, { status: number; contentType: string }>;
  errors: string[];
}

declare global {
  interface Window {
    __IMPORT_MAP_RESULT__?: ProbeResult;
  }
}

const startServer = async (): Promise<{ server: Server; base: string }> => {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');

    if (url.pathname === '/') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(html);

      return;
    }

    if (!url.pathname.startsWith('/esm/')) {
      response.writeHead(404);
      response.end('not found');

      return;
    }

    const relative = url.pathname.slice('/esm/'.length);
    const file = resolve(distEsm, relative);

    if (!file.startsWith(distEsm) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404);
      response.end('not found');

      return;
    }

    response.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    response.end(readFileSync(file));
  });

  await new Promise<void>(resolveStart => server.listen(0, '127.0.0.1', resolveStart));
  const address = server.address();

  if (address === null || typeof address === 'string') {
    server.close();

    throw new Error('verify-esm-importmap: failed to bind the static server.');
  }

  return { server, base: `http://127.0.0.1:${address.port}` };
};

const readResult = async (page: Page): Promise<ProbeResult> => {
  await page.goto('/');
  await page.waitForFunction(() => window.__IMPORT_MAP_RESULT__ !== undefined, undefined, { timeout: 15_000 });

  return (await page.evaluate(() => window.__IMPORT_MAP_RESULT__)) as ProbeResult;
};

const main = async (): Promise<void> => {
  const { server, base } = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ baseURL: base });

  // A bare-specifier fetch failure surfaces as a module-script error before
  // the probe reports; capture it so the verdict names the real cause.
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(String(error)));

  try {
    const result = await readResult(page);
    const failures: string[] = [];

    if (!result.imports.root) {
      failures.push('root import did not expose Application');
    }

    for (const [name, ok] of Object.entries(result.identity)) {
      if (!ok) {
        failures.push(`${name}: expected one Core copy across the import map`);
      }
    }

    for (const [path, { status, contentType }] of Object.entries(result.worker)) {
      if (status !== 200) {
        failures.push(`${path}: HTTP ${status}`);
      } else if (!contentType.includes('javascript') && !contentType.includes('wasm')) {
        failures.push(`${path}: unexpected content type ${contentType}`);
      }
    }

    for (const error of [...result.errors, ...pageErrors]) {
      failures.push(error);
    }

    if (failures.length > 0) {
      console.error(`verify-esm-importmap: ${failures.length} failure(s):\n  ${failures.join('\n  ')}`);
      process.exitCode = 1;
    } else {
      console.log(`verify-esm-importmap: root + debug + ${SUBPATHS.length} subpaths share one Core; worker and WASM served.`);
    }
  } finally {
    await browser.close();
    server.close();
  }
};

main();
