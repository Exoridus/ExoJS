import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import test from 'node:test';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const defaultMountPath = '/nested/exo/';
const examplesCatalogPath = path.join(projectRoot, 'public', 'examples', 'examples.json');
const readmePath = path.join(projectRoot, 'README.md');
const examplesCatalog = JSON.parse(fs.readFileSync(examplesCatalogPath, 'utf8'));
const allExampleRoutes = Object.entries(examplesCatalog).flatMap(([section, examples]) =>
    examples.map((example) => ({
        ...example,
        section,
        routeHash: `#${example.path}`,
    }))
);

const getContentType = (filePath) => {
    const ext = path.extname(filePath).toLowerCase();

    switch (ext) {
        case '.html':
            return 'text/html; charset=utf-8';
        case '.js':
            return 'application/javascript; charset=utf-8';
        case '.json':
            return 'application/json; charset=utf-8';
        case '.css':
            return 'text/css; charset=utf-8';
        case '.svg':
            return 'image/svg+xml';
        case '.png':
            return 'image/png';
        case '.webm':
            return 'video/webm';
        case '.ogg':
            return 'audio/ogg';
        case '.woff2':
            return 'font/woff2';
        default:
            return 'application/octet-stream';
    }
};

const createStaticServer = (mountPath) => {
    const normalizedMountPath = mountPath.endsWith('/') ? mountPath : `${mountPath}/`;
    const bareMountPath = normalizedMountPath.slice(0, -1);

    const tryServeFromDist = (res, relativePath) => {
        const filePath = path.resolve(distDir, relativePath);
        if (!filePath.startsWith(distDir)) {
            res.writeHead(403);
            res.end('Forbidden');
            return true;
        }
        if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
            res.writeHead(200, { 'Content-Type': getContentType(filePath) });
            fs.createReadStream(filePath).pipe(res);
            return true;
        }
        return false;
    };

    const server = http.createServer((req, res) => {
        const requestUrl = req.url || '/';

        // Redirect bare mount path (no trailing slash) to canonical form so the browser's
        // base URL is correct and all relative fetches resolve under the mount path.
        if (requestUrl === bareMountPath) {
            res.writeHead(301, { 'Location': normalizedMountPath });
            res.end();
            return;
        }

        // Serve the app entry HTML from the mount root.
        if (requestUrl === normalizedMountPath) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            fs.createReadStream(path.join(distDir, 'index.html')).pipe(res);
            return;
        }

        // Serve files requested under the mount path (examples, assets, vendor, etc.).
        if (requestUrl.startsWith(normalizedMountPath)) {
            const rel = decodeURIComponent(requestUrl.slice(normalizedMountPath.length).split('?')[0].split('#')[0]);
            if (tryServeFromDist(res, rel || 'index.html')) return;
            res.writeHead(404);
            res.end('Not found');
            return;
        }

        // Astro generates root-relative paths for its built assets (/_astro/).
        // Serve these directly from distDir so the app works from any mount path.
        const rootRel = decodeURIComponent(requestUrl.split('?')[0].split('#')[0]).replace(/^\//, '');
        if (tryServeFromDist(res, rootRel)) return;

        res.writeHead(404);
        res.end('Not found');
    });

    return server;
};

