import { mkdir, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';

type Theme = 'dark' | 'light';

type ViewportSpec = {
    key: string;
    width: number;
    height: number;
};

type Task = {
    route: string;
    theme: Theme;
    viewport: ViewportSpec;
};

type CaptureSuccess = {
    task: Task;
    files: string[];
    durationMs: number;
};

type CaptureFailure = {
    task: Task;
    error: string;
};

const DEFAULT_ROUTES = [
    '/en/',
    '/en/guide/',
    '/en/guide/introduction/what-is-exojs/',
    '/en/guide/introduction/setup/',
    '/en/guide/introduction/your-first-scene/',
    '/en/api/',
    '/en/api/all/',
    '/en/api/application/',
    '/en/api/scene/',
    '/en/api/sprite/',
    '/en/playground/',
];

const DEFAULT_THEMES: Theme[] = ['dark', 'light'];
const DEFAULT_VIEWPORT: ViewportSpec = { key: 'desktop', width: 1440, height: 1000 };
const DEFAULT_MAX_PANEL_HEIGHT = 1568;
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_STABLE_DELAY_MS = 300;
const DEFAULT_NAVIGATION_TIMEOUT_MS = 45_000;
const DEFAULT_BASE_URL = 'http://localhost:4321/ExoJS/';

function sleep(ms: number): Promise<void> {
    return new Promise(resolveSleep => setTimeout(resolveSleep, ms));
}

function normalizeRoute(route: string): string {
    const trimmed = route.trim();
    if (!trimmed) return '/';
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function routeToFileSlug(route: string): string {
    const normalized = normalizeRoute(route);
    if (normalized === '/' || normalized === '') return 'root';

    const [pathPart, queryPart] = normalized.split('?');
    const cleanedPath = pathPart.replace(/^\/+|\/+$/g, '').replace(/\//g, '__').replace(/[^a-zA-Z0-9_-]/g, '-');
    if (!queryPart) return cleanedPath || 'root';
    const cleanedQuery = queryPart.replace(/[^a-zA-Z0-9_-]/g, '-');
    return `${cleanedPath || 'root'}__q_${cleanedQuery}`;
}

function parseViewport(value: string, index: number): ViewportSpec {
    const match = /^(\d+)x(\d+)$/i.exec(value.trim());
    if (!match) {
        throw new Error(`Invalid viewport "${value}". Use WIDTHxHEIGHT, e.g. 1440x1000.`);
    }

    const width = Number.parseInt(match[1], 10);
    const height = Number.parseInt(match[2], 10);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        throw new Error(`Invalid viewport "${value}". Width and height must be positive integers.`);
    }

    return {
        key: index === 0 ? 'desktop' : `vp${index + 1}`,
        width,
        height,
    };
}

function toLabelOrTimestamp(label?: string): string {
    if (label && label.trim().length > 0) {
        return label.trim().replace(/[^a-zA-Z0-9._-]/g, '-');
    }

    return new Date().toISOString().replace(/[:]/g, '-').replace(/\..+$/, '');
}

function parseThemes(rawValue: string | undefined): Theme[] {
    if (!rawValue) return DEFAULT_THEMES;
    const values = rawValue
        .split(',')
        .map(value => value.trim().toLowerCase())
        .filter(Boolean);

    const themes: Theme[] = [];
    for (const value of values) {
        if (value === 'dark' || value === 'light') {
            themes.push(value);
            continue;
        }
        throw new Error(`Unsupported theme "${value}". Supported values: dark, light.`);
    }

    if (themes.length === 0) return DEFAULT_THEMES;
    return Array.from(new Set(themes));
}

async function waitForServer(baseUrl: string, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let lastError = '';

    while (Date.now() < deadline) {
        try {
            const response = await fetch(baseUrl, { method: 'GET' });
            if (response.ok || response.status < 500) return;
            lastError = `HTTP ${response.status}`;
        } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
        }
        await sleep(500);
    }

    throw new Error(`Could not reach preview server at ${baseUrl}. Last error: ${lastError || 'unknown error'}.`);
}

async function applyStabilization(page: Page): Promise<void> {
    await page.addStyleTag({
        content: `
*,
*::before,
*::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
  caret-color: transparent !important;
}
`,
    });
}

async function waitForVisualReady(page: Page, delayMs: number): Promise<void> {
    await page.evaluate(async () => {
        if ('fonts' in document && document.fonts?.ready) {
            await document.fonts.ready;
        }

        await new Promise<void>(resolveRaf => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolveRaf()));
        });
    });

    if (delayMs > 0) {
        await sleep(delayMs);
    }
}

