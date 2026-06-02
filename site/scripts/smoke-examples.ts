/**
 * Runtime smoke test for the playground example catalog.
 *
 * For every entry in `examples/examples.json` this loads the example the same
 * way the playground does — through `preview.html` (which registers the
 * `@codexo/exojs` / `@examples/runtime` import map) with the example source
 * injected as a module script — and checks that it boots without an uncaught
 * runtime error and renders a `<canvas>`.
 *
 * It serves the built site (`site/dist`) over a throwaway static server, so it
 * needs `pnpm site:build` to have run first. It is intentionally a standalone
 * script (not part of `npm test`): it drives a real headless browser and is
 * too heavy/environment-dependent for the default unit suite.
 *
 * Usage:
 *   pnpm --filter @codexo/exojs-examples examples:smoke      # from repo: pnpm test:examples:smoke
 *   ... --only camera-basic        # smoke a single example (path substring)
 *   ... --concurrency 4            # parallel pages (default 4)
 *   ... --browser firefox          # run under Firefox headed (cross-browser)
 *   ... --headed                   # force headed mode for any browser
 *   ... --color-scheme dark        # emulate dark-mode OS preference
 *
 * Chromium (default): new headless, WebGPU via Dawn (SwiftShader backend).
 *   WebGPU adapter is available without --use-angle=swiftshader, which would
 *   block Dawn. The 7 WebGPU-capability examples run instead of being skipped.
 *
 * Firefox: non-headless by default (Firefox only exposes a WebGPU adapter in a
 *   headed session, matching the browser-webgpu-firefox vitest project).
 *   dom.webgpu.enabled is set via firefoxUserPrefs.
 *
 * Exit code is 1 when any example fails (errors). Capability/unsupported skips
 * and "no canvas" warnings do not fail the run.
 */
import { createServer, type Server } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

import { chromium, firefox, type Browser } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..'); // site/
const repoRoot = resolve(projectRoot, '..'); // repo root
const distDir = resolve(projectRoot, 'dist');
const catalogPath = resolve(repoRoot, 'examples', 'examples.json');
const reportPath = resolve(repoRoot, '.workspace', 'reports', 'example-smoke.md');

const MIME: Record<string, string> = {
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
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.wasm': 'application/wasm',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
    '.txt': 'text/plain',
    '.xml': 'application/xml',
    '.csv': 'text/csv',
};

// Mirrors EditorPreview._isRecoverablePreviewError: backend-unsupported
// failures are environment limits, not example bugs — they are skipped.
const RECOVERABLE = [
    // WebGL unsupported (Chromium + Firefox variants)
    'does not support webgl',
    'failed to create a webgl',
    'webgl is not supported',
    'webgl context could not be created',
    // WebGPU unsupported
    'requires browser webgpu support',
    'requires advanced webgpu support',
    'webgpu unavailable',
    'could not acquire a webgpu adapter',
    'webgpu setup failed',
    // Firefox-specific GPU error phrases
    'context creation error',
    'no webgl support',
];

function isRecoverable(message: string): boolean {
    const normalized = message.toLowerCase();
    return RECOVERABLE.some(pattern => normalized.includes(pattern));
}

// Collapse multi-line compiler/runtime messages to a single line so they fit a
// markdown bullet / table cell.
function oneLine(message: string): string {
    return message.replace(/\s+/g, ' ').trim();
}

interface CatalogEntry {
    slug: string;
    path: string;
    title: string;
    backend: string;
    capabilities?: string[];
    tags?: string[];
}

type Status = 'passed' | 'failed' | 'skipped' | 'warned';

interface Result {
    path: string;
    category: string;
    backend: string;
    capabilities: string[];
    status: Status;
    note: string;
}