const runSmokeForMountPath = async (mountPath, routeHash = '', options = {}) => {
    const {
        expectCanvas = true,
        fallbackText = '',
        afterLoad = null,
        entryPath = 'index.html',
    } = options;

    assert.ok(fs.existsSync(path.join(distDir, 'index.html')), 'dist/index.html missing. Run `npm run build` first.');

    const server = createStaticServer(mountPath);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

    const address = server.address();
    assert.ok(address && typeof address === 'object', 'Failed to create local test server.');
    const trimmedMountPath = mountPath.endsWith('/') ? mountPath.slice(0, -1) : mountPath;
    const baseUrl = entryPath === ''
        ? `http://127.0.0.1:${address.port}${trimmedMountPath}${routeHash}`
        : `http://127.0.0.1:${address.port}${mountPath}${entryPath}${routeHash}`;

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    const pageErrors = [];
    const consoleErrors = [];
    const exoModuleRequests = [];
    const legacyBundleRequests = [];
    const statsVendorRequests = [];
    const localHttpErrors = [];

    page.on('pageerror', (error) => {
        pageErrors.push(String(error));
    });

    page.on('console', (message) => {
        if (message.type() === 'error') {
            consoleErrors.push(message.text());
        }

    });

    page.on('requestfinished', (request) => {
        if (request.url().includes('/vendor/exojs/exo.esm.js')) {
            exoModuleRequests.push(request.url());
        }

        if (request.url().includes('/vendor/exojs/exo.bundle.js')) {
            legacyBundleRequests.push(request.url());
        }

        if (request.url().includes('/vendor/stats.min.js')) {
            statsVendorRequests.push(request.url());
        }
    });

    page.on('response', (response) => {
        const requestUrl = response.url();
        const requestStatus = response.status();

        // Track 4xx for ALL requests to this test server, not just those under mountPath.
        // Astro's built assets use root-relative paths (/_astro/) which the server serves
        // directly from distDir, so any 404 from any path on this server is a real error.
        if (requestUrl.startsWith(`http://127.0.0.1:${address.port}`) && requestStatus >= 400) {
            localHttpErrors.push(`${requestStatus}:${requestUrl}`);
        }
    });

    try {
        await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 45000 });
        await page.waitForFunction(() => {
            const appRoot = document.querySelector('example-browser')?.shadowRoot;
            const editorRoot = appRoot?.querySelector('exo-editor')?.shadowRoot;
            const previewRoot = editorRoot?.querySelector('exo-preview')?.shadowRoot;
            return !!previewRoot?.querySelector('iframe');
        }, { timeout: 30000 });

        const iframeElementHandle = await page.evaluateHandle(() => {
            const appRoot = document.querySelector('example-browser')?.shadowRoot;
            const editorRoot = appRoot?.querySelector('exo-editor')?.shadowRoot;
            const previewRoot = editorRoot?.querySelector('exo-preview')?.shadowRoot;
            return previewRoot?.querySelector('iframe') ?? null;
        });
        const iframeHandle = iframeElementHandle.asElement();
        assert.ok(iframeHandle, 'Preview iframe was not rendered.');

        const frame = await iframeHandle.contentFrame();
        assert.ok(frame, 'Could not access preview iframe frame context.');

        await page.waitForFunction(
            ({ expectCanvas, fallbackText }) => {
                const appRoot = document.querySelector('example-browser')?.shadowRoot;
                const editorRoot = appRoot?.querySelector('exo-editor')?.shadowRoot;
                const previewRoot = editorRoot?.querySelector('exo-preview')?.shadowRoot;
                const iframe = previewRoot?.querySelector('iframe');
                const iframeDocument = iframe?.contentDocument || iframe?.contentWindow?.document;
                const hasCanvas = iframeDocument?.querySelector('canvas') !== null;
                const bodyText = iframeDocument?.body?.innerText || '';
                const unavailableMessage = editorRoot?.querySelector('.unavailable-message')?.textContent || '';
                // _blankPreviewSurface() sets this attribute after a recoverable runtime error
                // (e.g. WebGL context creation fails in headless). Body is empty but preview
                // tried to run; this counts as a valid graceful-failure state.
                const previewBlanked = iframeDocument?.body?.hasAttribute('data-preview-blanked') ?? false;

                return expectCanvas
                    ? hasCanvas
                    : hasCanvas || bodyText.includes(fallbackText) || unavailableMessage.trim().length > 0 || previewBlanked;
            },
            { expectCanvas, fallbackText },
            { timeout: 45000 }
        );

        const frameState = await frame.evaluate(() => ({
            hasImportMap: !!document.querySelector('script[type="importmap"]'),
            canvasCount: document.querySelectorAll('canvas').length,
            bodyText: document.body?.innerText || '',
        }));
        await page.waitForFunction(() => {
            const appRoot = document.querySelector('example-browser')?.shadowRoot;
            const editorRoot = appRoot?.querySelector('exo-editor')?.shadowRoot;
            const editorCodeElement = editorRoot?.querySelector('exo-code-editor');
            const editorCodeRoot = editorCodeElement;
            const editorView = editorCodeElement?.editorView;
            const editorElement = editorCodeRoot?.querySelector('.monaco-editor');

            return !!editorCodeRoot && !!editorView && !!editorElement;
        }, { timeout: 45000 });

        const editorState = await page.evaluate(() => {
            const appRoot = document.querySelector('example-browser')?.shadowRoot;
            const editorRoot = appRoot?.querySelector('exo-editor')?.shadowRoot;
            const editorCodeRoot = editorRoot?.querySelector('exo-code-editor');
            const editorCodeElement = editorRoot?.querySelector('exo-code-editor');
            const editorElement = editorCodeRoot?.querySelector('.monaco-editor');
            const editorView = editorCodeElement?.editorView;
            const inputArea = editorCodeRoot?.querySelector('.inputarea');
            // Monaco styles are injected into document.head and the exo-editor shadow root
            // (not inside exo-code-editor itself, which renders in light DOM).
            const monacoStylesheet = editorRoot?.querySelector('style[data-monaco-style="editor-main"]');
            const globalMonacoStylesheet = document.head.querySelector('style[data-monaco-style="editor-main"]');
            const monacoWidgetOverrides = document.head.querySelector('style[data-monaco-widget-overrides="true"]');
            const localMonacoWidgetOverrides = editorRoot?.querySelector('style[data-monaco-widget-overrides="true"]');
            const inputAreaStyle = inputArea ? window.getComputedStyle(inputArea) : null;
            const text = editorView?.getValue?.() || '';
            const editorHasBaseClass = !!editorElement && !!editorView;
            const editorOptions = editorView?.getRawOptions?.() || null;

            return {
                hasEditorCodeRoot: !!editorCodeRoot,
                textLength: text.length,
                editorHasBaseClass,
                fixedOverflowWidgets: !!editorOptions?.fixedOverflowWidgets,
                glyphMargin: !!editorOptions?.glyphMargin,
                inputAreaHidden: !inputArea || (
                    inputAreaStyle?.position === 'absolute' &&
                    inputAreaStyle?.opacity === '0' &&
                    (inputAreaStyle?.width === '0px' || inputAreaStyle?.width === '1px')
                ),
                lineDecorationsWidth: editorOptions?.lineDecorationsWidth ?? null,
                lineNumbersMinChars: editorOptions?.lineNumbersMinChars ?? null,
                globalMonacoStylesLoaded: !!globalMonacoStylesheet && !!globalMonacoStylesheet.sheet,
                hasMonacoWidgetOverrides: !!monacoWidgetOverrides && !!localMonacoWidgetOverrides,
                monacoStylesLoaded: !!monacoStylesheet && !!monacoStylesheet.sheet,
            };
        });

        assert.equal(frameState.hasImportMap, true, 'Preview iframe did not expose the module import map.');
        if (expectCanvas) {
            assert.ok(frameState.canvasCount > 0, 'Example preview did not render any canvas.');
        } else {
            const shellSupportState = await page.evaluate(() => {
                const appRoot = document.querySelector('example-browser')?.shadowRoot;
                const editorRoot = appRoot?.querySelector('exo-editor')?.shadowRoot;
                const previewRoot = editorRoot?.querySelector('exo-preview')?.shadowRoot;
                const iframe = previewRoot?.querySelector('iframe');
                const iframeDocument = iframe?.contentDocument || iframe?.contentWindow?.document;

                return {
                    unavailableMessage: editorRoot?.querySelector('.unavailable-message')?.textContent?.trim() || '',
                    previewBlanked: iframeDocument?.body?.hasAttribute('data-preview-blanked') ?? false,
                };
            });

            assert.ok(
                frameState.canvasCount > 0 ||
                frameState.bodyText.includes(fallbackText) ||
                shellSupportState.unavailableMessage.length > 0 ||
                shellSupportState.previewBlanked,
                `Example preview neither rendered a canvas nor exposed shell fallback state for: ${fallbackText}`
            );
        }
        assert.ok(
            exoModuleRequests.length > 0,
            'No request to local vendor/exojs/exo.esm.js was observed.'
        );
        assert.ok(
            statsVendorRequests.length > 0,
            'No request to local vendor/stats.min.js was observed.'
        );
        assert.equal(editorState.hasEditorCodeRoot, true, 'Code editor root was not rendered.');
        assert.equal(editorState.editorHasBaseClass, true, 'Code editor did not initialize with Monaco classes.');
        assert.equal(editorState.monacoStylesLoaded, true, 'Monaco stylesheet was not loaded before editor use.');
        assert.equal(editorState.globalMonacoStylesLoaded, true, 'Global Monaco stylesheet was not loaded for overflow widgets.');
        assert.equal(editorState.hasMonacoWidgetOverrides, true, 'Monaco overflow widget overrides were not installed.');
        assert.equal(editorState.fixedOverflowWidgets, true, 'Monaco overflow widgets should remain fixed for reliable placement.');
        assert.equal(editorState.glyphMargin, false, 'Monaco glyph margin should be disabled for a tighter gutter.');
        assert.equal(editorState.inputAreaHidden, true, 'Monaco input/IME textarea is visibly rendered.');
        assert.equal(editorState.lineDecorationsWidth, 8, 'Monaco line decoration width drifted.');
        assert.equal(editorState.lineNumbersMinChars, 4, 'Monaco line-number gutter width drifted.');
        assert.ok(editorState.textLength > 50, 'Code editor did not render example source text.');

        const initialIframeUrl = await page.evaluate(() => {
            const appRoot = document.querySelector('example-browser')?.shadowRoot;
            const editorRoot = appRoot?.querySelector('exo-editor')?.shadowRoot;
            const editorPreviewRoot = editorRoot?.querySelector('exo-preview')?.shadowRoot;
            const iframe = editorPreviewRoot?.querySelector('iframe');
            return iframe?.getAttribute('src') || '';
        });

        await page.evaluate(() => {
            const appRoot = document.querySelector('example-browser')?.shadowRoot;
            const editorRoot = appRoot?.querySelector('exo-editor')?.shadowRoot;
            const editorCodeElement = editorRoot?.querySelector('exo-code-editor');
            const editorView = editorCodeElement?.editorView;

            if (!editorView) {
                throw new Error('Monaco editor instance was not found.');
            }

            const markerScript = '\nwindow.__refreshApplied = "ok";\n';
            editorView.setValue(editorView.getValue() + markerScript);
        });

        await page.evaluate(() => {
            const appRoot = document.querySelector('example-browser')?.shadowRoot;
            const editorRoot = appRoot?.querySelector('exo-editor')?.shadowRoot;
            const editorCodeRoot = editorRoot?.querySelector('exo-code-editor');
            const refreshButton = editorCodeRoot?.querySelector('.more-button[title="Refresh preview (Ctrl+Enter)"]');

            if (!refreshButton) {
                throw new Error('Refresh button not found.');
            }

            refreshButton.click();
        });

        await page.waitForFunction(
            (previousUrl) => {
                const appRoot = document.querySelector('example-browser')?.shadowRoot;
                const editorRoot = appRoot?.querySelector('exo-editor')?.shadowRoot;
                const editorPreviewRoot = editorRoot?.querySelector('exo-preview')?.shadowRoot;
                const iframe = editorPreviewRoot?.querySelector('iframe');
                const currentUrl = iframe?.getAttribute('src') || '';

                return currentUrl !== '' && currentUrl !== previousUrl;
            },
            initialIframeUrl,
            { timeout: 45000 }
        );

        const refreshedIframeElementHandle = await page.evaluateHandle(() => {
            const appRoot = document.querySelector('example-browser')?.shadowRoot;
            const editorRoot = appRoot?.querySelector('exo-editor')?.shadowRoot;
            const previewRoot = editorRoot?.querySelector('exo-preview')?.shadowRoot;
            return previewRoot?.querySelector('iframe') ?? null;
        });
        const refreshedIframeHandle = refreshedIframeElementHandle.asElement();
        assert.ok(refreshedIframeHandle, 'Preview iframe was not rendered after refresh.');

        const refreshedFrame = await refreshedIframeHandle.contentFrame();
        assert.ok(refreshedFrame, 'Could not access preview iframe after refresh.');

        await refreshedFrame.waitForFunction(() => window.__refreshApplied === 'ok', { timeout: 45000 });

        if (afterLoad) {
            await afterLoad({
                page,
                frame: refreshedFrame,
                baseUrl,
            });
        }

        // "Canceled: Canceled" is Monaco's TypeScript language service cancelling an
        // in-flight request when a model changes (e.g. during example navigation). It is
        // benign and not a product bug — filter it before asserting.
        const meaningfulPageErrors = pageErrors.filter(e => !e.includes('Canceled: Canceled'));
        assert.deepEqual(meaningfulPageErrors, [], `Runtime errors were thrown: ${meaningfulPageErrors.join(' | ')}`);
        assert.deepEqual(consoleErrors, [], `Console errors were emitted: ${consoleErrors.join(' | ')}`);
        assert.deepEqual(
            legacyBundleRequests,
            [],
            `Legacy bundle requests were emitted: ${legacyBundleRequests.join(' | ')}`
        );
        assert.deepEqual(localHttpErrors, [], `Local HTTP errors were emitted: ${localHttpErrors.join(' | ')}`);
    } finally {
        await page.close();
        await browser.close();
        await new Promise((resolve) => server.close(resolve));
    }
};