async function captureRoutePanels(
    page: Page,
    outputDir: string,
    filePrefix: string,
    maxPanelHeight: number,
    viewport: ViewportSpec
): Promise<string[]> {
    const readDimensions = async () =>
        page.evaluate(() => {
            const doc = document.documentElement;
            const body = document.body;
            return {
                width: Math.max(doc.scrollWidth, doc.clientWidth, body?.scrollWidth ?? 0),
                height: Math.max(doc.scrollHeight, doc.clientHeight, body?.scrollHeight ?? 0),
            };
        });

    let dimensions = await readDimensions();

    const contentHeight = Math.max(1, Math.ceil(dimensions.height));
    const clipWidth = Math.max(1, viewport.width);

    if (contentHeight <= maxPanelHeight) {
        const outputFile = resolve(outputDir, `${filePrefix}.png`);
        await page.screenshot({ path: outputFile, fullPage: true });
        return [outputFile];
    }

    const files: string[] = [];
    const originalViewport = page.viewportSize();

    const capturePanelHeight = Math.max(1, Math.min(maxPanelHeight, Math.ceil(contentHeight)));
    if (!originalViewport || originalViewport.width !== clipWidth || originalViewport.height !== capturePanelHeight) {
        await page.setViewportSize({ width: clipWidth, height: capturePanelHeight });
        await sleep(50);
        dimensions = await readDimensions();
    }

    const resizedContentHeight = Math.max(1, Math.ceil(dimensions.height));
    const resizedPanelCount = Math.ceil(resizedContentHeight / capturePanelHeight);

    for (let index = 0; index < resizedPanelCount; index += 1) {
        const y = index * capturePanelHeight;
        const clipHeight = Math.min(capturePanelHeight, resizedContentHeight - y);
        const outputFile = resolve(outputDir, `${filePrefix}_split_v_${index + 1}.png`);

        await page.evaluate(scrollY => {
            window.scrollTo(0, scrollY);
        }, y);
        await sleep(50);

        await page.screenshot({
            path: outputFile,
            clip: {
                x: 0,
                y: 0,
                width: clipWidth,
                height: clipHeight,
            },
        });

        files.push(outputFile);
    }

    if (originalViewport && (originalViewport.width !== clipWidth || originalViewport.height !== capturePanelHeight)) {
        await page.setViewportSize(originalViewport);
    }

    return files;
}

function buildTaskUrl(baseUrl: string, route: string): string {
    const normalizedRoute = normalizeRoute(route);
    if (normalizedRoute.startsWith('http://') || normalizedRoute.startsWith('https://')) return normalizedRoute;
    const routeWithoutLeadingSlash = normalizedRoute.replace(/^\/+/, '');
    return new URL(routeWithoutLeadingSlash, baseUrl).toString();
}