function startServer(root: string): Promise<{ port: number; server: Server }> {
    const server = createServer((req, res) => {
        try {
            const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
            let filePath = resolve(join(root, urlPath));
            if (!filePath.startsWith(root)) {
                res.writeHead(403);
                res.end('Forbidden');
                return;
            }
            if (existsSync(filePath) && statSync(filePath).isDirectory()) {
                filePath = join(filePath, 'index.html');
            }
            if (!existsSync(filePath)) {
                res.writeHead(404);
                res.end('Not found');
                return;
            }
            const body = readFileSync(filePath);
            res.writeHead(200, {
                'Content-Type': MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
                'Cache-Control': 'no-store',
            });
            res.end(body);
        } catch (error) {
            res.writeHead(500);
            res.end(error instanceof Error ? error.message : String(error));
        }
    });

    return new Promise(resolvePromise => {
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            const port = typeof address === 'object' && address ? address.port : 0;
            resolvePromise({ port, server });
        });
    });
}

function captureErrors(): void {
    interface SmokeWindow {
        __SMOKE_ERRORS__?: Array<{ message: string }>;
    }
    const w = window as unknown as SmokeWindow;
    w.__SMOKE_ERRORS__ = [];
    window.addEventListener('error', event => {
        const message = event.error?.message ?? event.message ?? String(event);
        w.__SMOKE_ERRORS__!.push({ message });
    });
    window.addEventListener('unhandledrejection', event => {
        const reason = event.reason as { message?: string } | undefined;
        w.__SMOKE_ERRORS__!.push({ message: reason?.message ?? String(event.reason) });
    });
}

async function detectWebGpu(browser: Browser, baseUrl: string): Promise<boolean> {
    // Navigate to a real origin rather than about:blank — some Chromium builds
    // refuse to expose navigator.gpu on opaque origins.
    const page = await browser.newPage();
    try {
        await page.goto(`${baseUrl}/preview.html`, { waitUntil: 'domcontentloaded', timeout: 10_000 });
        return await page.evaluate(async () => {
            try {
                const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
                if (!gpu) return false;
                return (await gpu.requestAdapter()) !== null;
            } catch {
                return false;
            }
        });
    } catch {
        return false;
    } finally {
        await page.close();
    }
}