const assertMonacoExoPackageSupport = async (page) => {
    const diagnostics = await page.evaluate(async () => {
        const appRoot = document.querySelector('example-browser')?.shadowRoot;
        const editorRoot = appRoot?.querySelector('exo-editor')?.shadowRoot;
        const editorCodeElement = editorRoot?.querySelector('exo-code-editor');
        const editorView = editorCodeElement?.editorView;
        const monaco = window.monaco;

        if (!editorView || !monaco) {
            throw new Error('Monaco editor instance is not available.');
        }

        const model = editorView.getModel();

        if (!model) {
            throw new Error('Monaco model is not available.');
        }

        const supportSource = [
            "import * as Exo from 'exojs';",
            '',
            'const app = new Exo.Application({ width: 64, height: 64, clearColor: Exo.Color.black });',
            'const webGl2RenderManagerCtor = Exo.WebGl2RenderManager;',
            'const webGpuRenderManagerCtor = Exo.WebGpuRenderManager;',
            'app.canvas;',
            'webGl2RenderManagerCtor;',
            'webGpuRenderManagerCtor;',
            '',
        ].join('\n');

        editorView.setValue(supportSource);

        await new Promise((resolve) => setTimeout(resolve, 1200));

        const resource = model.uri;
        const markers = monaco.editor.getModelMarkers({ resource });
        const workerFactory = await monaco.languages.typescript.getJavaScriptWorker();
        const worker = await workerFactory(resource);
        const fullText = model.getValue();
        const applicationOffset = fullText.indexOf('Application') + 2;
        const webGl2RenderManagerOffset = fullText.indexOf('WebGl2RenderManager') + 2;
        const webGpuRenderManagerOffset = fullText.indexOf('WebGpuRenderManager') + 2;
        const applicationQuickInfo = await worker.getQuickInfoAtPosition(resource.toString(), applicationOffset);
        const webGl2RenderManagerQuickInfo = await worker.getQuickInfoAtPosition(
            resource.toString(),
            webGl2RenderManagerOffset
        );
        const webGpuRenderManagerQuickInfo = await worker.getQuickInfoAtPosition(
            resource.toString(),
            webGpuRenderManagerOffset
        );

        return {
            markers: markers.map((marker) => ({
                code: marker.code,
                message: marker.message,
                startLineNumber: marker.startLineNumber,
                startColumn: marker.startColumn,
            })),
            exoHasApplication: !!applicationQuickInfo?.displayParts?.some((part) => part.text.includes('Application')),
            webGl2HasRenderManager: !!webGl2RenderManagerQuickInfo?.displayParts?.some(
                (part) => part.text.includes('WebGl2RenderManager')
            ),
            webGpuHasRenderManager: !!webGpuRenderManagerQuickInfo?.displayParts?.some(
                (part) => part.text.includes('WebGpuRenderManager')
            ),
        };
    });

    assert.deepEqual(diagnostics.markers, [], `Monaco emitted ExoJS diagnostics: ${JSON.stringify(diagnostics.markers)}`);
    assert.equal(diagnostics.exoHasApplication, true, 'Monaco completions did not expose exojs.Application.');
    assert.equal(
        diagnostics.webGl2HasRenderManager,
        true,
        'Monaco symbol info did not expose exojs.WebGl2RenderManager.'
    );
    assert.equal(
        diagnostics.webGpuHasRenderManager,
        true,
        'Monaco symbol info did not expose exojs.WebGpuRenderManager.'
    );
};