async function main(): Promise<void> {
    const parsed = parseArgs({
        args: process.argv.slice(2),
        options: {
            'base-url': { type: 'string' },
            label: { type: 'string' },
            routes: { type: 'string' },
            route: { type: 'string', multiple: true },
            themes: { type: 'string' },
            viewport: { type: 'string' },
            viewports: { type: 'string' },
            concurrency: { type: 'string' },
            'max-height': { type: 'string' },
            'delay-ms': { type: 'string' },
            'timeout-ms': { type: 'string' },
            mobile: { type: 'boolean' },
            help: { type: 'boolean', short: 'h' },
        },
        allowPositionals: false,
    });

    if (parsed.values.help) {
        console.log(`Usage:
npm run screenshots
npm run screenshots -- --base-url http://localhost:4321 --label desktop-pass

Options:
  --base-url      Preview URL (default: http://localhost:4321/ExoJS/)
  --label         Output folder label (default: ISO timestamp)
  --routes        Comma-separated route list
  --route         Additional route (repeatable)
  --themes        Comma-separated themes (default: dark,light)
  --viewport      Single viewport WIDTHxHEIGHT (default: 1440x1000)
  --viewports     Comma-separated viewport list WIDTHxHEIGHT,...
  --mobile        Include extra 390x844 viewport
  --concurrency   Max concurrent pages (default: 3)
  --max-height    Max panel split height (default: 1568)
  --delay-ms      Extra stabilization delay after load (default: 300)
  --timeout-ms    Navigation timeout and server wait timeout (default: 45000)
`);
        return;
    }

    const baseUrl = (parsed.values['base-url'] ?? DEFAULT_BASE_URL).replace(/\/+$/, '/');
    const label = toLabelOrTimestamp(parsed.values.label);
    const concurrency = Math.max(1, Number.parseInt(parsed.values.concurrency ?? String(DEFAULT_CONCURRENCY), 10) || DEFAULT_CONCURRENCY);
    const maxHeight = Math.max(256, Number.parseInt(parsed.values['max-height'] ?? String(DEFAULT_MAX_PANEL_HEIGHT), 10) || DEFAULT_MAX_PANEL_HEIGHT);
    const delayMs = Math.max(0, Number.parseInt(parsed.values['delay-ms'] ?? String(DEFAULT_STABLE_DELAY_MS), 10) || DEFAULT_STABLE_DELAY_MS);
    const timeoutMs = Math.max(5_000, Number.parseInt(parsed.values['timeout-ms'] ?? String(DEFAULT_NAVIGATION_TIMEOUT_MS), 10) || DEFAULT_NAVIGATION_TIMEOUT_MS);

    const routesFromList = parsed.values.routes
        ? parsed.values.routes
              .split(',')
              .map(route => route.trim())
              .filter(Boolean)
        : [];
    const routesFromFlags = (parsed.values.route ?? []).map(route => route.trim()).filter(Boolean);
    const configuredRoutes = [...routesFromList, ...routesFromFlags];
    const routes = (configuredRoutes.length > 0 ? configuredRoutes : DEFAULT_ROUTES).map(normalizeRoute);

    const themes = parseThemes(parsed.values.themes);

    const rawViewports =
        parsed.values.viewports?.split(',').map(value => value.trim()).filter(Boolean) ??
        (parsed.values.viewport ? [parsed.values.viewport] : [`${DEFAULT_VIEWPORT.width}x${DEFAULT_VIEWPORT.height}`]);
    const viewports = rawViewports.map((value, index) => parseViewport(value, index));
    if (parsed.values.mobile) {
        viewports.push({ key: 'mobile', width: 390, height: 844 });
    }

    const outputDir = resolve(process.cwd(), '..', '.workspace', 'screenshots', 'current', label);
    await mkdir(outputDir, { recursive: true });

    console.log(`[screenshots] Output: ${outputDir}`);
    console.log(`[screenshots] Base URL: ${baseUrl}`);
    console.log(`[screenshots] Routes: ${routes.length}, themes: ${themes.join(', ')}, viewports: ${viewports.map(v => `${v.width}x${v.height}`).join(', ')}`);
    console.log(`[screenshots] Concurrency: ${concurrency}, max panel height: ${maxHeight}`);

    await waitForServer(baseUrl, timeoutMs);

    const tasks: Task[] = [];
    for (const viewport of viewports) {
        for (const theme of themes) {
            for (const route of routes) {
                tasks.push({ route, theme, viewport });
            }
        }
    }

    const browser = await chromium.launch({ headless: true });
    const contextCache = new Map<string, Promise<BrowserContext>>();

    const getContext = async (theme: Theme, viewport: ViewportSpec): Promise<BrowserContext> => {
        const key = `${theme}_${viewport.width}x${viewport.height}`;
        if (!contextCache.has(key)) {
            contextCache.set(
                key,
                (async () => {
                    const context = await browser.newContext({
                        viewport: { width: viewport.width, height: viewport.height },
                        colorScheme: theme,
                    });
                    await context.addInitScript(
                        ({ resolvedTheme }) => {
                            try {
                                localStorage.setItem('exo-theme', resolvedTheme);
                            } catch {
                                // Ignore storage errors in restricted environments.
                            }
                            document.documentElement.setAttribute('data-theme', resolvedTheme);
                        },
                        { resolvedTheme: theme }
                    );
                    return context;
                })()
            );
        }
        return contextCache.get(key)!;
    };

    const successes: CaptureSuccess[] = [];
    const failures: CaptureFailure[] = [];

    let cursor = 0;

    const worker = async (): Promise<void> => {
        while (true) {
            const taskIndex = cursor;
            cursor += 1;
            if (taskIndex >= tasks.length) return;

            const task = tasks[taskIndex];
            const startedAt = Date.now();

            try {
                const context = await getContext(task.theme, task.viewport);
                const page = await context.newPage();
                const url = buildTaskUrl(baseUrl, task.route);

                try {
                    await page.emulateMedia({ reducedMotion: 'reduce' });
                    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
                    if (!response) {
                        throw new Error(`Navigation produced no response for ${url}.`);
                    }
                    if (response.status() >= 400) {
                        throw new Error(`Navigation failed for ${url} with HTTP ${response.status()}.`);
                    }
                    await page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => undefined);
                    await applyStabilization(page);
                    await waitForVisualReady(page, delayMs);

                    const routeSlug = routeToFileSlug(task.route);
                    const filePrefix = `${task.viewport.key}_${task.viewport.width}x${task.viewport.height}_${task.theme}_${routeSlug}`;
                    const files = await captureRoutePanels(page, outputDir, filePrefix, maxHeight, task.viewport);
                    successes.push({
                        task,
                        files,
                        durationMs: Date.now() - startedAt,
                    });
                    console.log(`[screenshots] OK ${task.theme} ${task.viewport.width}x${task.viewport.height} ${task.route}`);
                } finally {
                    await page.close();
                }
            } catch (error) {
                const message = error instanceof Error ? error.stack ?? error.message : String(error);
                failures.push({ task, error: message });
                console.error(`[screenshots] FAIL ${task.theme} ${task.viewport.width}x${task.viewport.height} ${task.route}`);
                console.error(message);
            }
        }
    };

    const workerCount = Math.min(concurrency, tasks.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    for (const pendingContext of contextCache.values()) {
        const context = await pendingContext;
        await context.close();
    }
    await browser.close();

    const report = {
        label,
        baseUrl,
        generatedAt: new Date().toISOString(),
        outputDir,
        totals: {
            tasks: tasks.length,
            successes: successes.length,
            failures: failures.length,
        },
        failures,
        successes: successes.map(item => ({
            route: item.task.route,
            theme: item.task.theme,
            viewport: `${item.task.viewport.width}x${item.task.viewport.height}`,
            files: item.files,
            durationMs: item.durationMs,
        })),
    };

    const reportPath = resolve(outputDir, 'report.json');
    await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');

    console.log(`[screenshots] Report: ${reportPath}`);
    console.log(`[screenshots] Captured ${successes.length}/${tasks.length} tasks.`);

    if (failures.length > 0) {
        console.error(`[screenshots] ${failures.length} capture(s) failed.`);
        process.exitCode = 1;
    }
}

await main();