async function runExample(
    browser: Browser,
    baseUrl: string,
    entry: CatalogEntry & { category: string },
    index: number,
    webgpuAvailable: boolean,
    timeoutMs: number,
    colorScheme: 'light' | 'dark' = 'light'
): Promise<Result> {
    const capabilities = entry.capabilities ?? [];
    const result: Result = {
        path: entry.path,
        category: entry.category,
        backend: entry.backend,
        capabilities,
        status: 'passed',
        note: '',
    };

    const needsWebGpu = entry.backend === 'advanced' || capabilities.includes('webgpu');
    if (needsWebGpu && !webgpuAvailable) {
        result.status = 'skipped';
        result.note = 'WebGPU adapter unavailable in this environment';
        return result;
    }

    const sourcePath = join(distDir, 'examples', entry.path);
    if (!existsSync(sourcePath)) {
        result.status = 'failed';
        result.note = `source missing in build output: ${entry.path}`;
        return result;
    }
    const source = readFileSync(sourcePath, 'utf8');

    const context = await browser.newContext({ viewport: { width: 800, height: 600 }, colorScheme });
    await context.addInitScript(captureErrors);
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    try {
        await page.goto(`${baseUrl}/preview.html?no-cache=${index}`, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

        await page.evaluate(
            ({ exampleSource, meta }) => {
                const w = window as unknown as { __EXAMPLE_META__?: unknown; assets?: unknown };
                w.__EXAMPLE_META__ = meta;
                w.assets = {};
                const script = document.createElement('script');
                script.type = 'module';
                script.textContent = `${exampleSource}\n`;
                document.body.appendChild(script);
            },
            { exampleSource: source, meta: entry }
        );

        // Wait until a canvas mounts or an error surfaces, then let async
        // load()/init() settle so deferred rejections are captured too.
        await page
            .waitForFunction(
                () => {
                    const w = window as unknown as { __SMOKE_ERRORS__?: unknown[] };
                    return !!document.querySelector('canvas') || (w.__SMOKE_ERRORS__?.length ?? 0) > 0;
                },
                undefined,
                { timeout: timeoutMs }
            )
            .catch(() => undefined);
        await page.waitForTimeout(1100);

        const errors = await page.evaluate(() => {
            const w = window as unknown as { __SMOKE_ERRORS__?: Array<{ message: string }> };
            return (w.__SMOKE_ERRORS__ ?? []).map(error => error.message);
        });
        const hasCanvas = await page.evaluate(() => !!document.querySelector('canvas'));
        const allErrors = [...errors, ...pageErrors];

        const recoverable = allErrors.find(isRecoverable);
        if (recoverable) {
            result.status = 'skipped';
            result.note = oneLine(`backend unsupported: ${recoverable}`);
        } else if (allErrors.length > 0) {
            result.status = 'failed';
            result.note = oneLine(allErrors[0]);
        } else if (!hasCanvas) {
            result.status = 'warned';
            result.note = 'no <canvas> rendered (no error thrown)';
        }
    } catch (error) {
        result.status = 'failed';
        result.note = oneLine(`harness error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
        await context.close();
    }

    return result;
}

async function main(): Promise<void> {
    const { values } = parseArgs({
        args: process.argv.slice(2),
        options: {
            only: { type: 'string' },
            concurrency: { type: 'string' },
            'timeout-ms': { type: 'string' },
            browser: { type: 'string' },       // 'chromium' (default) | 'firefox'
            headed: { type: 'boolean' },       // force headed (any browser)
            'color-scheme': { type: 'string' }, // 'light' (default) | 'dark'
        },
        allowPositionals: false,
    });

    if (!existsSync(join(distDir, 'preview.html'))) {
        console.error(`[smoke] Missing ${join(distDir, 'preview.html')}. Run "pnpm site:build" first.`);
        process.exitCode = 1;
        return;
    }

    const browserName = values.browser === 'firefox' ? 'firefox' : 'chromium';
    const colorScheme = values['color-scheme'] === 'dark' ? 'dark' : 'light';
    // Firefox needs headed for WebGPU adapter (same constraint as browser-webgpu-firefox vitest project).
    const headless = values.headed ? false : browserName !== 'firefox';

    const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')) as Record<string, CatalogEntry[]>;
    let entries = Object.entries(catalog).flatMap(([category, list]) => list.map(entry => ({ ...entry, category })));
    if (values.only) {
        entries = entries.filter(entry => entry.path.includes(values.only!));
    }

    const concurrency = Math.max(1, Number.parseInt(values.concurrency ?? '4', 10) || 4);
    const timeoutMs = Math.max(4000, Number.parseInt(values['timeout-ms'] ?? '15000', 10) || 15000);

    const { port, server } = await startServer(distDir);
    const baseUrl = `http://127.0.0.1:${port}`;

    let browser: Browser;
    if (browserName === 'firefox') {
        browser = await firefox.launch({
            headless,
            firefoxUserPrefs: {
                // Enable WebGPU (off by default in most Firefox builds).
                'dom.webgpu.enabled': true,
                'dom.webgpu.workers-enabled': true,
                // Ensure WebGL is available.
                'webgl.disabled': false,
            },
        });
    } else {
        // Chromium new headless — WebGPU adapter is available via Dawn's
        // SwiftShader backend when --enable-unsafe-webgpu is set. Crucially
        // we do NOT add --use-angle=swiftshader here: that flag forces the
        // ANGLE WebGL backend to SwiftShader, which conflicts with Dawn and
        // prevents the WebGPU adapter from being acquired. The 7 WebGPU
        // catalog examples can therefore run instead of being skipped.
        browser = await chromium.launch({
            headless,
            args: ['--enable-webgl', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'],
        });
    }

    const webgpuAvailable = await detectWebGpu(browser, baseUrl);
    console.log(
        `[smoke] ${entries.length} example(s) · ${browserName} · ${headless ? 'headless' : 'headed'} · ` +
        `color-scheme: ${colorScheme} · WebGPU adapter: ${webgpuAvailable ? 'yes' : 'no'} · concurrency ${concurrency}`
    );

    const results: Result[] = new Array(entries.length);
    let cursor = 0;

    const worker = async (): Promise<void> => {
        while (true) {
            const index = cursor;
            cursor += 1;
            if (index >= entries.length) return;

            const entry = entries[index];
            const result = await runExample(browser, baseUrl, entry, index, webgpuAvailable, timeoutMs, colorScheme);
            results[index] = result;

            const tag = result.status.toUpperCase().padEnd(7);
            const line = `[smoke] ${tag} ${entry.path}${result.note ? ` — ${result.note}` : ''}`;
            if (result.status === 'failed') console.error(line);
            else console.log(line);
        }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, () => worker()));

    await browser.close();
    await new Promise<void>(resolveClose => server.close(() => resolveClose()));

    const counts = {
        passed: results.filter(result => result.status === 'passed').length,
        failed: results.filter(result => result.status === 'failed').length,
        skipped: results.filter(result => result.status === 'skipped').length,
        warned: results.filter(result => result.status === 'warned').length,
    };

    await writeReport(results, counts, webgpuAvailable, browserName, colorScheme, headless);

    console.log(`[smoke] passed ${counts.passed} · warned ${counts.warned} · skipped ${counts.skipped} · failed ${counts.failed}`);
    console.log(`[smoke] report: ${reportPath}`);

    if (counts.failed > 0) {
        process.exitCode = 1;
    }
}

async function writeReport(
    results: Result[],
    counts: Record<string, number>,
    webgpuAvailable: boolean,
    browserName: string = 'chromium',
    colorScheme: string = 'light',
    headless: boolean = true,
): Promise<void> {
    const icon: Record<Status, string> = { passed: '✅', failed: '❌', skipped: '⏭️', warned: '⚠️' };
    const lines: string[] = [];
    const mode = headless ? 'headless' : 'headed';

    lines.push('# Playground Example Runtime Smoke', '');
    lines.push(
        `_Generated ${new Date().toISOString()} · ${browserName} ${mode} · color-scheme: ${colorScheme} · ` +
        `WebGPU adapter: ${webgpuAvailable ? 'available' : 'unavailable'} · this file is gitignored._`,
        '',
    );
    lines.push('Each catalog example is loaded through `preview.html` (real import map) with its source injected as a module script; the run checks for uncaught errors and a mounted `<canvas>`.', '');
    lines.push('## Totals', '');
    lines.push(`| Total | ✅ Passed | ⚠️ Warned | ⏭️ Skipped | ❌ Failed |`);
    lines.push(`| --- | --- | --- | --- | --- |`);
    lines.push(`| ${results.length} | ${counts.passed} | ${counts.warned} | ${counts.skipped} | ${counts.failed} |`, '');

    const failed = results.filter(result => result.status === 'failed');
    if (failed.length > 0) {
        lines.push('## ❌ Failures', '');
        for (const result of failed) {
            lines.push(`- \`${result.path}\` — ${result.note}`);
        }
        lines.push('');
    }

    const warned = results.filter(result => result.status === 'warned');
    if (warned.length > 0) {
        lines.push('## ⚠️ Warnings', '');
        for (const result of warned) {
            lines.push(`- \`${result.path}\` — ${result.note}`);
        }
        lines.push('');
    }

    const skipped = results.filter(result => result.status === 'skipped');
    if (skipped.length > 0) {
        lines.push('## ⏭️ Skipped', '');
        for (const result of skipped) {
            lines.push(`- \`${result.path}\` — ${result.note}`);
        }
        lines.push('');
    }

    lines.push('## Full matrix', '');
    lines.push('| Example | Backend | Capabilities | Result | Note |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const result of results) {
        const caps = result.capabilities.length > 0 ? result.capabilities.join(', ') : '—';
        const note = (result.note || '').replace(/\|/g, '\\|');
        lines.push(`| \`${result.path}\` | ${result.backend} | ${caps} | ${icon[result.status]} ${result.status} | ${note} |`);
    }
    lines.push('');

    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, lines.join('\n'), 'utf8');
}

await main();