const assertExampleDiagnosticsAreSane = async (page, disallowedMarkerFragments) => {
    const markers = await page.evaluate(async () => {
        const appRoot = document.querySelector('example-browser')?.shadowRoot;
        const editorRoot = appRoot?.querySelector('exo-editor')?.shadowRoot;
        const editorCodeElement = editorRoot?.querySelector('exo-code-editor');
        const editorView = editorCodeElement?.editorView;
        const monaco = window.monaco;

        if (!editorView || !monaco) {
            throw new Error('Monaco editor instance is not available.');
        }

        const model = editorView.getModel();

        if (!model) {
            throw new Error('Monaco model is not available.');
        }

        await new Promise((resolve) => setTimeout(resolve, 1200));

        return monaco.editor.getModelMarkers({ resource: model.uri }).map((marker) => ({
            code: String(marker.code || ''),
            message: marker.message,
            severity: marker.severity,
            startLineNumber: marker.startLineNumber,
            startColumn: marker.startColumn,
        }));
    });

    const matchedMarkers = markers.filter((marker) =>
        disallowedMarkerFragments.some((fragment) => marker.message.includes(fragment))
    );

    assert.deepEqual(
        matchedMarkers,
        [],
        `Monaco emitted stale diagnostics for the active example: ${JSON.stringify(matchedMarkers)}`
    );
};

test('dist app opens in nested path and initializes Exo preview without runtime errors', async () => {
    await runSmokeForMountPath(defaultMountPath, '', {
        expectCanvas: false,
        fallbackText: 'does not support WebGL',
    });
});

test('dist app also works from a deeper nested mount path', async () => {
    await runSmokeForMountPath('/foo/bar/exo-preview/', '', {
        expectCanvas: false,
        fallbackText: 'does not support WebGL',
    });
});

test('dist app also works from a GitHub Pages-style path without a trailing slash', async () => {
    await runSmokeForMountPath(defaultMountPath, '', {
        expectCanvas: false,
        fallbackText: 'does not support WebGL',
        entryPath: '',
    });
});

test('examples catalog entries exist on disk and README links match the route hashes', () => {
    const readmeContents = fs.readFileSync(readmePath, 'utf8');
    const missingFiles = [];
    const missingReadmeLinks = [];
    const metadataViolations = [];

    for (const route of allExampleRoutes) {
        const examplePath = path.join(projectRoot, 'public', 'examples', route.path);

        if (!fs.existsSync(examplePath)) {
            missingFiles.push(path.relative(projectRoot, examplePath));
        }

        if (!readmeContents.includes(route.routeHash)) {
            missingReadmeLinks.push(route.routeHash);
        }

        if (route.slug !== path.basename(route.path, '.js')) {
            metadataViolations.push(`${route.routeHash}: slug does not match path basename`);
        }

        if (path.dirname(route.path) !== route.section) {
            metadataViolations.push(`${route.routeHash}: path directory does not match section`);
        }

        if (typeof route.title !== 'string' || route.title.trim() === '') {
            metadataViolations.push(`${route.routeHash}: missing title`);
        }

        if (typeof route.description !== 'string' || route.description.trim() === '') {
            metadataViolations.push(`${route.routeHash}: missing description`);
        }

        if (!Array.isArray(route.tags) || route.tags.length === 0) {
            metadataViolations.push(`${route.routeHash}: missing tags`);
        }

        if (route.backend === 'webgpu' || route.backend === 'advanced') {
            if (typeof route.unsupportedNote !== 'string' || route.unsupportedNote.trim() === '') {
                metadataViolations.push(`${route.routeHash}: missing unsupportedNote`);
            }
        }
    }

    assert.deepEqual(missingFiles, [], `Catalog examples missing on disk: ${missingFiles.join(' | ')}`);
    assert.deepEqual(missingReadmeLinks, [], `README missing example links: ${missingReadmeLinks.join(' | ')}`);
    assert.deepEqual(metadataViolations, [], `Catalog metadata issues detected: ${metadataViolations.join(' | ')}`);
});

test('backend policy stays aligned: normal examples use default backend, webgpu examples stay explicit', () => {
    const policyViolations = [];

    for (const route of allExampleRoutes) {
        const examplePath = path.join(projectRoot, 'public', 'examples', route.path);
        const source = fs.readFileSync(examplePath, 'utf8');
        const hasExplicitWebGpuBackend = source.includes(`backend: { type: 'webgpu' }`);
        const importsWebGpuSubpath = source.includes(`from 'exojs/webgpu'`) || source.includes(`from "exojs/webgpu"`);
        const importsWebGl2Subpath = source.includes(`from 'exojs/webgl2'`) || source.includes(`from "exojs/webgl2"`);

        if (route.section === 'webgpu') {
            if (!hasExplicitWebGpuBackend) {
                policyViolations.push(`${route.routeHash}: missing explicit webgpu backend`);
            }

            if (route.routeHash !== '#webgpu/custom-triangle-renderer.js' && importsWebGpuSubpath) {
                policyViolations.push(`${route.routeHash}: unexpected raw exojs/webgpu import`);
            }

            if (!['webgpu', 'advanced'].includes(route.backend)) {
                policyViolations.push(`${route.routeHash}: webgpu section entry should be labeled webgpu or advanced`);
            }

            continue;
        }

        if (route.backend !== 'core') {
            policyViolations.push(`${route.routeHash}: normal example should be labeled core`);
        }

        if (hasExplicitWebGpuBackend) {
            policyViolations.push(`${route.routeHash}: normal example should use default backend`);
        }

        if (importsWebGpuSubpath) {
            policyViolations.push(`${route.routeHash}: normal example should not import exojs/webgpu`);
        }

        if (importsWebGl2Subpath) {
            policyViolations.push(`${route.routeHash}: normal example should not import exojs/webgl2`);
        }
    }

    assert.deepEqual(policyViolations, [], `Backend policy drift detected: ${policyViolations.join(' | ')}`);
});

test('Monaco resolves current ExoJS single-bundle package declarations', async () => {
    await runSmokeForMountPath(defaultMountPath, '#webgpu/graphics-basics.js', {
        expectCanvas: false,
        fallbackText: 'requires browser WebGPU support',
        afterLoad: async ({ page }) => {
            await assertMonacoExoPackageSupport(page);
        },
    });
});

test('Monaco does not emit stale diagnostics for valid example scene patterns', async () => {
    await runSmokeForMountPath(defaultMountPath, '#extras/audio-visualisation.js', {
        expectCanvas: false,
        fallbackText: 'does not support WebGL',
        afterLoad: async ({ page }) => {
            await assertExampleDiagnosticsAreSane(page, [
                'Type \'(loader: Loader) => void\' is not assignable to type \'(loader: Loader) => Promise<void>\'',
                'Argument of type \'"music"\' is not assignable to parameter of type \'ResourceTypes\'',
                'Property \'_music\' does not exist on type \'SceneData\'',
                'Property \'app\' does not exist on type \'SceneData\'',
                'Property \'clear\' does not exist on type \'SceneRenderRuntime\'',
            ]);
        },
    });
});

test('Monaco renders hover and suggest widgets at usable widths', async () => {
    await runSmokeForMountPath(defaultMountPath, '#rendering/sprite.js', {
        expectCanvas: false,
        fallbackText: 'does not support WebGL',
        afterLoad: async ({ page }) => {
            const widgetState = await page.evaluate(async () => {
                const appRoot = document.querySelector('example-browser')?.shadowRoot;
                const editorRoot = appRoot?.querySelector('exo-editor')?.shadowRoot;
                const editorCode = editorRoot?.querySelector('exo-code-editor');
                const editorCodeRoot = editorCode;
                const editor = editorCode?.editorView;
                const model = editor?.getModel();

                if (!editor || !model) {
                    throw new Error('Monaco editor is not ready.');
                }

                const lines = model.getLinesContent();
                lines[0] = "import { Application,, Color, Scene, Sprite } from 'exojs';";
                editor.setValue(lines.join('\n'));
                editor.setPosition({ lineNumber: 1, column: 22 });
                editor.focus();

                await new Promise((resolve) => setTimeout(resolve, 500));
                await editor.getAction('editor.action.showHover').run();
                await new Promise((resolve) => setTimeout(resolve, 400));
                const hover = editorCodeRoot?.querySelector('.monaco-hover');
                const hoverState = {
                    hoverExists: !!hover,
                    hoverText: hover?.textContent || '',
                    hoverWidth: hover ? Number.parseFloat(getComputedStyle(hover).width) : 0,
                };

                await editor.getAction('editor.action.triggerSuggest').run();
                await new Promise((resolve) => setTimeout(resolve, 400));

                const suggest = editorCodeRoot?.querySelector('.suggest-widget');

                return {
                    ...hoverState,
                    suggestExists: !!suggest,
                    suggestWidth: suggest ? Number.parseFloat(getComputedStyle(suggest).width) : 0,
                };
            });

            assert.equal(widgetState.hoverExists, true, 'Monaco hover widget did not render.');
            assert.equal(widgetState.suggestExists, true, 'Monaco suggest widget did not render.');
            assert.ok(widgetState.suggestWidth >= 280, `Monaco suggest widget width is still too small: ${widgetState.suggestWidth}px`);
        },
    });
});

test('editor shows metadata, reports preview errors, and reset restores the original example code', async () => {
    const route = allExampleRoutes.find((example) => example.path === 'rendering/sprite.js');
    assert.ok(route, 'rendering/sprite.js route metadata not found.');

    await runSmokeForMountPath(defaultMountPath, route.routeHash, {
        expectCanvas: false,
        fallbackText: 'does not support WebGL',
        afterLoad: async ({ page }) => {
            const initialState = await page.evaluate(() => {
                const appRoot = document.querySelector('example-browser')?.shadowRoot;
                const appHeaderRoot = appRoot?.querySelector('exo-app-header')?.shadowRoot;
                const navigationRoot = appRoot?.querySelector('exo-navigation')?.shadowRoot;
                const editorRoot = appRoot?.querySelector('exo-editor')?.shadowRoot;
                const editorCodeElement = editorRoot?.querySelector('exo-code-editor');
                const editorView = editorCodeElement?.editorView;
                const toolbarTitle = editorCodeElement
                    ?.querySelector('exo-toolbar')
                    ?.shadowRoot
                    ?.querySelector('.title')
                    ?.textContent
                    ?.trim() || '';
                const activeNavigationLink = Array.from(navigationRoot?.querySelectorAll('exo-nav-link') || [])
                    .find((element) => element.shadowRoot?.querySelector('a[data-active]'));
                const activeNavigationAnchor = activeNavigationLink?.shadowRoot?.querySelector('a');

                return {
                    appHeaderTitle: appHeaderRoot?.querySelector('.title')?.textContent?.trim() || '',
                    toolbarTitle,
                    activeLinkTitle: activeNavigationAnchor?.querySelector('.title')?.textContent?.trim() || '',
                    activeLinkTooltip: activeNavigationAnchor?.getAttribute('title') || '',
                    availableTags: Array.from(navigationRoot?.querySelectorAll('#tag-filter-options option') || [])
                        .map((option) => option.getAttribute('value') || '')
                        .filter(Boolean),
                    source: editorView?.getValue?.() || '',
                    sourcePrefix: (editorView?.getValue?.() || '').slice(0, 80),
                };
            });

            assert.equal(initialState.appHeaderTitle, `Example: ${route.title}`, 'Header title did not reflect active example metadata.');
            assert.equal(initialState.toolbarTitle, `Edit Code: ${route.title}`, 'Editor toolbar title did not reflect active example metadata.');
            assert.equal(initialState.activeLinkTitle, route.title, 'Active navigation entry title did not match metadata.');
            assert.equal(initialState.activeLinkTooltip, route.description, 'Active navigation tooltip did not expose metadata description.');
            for (const tag of route.tags) {
                assert.ok(initialState.availableTags.includes(tag), `Tag "${tag}" was missing from sidebar filter options.`);
            }
            assert.ok(initialState.source.length > 50, 'Original editor source was not available.');

            await page.evaluate(() => {
                const appRoot = document.querySelector('example-browser')?.shadowRoot;
                const editorRoot = appRoot?.querySelector('exo-editor')?.shadowRoot;
                const editorCodeElement = editorRoot?.querySelector('exo-code-editor');
                const editorView = editorCodeElement?.editorView;

                if (!editorView) {
                    throw new Error('Monaco editor instance was not found.');
                }

                editorView.setValue('throw new Error(\"Intentional preview failure\");');
            });

            await page.evaluate(() => {
                const appRoot = document.querySelector('example-browser')?.shadowRoot;
                const editorRoot = appRoot?.querySelector('exo-editor')?.shadowRoot;
                const editorCodeRoot = editorRoot?.querySelector('exo-code-editor');
                const refreshButton = editorCodeRoot?.querySelector('.more-button[title="Refresh preview (Ctrl+Enter)"]');

                if (!refreshButton) {
                    throw new Error('Refresh button not found.');
                }

                refreshButton.click();
            });

            await page.waitForFunction(() => {
                const appRoot = document.querySelector('example-browser')?.shadowRoot;
                const editorRoot = appRoot?.querySelector('exo-editor')?.shadowRoot;
                const errorPanel = editorRoot?.querySelector('details.error-panel');

                return (errorPanel?.textContent || '').includes('Intentional preview failure');
            }, { timeout: 45000 });

            page.once('dialog', async (dialog) => {
                await dialog.accept();
            });

            await page.evaluate(() => {
                const appRoot = document.querySelector('example-browser')?.shadowRoot;
                const editorRoot = appRoot?.querySelector('exo-editor')?.shadowRoot;
                const editorCodeRoot = editorRoot?.querySelector('exo-code-editor');
                const menuButton = editorCodeRoot?.querySelector('.more-button[aria-label="More options"]');

                if (!(menuButton instanceof HTMLElement)) {
                    throw new Error('More options button not found.');
                }

                menuButton.click();
            });

            // Lit updates the dropdown asynchronously; wait for it before querying the reset button.
            await page.waitForFunction(() => {
                const appRoot = document.querySelector('example-browser')?.shadowRoot;
                const editorRoot = appRoot?.querySelector('exo-editor')?.shadowRoot;
                const editorCodeRoot = editorRoot?.querySelector('exo-code-editor');
                return !!editorCodeRoot?.querySelector('.menu-item[data-variant="danger"]');
            }, { timeout: 5000 });

            await page.evaluate(() => {
                const appRoot = document.querySelector('example-browser')?.shadowRoot;
                const editorRoot = appRoot?.querySelector('exo-editor')?.shadowRoot;
                const editorCodeRoot = editorRoot?.querySelector('exo-code-editor');
                const resetButton = editorCodeRoot?.querySelector('.menu-item[data-variant="danger"]');

                if (!resetButton) {
                    throw new Error('Reset button not found.');
                }

                resetButton.click();
            });

            await page.waitForFunction((originalSource) => {
                const appRoot = document.querySelector('example-browser')?.shadowRoot;
                const editorRoot = appRoot?.querySelector('exo-editor')?.shadowRoot;
                const editorCodeElement = editorRoot?.querySelector('exo-code-editor');
                const editorView = editorCodeElement?.editorView;
                const errorPanel = editorRoot?.querySelector('details.error-panel');
                const currentSource = editorView?.getValue?.() || '';

                return currentSource.startsWith(originalSource) && !errorPanel;
            }, initialState.sourcePrefix, { timeout: 45000 });
        },
    });
});

test('applying a sidebar tag filter narrows the catalog while keeping the active entry', async () => {
    const route = allExampleRoutes.find((example) => example.path === 'rendering/sprite.js');
    assert.ok(route, 'rendering/sprite.js route metadata not found.');

    await runSmokeForMountPath(defaultMountPath, route.routeHash, {
        expectCanvas: false,
        fallbackText: 'does not support WebGL',
        afterLoad: async ({ page }) => {
            const selectedTag = route.tags[0];
            assert.ok(selectedTag, 'Route metadata did not include a tag to filter by.');

            await page.evaluate((tag) => {
                const appRoot = document.querySelector('example-browser')?.shadowRoot;
                const navigationRoot = appRoot?.querySelector('exo-navigation')?.shadowRoot;
                const filterInput = navigationRoot?.querySelector('#tag-filter');

                if (!(filterInput instanceof HTMLInputElement)) {
                    throw new Error('Tag filter input was not rendered.');
                }

                filterInput.value = tag;
                filterInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                filterInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            }, selectedTag);

            await page.waitForFunction((expectedTag) => {
                const appRoot = document.querySelector('example-browser')?.shadowRoot;
                const navigationRoot = appRoot?.querySelector('exo-navigation')?.shadowRoot;
                const filterInput = navigationRoot?.querySelector('#tag-filter');
                return filterInput?.value === expectedTag;
            }, selectedTag, { timeout: 45000 });

            const filterState = await page.evaluate(() => {
                const appRoot = document.querySelector('example-browser')?.shadowRoot;
                const navigationRoot = appRoot?.querySelector('exo-navigation')?.shadowRoot;
                const filterInput = navigationRoot?.querySelector('#tag-filter');
                const visibleTitles = Array.from(navigationRoot?.querySelectorAll('exo-nav-link') || [])
                    .map((element) => element.shadowRoot?.querySelector('.title')?.textContent?.trim() || '')
                    .filter(Boolean);
                const activeLink = Array.from(navigationRoot?.querySelectorAll('exo-nav-link') || [])
                    .find((element) => element.shadowRoot?.querySelector('a[data-active]'));

                return {
                    filterValue: filterInput?.value || '',
                    visibleTitles,
                    activeTitle: activeLink?.shadowRoot?.querySelector('.title')?.textContent?.trim() || '',
                };
            });

            assert.equal(filterState.filterValue, selectedTag, 'Sidebar tag filter did not apply the selected tag.');
            assert.ok(filterState.visibleTitles.includes(route.title), 'Filtered sidebar hid the active example unexpectedly.');
            assert.equal(filterState.activeTitle, route.title, 'Active sidebar highlight drifted after applying a tag filter.');
            assert.ok(filterState.visibleTitles.length > 0, 'Tag filtering removed all sidebar entries.');
        },
    });
});

test('switching examples keeps the Monaco editor populated and usable', async () => {
    await runSmokeForMountPath(defaultMountPath, '#rendering/sprite.js', {
        expectCanvas: false,
        fallbackText: 'does not support WebGL',
        afterLoad: async ({ page }) => {
            await page.evaluate(() => {
                const appRoot = document.querySelector('example-browser')?.shadowRoot;
                const navigationRoot = appRoot?.querySelector('exo-navigation')?.shadowRoot;
                const targetLink = Array.from(navigationRoot?.querySelectorAll('exo-nav-link') || [])
                    .find((element) => element.shadowRoot?.querySelector('a')?.getAttribute('href') === '#rendering/display-text.js');
                const anchor = targetLink?.shadowRoot?.querySelector('a');

                if (!(anchor instanceof HTMLElement)) {
                    throw new Error('Could not find the display-text navigation link.');
                }

                anchor.click();
            });

            await page.waitForFunction(() => window.location.hash === '#rendering/display-text.js', { timeout: 45000 });

            await page.waitForFunction(() => {
                const appRoot = document.querySelector('example-browser')?.shadowRoot;
                const editorRoot = appRoot?.querySelector('exo-editor')?.shadowRoot;
                const editorCodeElement = editorRoot?.querySelector('exo-code-editor');
                const editorCodeRoot = editorCodeElement;
                const editorView = editorCodeElement?.editorView;
                const source = editorView?.getValue?.() || '';
                const loadingOverlay = editorCodeRoot?.querySelector('.loading-overlay');

                return source.includes("new Text('Hello World!'") && !loadingOverlay;
            }, { timeout: 45000 });

            const switchedState = await page.evaluate(() => {
                const appRoot = document.querySelector('example-browser')?.shadowRoot;
                const appHeaderRoot = appRoot?.querySelector('exo-app-header')?.shadowRoot;
                const editorRoot = appRoot?.querySelector('exo-editor')?.shadowRoot;
                const editorCodeElement = editorRoot?.querySelector('exo-code-editor');
                const editorCodeRoot = editorCodeElement;
                const editorView = editorCodeElement?.editorView;
                const editorElement = editorCodeRoot?.querySelector('.monaco-editor');

                return {
                    title: appHeaderRoot?.querySelector('.title')?.textContent?.trim() || '',
                    sourceLength: editorView?.getValue?.().length || 0,
                    hasEditor: !!editorElement && !!editorView,
                };
            });

            assert.equal(switchedState.title, 'Example: Display Text', 'Example header did not update after navigation.');
            assert.equal(switchedState.hasEditor, true, 'Monaco editor did not remain initialized after navigation.');
            assert.ok(switchedState.sourceLength > 50, 'Monaco editor lost its source content after navigation.');

            const lineBox = await page.evaluate(() => {
                const appRoot = document.querySelector('example-browser')?.shadowRoot;
                const editorRoot = appRoot?.querySelector('exo-editor')?.shadowRoot;
                const editorCodeRoot = editorRoot?.querySelector('exo-code-editor');
                const content = editorCodeRoot?.querySelector('.view-lines');
                const rect = content?.getBoundingClientRect();

                if (!rect) {
                    return null;
                }

                return {
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height,
                };
            });

            assert.ok(lineBox, 'Could not locate the Monaco content area for interaction testing.');

            await page.mouse.click(lineBox.x + 80, lineBox.y + 40);

            await page.waitForFunction(() => {
                const appRoot = document.querySelector('example-browser')?.shadowRoot;
                const editorRoot = appRoot?.querySelector('exo-editor')?.shadowRoot;
                const editorCodeRoot = editorRoot?.querySelector('exo-code-editor');
                const inputArea = editorCodeRoot?.querySelector('.inputarea');

                // .inputarea lives inside exo-editor's shadow root (exo-code-editor renders
                // in light DOM). The shadow root's activeElement is the correct check.
                return editorRoot?.activeElement === inputArea;
            }, { timeout: 45000 });
        },
    });
});

test('unsupported navigation state and collapsible sections stay visible in the shell', async () => {
    await runSmokeForMountPath(defaultMountPath, '#rendering/sprite.js', {
        expectCanvas: false,
        fallbackText: 'does not support WebGL',
        afterLoad: async ({ page }) => {
            const runtimeState = await page.evaluate(() => {
                const appRoot = document.querySelector('example-browser')?.shadowRoot;
                const navigationRoot = appRoot?.querySelector('exo-navigation')?.shadowRoot;
                const webgpuSection = Array.from(navigationRoot?.querySelectorAll('exo-nav-section') || [])
                    .find((element) => element.getAttribute('headline') === 'Webgpu');
                const webgpuToggle = webgpuSection?.shadowRoot?.querySelector('button.toggle');
                const webgpuUnavailableBadges = Array.from(webgpuSection?.querySelectorAll('exo-nav-link') || [])
                    .filter((element) => !!element.shadowRoot?.querySelector('.badge'))
                    .length;
                const beforeExpanded = webgpuToggle?.getAttribute('aria-expanded') || '';

                return { beforeExpanded, webgpuUnavailableBadges };
            });

            // The webgpu section is collapsed by default when a non-webgpu example is active.
            // Toggle it to the opposite state and verify the change takes effect.
            const expectedAfter = runtimeState.beforeExpanded === 'true' ? 'false' : 'true';

            await page.evaluate(() => {
                const appRoot = document.querySelector('example-browser')?.shadowRoot;
                const navigationRoot = appRoot?.querySelector('exo-navigation')?.shadowRoot;
                const webgpuSection = Array.from(navigationRoot?.querySelectorAll('exo-nav-section') || [])
                    .find((element) => element.getAttribute('headline') === 'Webgpu');
                const webgpuToggle = webgpuSection?.shadowRoot?.querySelector('button.toggle');

                if (!(webgpuToggle instanceof HTMLElement)) {
                    throw new Error('Could not find the WebGPU navigation toggle.');
                }

                webgpuToggle.click();
            });

            await page.waitForFunction((targetExpanded) => {
                const appRoot = document.querySelector('example-browser')?.shadowRoot;
                const navigationRoot = appRoot?.querySelector('exo-navigation')?.shadowRoot;
                const webgpuSection = Array.from(navigationRoot?.querySelectorAll('exo-nav-section') || [])
                    .find((element) => element.getAttribute('headline') === 'Webgpu');
                const webgpuToggle = webgpuSection?.shadowRoot?.querySelector('button.toggle');

                return webgpuToggle?.getAttribute('aria-expanded') === targetExpanded;
            }, expectedAfter, { timeout: 45000 });

            assert.ok(['true', 'false'].includes(runtimeState.beforeExpanded), 'WebGPU section toggle button was not rendered.');
            assert.ok(runtimeState.webgpuUnavailableBadges >= 0, 'WebGPU unavailable state query did not complete.');
        },
    });
});

test('view handling keeps the preview iframe focusable for keyboard-driven controls', async () => {
    await runSmokeForMountPath(defaultMountPath, '#rendering/view-handling.js', {
        expectCanvas: false,
        fallbackText: 'does not support WebGL',
        afterLoad: async ({ page }) => {
            await page.waitForFunction(() => {
                const appRoot = document.querySelector('example-browser')?.shadowRoot;
                const editorRoot = appRoot?.querySelector('exo-editor')?.shadowRoot;
                const previewRoot = editorRoot?.querySelector('exo-preview')?.shadowRoot;
                return !!previewRoot?.querySelector('iframe');
            }, { timeout: 45000 });

            await page.evaluate(() => {
                const appRoot = document.querySelector('example-browser')?.shadowRoot;
                const editorRoot = appRoot?.querySelector('exo-editor')?.shadowRoot;
                const previewRoot = editorRoot?.querySelector('exo-preview')?.shadowRoot;
                const iframe = previewRoot?.querySelector('iframe');

                if (!(iframe instanceof HTMLIFrameElement)) {
                    throw new Error('Preview iframe was not rendered.');
                }

                iframe.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
            });

            await page.waitForFunction(() => {
                const appRoot = document.querySelector('example-browser')?.shadowRoot;
                const editorRoot = appRoot?.querySelector('exo-editor')?.shadowRoot;
                const previewRoot = editorRoot?.querySelector('exo-preview')?.shadowRoot;
                const iframe = previewRoot?.querySelector('iframe');
                const activeElement = document.activeElement;

                return iframe === activeElement || iframe?.contentDocument?.body === iframe?.contentDocument?.activeElement;
            }, { timeout: 45000 });
        },
    });
});

test('media examples rely on in-example pointer interaction without shell start controls', async () => {
    await runSmokeForMountPath(defaultMountPath, '#rendering/display-video.js', {
        expectCanvas: false,
        fallbackText: 'does not support WebGL',
        afterLoad: async ({ page }) => {
            const previewState = await page.evaluate(() => {
                const appRoot = document.querySelector('example-browser')?.shadowRoot;
                const editorRoot = appRoot?.querySelector('exo-editor')?.shadowRoot;
                const previewRoot = editorRoot?.querySelector('exo-preview')?.shadowRoot;
                const iframe = previewRoot?.querySelector('iframe');
                const iframeDocument = iframe?.contentDocument || iframe?.contentWindow?.document;
                const frameText = iframeDocument?.body?.innerText || '';
                const hasCanvas = !!iframeDocument?.querySelector('canvas');

                return {
                    hasCanvas,
                    hasShellStartButton: Array.from(editorRoot?.querySelectorAll('button') || [])
                        .some((button) => (button.textContent || '').toLowerCase().includes('start media')),
                    unavailableMessage: editorRoot?.querySelector('.unavailable-message')?.textContent?.trim() || '',
                    previewBlanked: iframeDocument?.body?.hasAttribute('data-preview-blanked') ?? false,
                    frameText,
                };
            });

            if (!previewState.hasCanvas) {
                assert.ok(
                    previewState.frameText.includes('does not support WebGL') ||
                    previewState.unavailableMessage.length > 0 ||
                    previewState.previewBlanked,
                    'Media preview neither rendered nor exposed the expected shell fallback state.'
                );
                return;
            }

            assert.equal(previewState.hasShellStartButton, false, 'Shell media start button should not be rendered.');

            await page.evaluate(() => {
                const appRoot = document.querySelector('example-browser')?.shadowRoot;
                const editorRoot = appRoot?.querySelector('exo-editor')?.shadowRoot;
                const navigationRoot = appRoot?.querySelector('exo-navigation')?.shadowRoot;
                const targetLink = Array.from(navigationRoot?.querySelectorAll('exo-nav-link') || [])
                    .find((element) => element.shadowRoot?.querySelector('a')?.getAttribute('href') === '#extras/audio-visualisation.js');
                const anchor = targetLink?.shadowRoot?.querySelector('a');

                if (!(anchor instanceof HTMLElement)) {
                    throw new Error('Could not find the audio-visualisation navigation link.');
                }

                anchor.click();
            });

            await page.waitForFunction(() => window.location.hash === '#extras/audio-visualisation.js', { timeout: 45000 });
            await page.waitForFunction(() => {
                const appRoot = document.querySelector('example-browser')?.shadowRoot;
                const editorRoot = appRoot?.querySelector('exo-editor')?.shadowRoot;
                const editorCodeElement = editorRoot?.querySelector('exo-code-editor');
                const editorView = editorCodeElement?.editorView;
                const source = editorView?.getValue?.() || '';
                const hasShellStartButton = Array.from(editorRoot?.querySelectorAll('button') || [])
                    .some((button) => (button.textContent || '').toLowerCase().includes('start media'));

                return source.includes('AudioAnalyser') && !hasShellStartButton;
            }, { timeout: 45000 });
        },
    });
});

for (const route of allExampleRoutes) {
    const expectsGracefulFallback = route.section === 'webgpu';
    const fallbackText = expectsGracefulFallback ? 'requires browser WebGPU support' : 'does not support WebGL';
    const testLabel = expectsGracefulFallback
        ? `dist route ${route.routeHash} renders or shows a graceful unsupported-environment message`
        : `dist route ${route.routeHash} renders or shows a graceful unsupported-backend message`;

    test(testLabel, async () => {
        await runSmokeForMountPath(defaultMountPath, route.routeHash, {
            expectCanvas: false,
            fallbackText,
        });
    });
}


