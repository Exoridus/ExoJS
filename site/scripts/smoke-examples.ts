/**
 * Runtime smoke test for the playground example catalog.
 *
 * For every entry in `examples/examples.json` this drives the real playground
 * route (`/en/playground/?example=...`) and checks that the example boots
 * without an uncaught error in EITHER realm - the playground shell or the
 * preview iframe - and actually paints something to its canvas.
 *
 * Driving the route rather than loading `preview.html` directly is the point:
 * the shell transpiles the TypeScript source through Monaco's worker and feeds
 * the result into the iframe, so the direct path executes prebuilt `.js` that
 * no visitor ever runs, and exercises none of the embedding, the capability
 * gate or the editor's error handling.
 *
 * It serves the built site (`site/dist`) over a throwaway static server, so it
 * needs `pnpm site:build` to have run first. It is intentionally a standalone
 * script (not part of `npm test`): it drives a real headless browser and is
 * too heavy/environment-dependent for the default unit suite.
 *
 * Usage:
 *   pnpm --filter @codexo/exojs-examples examples:smoke      # from repo: pnpm test:examples:smoke
 *   ... --only camera-basic        # smoke a single example (path substring)
 *   ... --sample                   # one example per category (the PR-stage subset)
 *   ... --renderer webgl2          # withhold the WebGPU adapter (see `forceWebGl2`)
 *   ... --concurrency 4            # parallel pages (default: half the cores, at most 4)
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
 * Exit code is 1 when any example fails. An uncaught error, a preview that
 * never mounts a canvas, and a canvas that stays one uniform color all count
 * as failures - the blank case included, because that is exactly the shape a
 * silently broken example takes. Examples that legitimately paint nothing
 * belong in `BLANK_ALLOWLIST` with a reason. Capability/unsupported skips do
 * not fail the run.
 */
import { createServer, type Server } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

import { chromium, firefox, type Browser, type BrowserContext, type Frame, type Page } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..'); // site/
const repoRoot = resolve(projectRoot, '..'); // repo root
const distDir = resolve(projectRoot, 'dist');
const catalogPath = resolve(repoRoot, 'examples', 'examples.json');
const reportPath = resolve(repoRoot, '.workspace', 'reports', 'example-smoke.md');
const artifactDir = resolve(repoRoot, '.workspace', 'reports', 'example-smoke-artifacts');

/**
 * The site's configured base path. Every URL in the built HTML carries it, so
 * the throwaway server strips it and the playground URLs re-add it.
 */
const SITE_BASE = '/ExoJS';

/**
 * Examples that legitimately paint nothing, so a uniform canvas is their
 * correct output rather than a silent failure. Every entry needs a reason:
 * without one, a genuinely broken example can be parked here and stop being
 * reported. Anything not listed fails the run when its canvas stays uniform.
 */
const BLANK_ALLOWLIST: Readonly<Record<string, string>> = {};
const BLANK_FAILURE = 'canvas rendered but appears blank - one uniform color, no error thrown';

/**
 * Press pointers onto the preview canvas and leave them down. The engine binds
 * its pointer listeners to the canvas element, so dispatching there is what a
 * held finger looks like from the example's side; nothing releases them, so the
 * settled frame the blank check screenshots is the one a user touching the
 * glass would see.
 */
const holdPointers = async (frame: Frame, points: readonly (readonly [number, number])[]): Promise<number> =>
  frame.evaluate(
    fractions => {
      const canvas = document.querySelector('canvas');

      if (!canvas) {
        return 0;
      }

      const rect = canvas.getBoundingClientRect();

      fractions.forEach(([fractionX, fractionY], index) => {
        const init: PointerEventInit = {
          bubbles: true,
          cancelable: true,
          buttons: 1,
          pointerId: index + 1,
          pointerType: 'touch',
          isPrimary: index === 0,
          clientX: rect.left + rect.width * fractionX,
          clientY: rect.top + rect.height * fractionY,
        };

        // `pointerover` first: the engine creates a pointer record on entry and
        // ignores a press whose id it has never seen, so a bare `pointerdown`
        // reaches nothing.
        canvas.dispatchEvent(new PointerEvent('pointerover', init));
        canvas.dispatchEvent(new PointerEvent('pointerdown', init));
      });

      return fractions.length;
    },
    points.map(point => [...point]),
  );

/**
 * Examples whose output exists only while an input is held - a touch example
 * paints one circle per finger and nothing at all with no finger down, so an
 * untouched run is indistinguishable from a broken one. The driver runs once
 * the preview canvas is mounted and before the blank check.
 */
const HELD_INPUT: Readonly<Record<string, (frame: Frame) => Promise<number>>> = {
  'input/multitouch.js': frame =>
    holdPointers(frame, [
      [0.35, 0.4],
      [0.5, 0.55],
      [0.65, 0.42],
    ]),
};

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
// failures are environment limits, not example bugs - they are skipped.
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

const isRecoverable = (message: string): boolean => {
  const normalized = message.toLowerCase();
  return RECOVERABLE.some(pattern => normalized.includes(pattern));
};

// Collapse multi-line compiler/runtime messages to a single line so they fit a
// markdown bullet / table cell.
const oneLine = (message: string): string => {
  return message.replace(/\s+/g, ' ').trim();
};

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
  /**
   * Errors raised by the playground shell rather than the example. Kept off the
   * example's own verdict and aggregated across the run, because one broken
   * shell would otherwise fail every entry in the catalog identically.
   */
  shellErrors?: string[];
}

interface ServedFile {
  body: Buffer;
  type: string;
}

const startServer = (root: string): Promise<{ port: number; server: Server }> => {
  // Every playground page pulls the editor shell, Monaco and the vendored
  // engine typings - upwards of a thousand files - and the run asks for the same
  // ones again for each example. `dist` cannot change while the run is in
  // flight, so each file is read once and answered from memory afterwards, and
  // never with a blocking read: one thread serves every concurrent page, and a
  // synchronous read stalls all of them for the duration of the slowest one.
  const files = new Map<string, Promise<ServedFile | null>>();

  const load = async (urlPath: string): Promise<ServedFile | null> => {
    let filePath = resolve(join(root, urlPath));
    const stats = await stat(filePath).catch(() => null);

    if (stats?.isDirectory()) {
      filePath = join(filePath, 'index.html');
    }

    const body = await readFile(filePath).catch(() => null);

    return body && { body, type: MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream' };
  };

  const server = createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
    // The site is built with a configured `base`, so every URL the emitted
    // HTML references carries that prefix while `dist` itself is flat.
    if (urlPath.startsWith(SITE_BASE)) {
      urlPath = urlPath.slice(SITE_BASE.length) || '/';
    }

    if (!resolve(join(root, urlPath)).startsWith(root)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    let pending = files.get(urlPath);
    if (!pending) {
      pending = load(urlPath);
      files.set(urlPath, pending);
    }

    pending
      .then(file => {
        if (!file) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }

        // Deliberately uncacheable: the pooled context shares one HTTP cache
        // between the examples that run in it, and a page closed mid-download
        // leaves an entry the next example would then fail to read. The warm V8
        // code cache is what the pool is for, and that survives `no-store`.
        res.writeHead(200, { 'Content-Type': file.type, 'Cache-Control': 'no-store' });
        res.end(file.body);
      })
      .catch((error: unknown) => {
        res.writeHead(500);
        res.end(error instanceof Error ? error.message : String(error));
      });
  });

  return new Promise(resolvePromise => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolvePromise({ port, server });
    });
  });
};

const captureErrors = (): void => {
  interface SmokeWindow {
    __SMOKE_ERRORS__?: { message: string }[];
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
};

// Whether the example's canvas is a single uniform color - one uniform-color
// read is the same signature a hard crash produces (a backend that claims a
// context but never actually submits a frame, e.g. a WebGPU adapter that
// fails after context creation), so a hard crash is not the only way an
// example can be broken silently.
//
// Screenshots the canvas from OUTSIDE the page rather than sampling it with
// `drawImage`/`getImageData` from inside: a canvas bound to a `webgpu`
// context does not reliably surface its drawn content to same-page
// `drawImage` reads in this Chromium+Dawn(SwiftShader) combination - a bare
// clear-to-red-and-submit, no example code involved, still read back as
// (0,0,0,0). `page.screenshot()` goes through the compositor instead, which
// does see the real pixels; the PNG is then fed back into the page as a
// plain `<img>` so the actual uniform-color check can stay ordinary 2D canvas
// code (`drawImage` from an `<img>` has none of the webgpu-source problem).
//
// Downscaling to a fixed small grid rather than sampling a stride of the
// full-resolution pixels: a stride can land entirely within background and
// miss a small foreground object (a character sprite against a large empty
// stage), while downscaling blends every source pixel into one of the grid's
// cells, so even a few non-background pixels shift at least one cell's
// average.
/**
 * Whether the canvas is still one uniform colour after giving it room to draw.
 *
 * Polls rather than sampling once at a fixed delay: an example that paints
 * immediately is judged as soon as it has, while one that compiles shaders or
 * builds a filter chain first gets the time it needs. A single fixed wait has
 * to be either too short for the slowest example or wasted on every other one,
 * and picking it wrong turns a working example into a failure.
 */
const staysBlank = async (page: Page, previewFrame: Frame, timeoutMs: number): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;

  do {
    if (!(await isCanvasBlank(page, previewFrame))) {
      return false;
    }

    await page.waitForTimeout(400);
  } while (Date.now() < deadline);

  return true;
};

/**
 * Observe the canvas throughout the settle window so a short-lived animation
 * still proves that the example rendered, while preserving the full delay in
 * which deferred errors are allowed to surface.
 */
const rendersDuringSettle = async (page: Page, previewFrame: Frame, durationMs: number): Promise<boolean> => {
  const deadline = Date.now() + durationMs;
  let rendered = false;

  do {
    rendered ||= !(await isCanvasBlank(page, previewFrame));

    const remaining = deadline - Date.now();
    if (remaining > 0) {
      await page.waitForTimeout(Math.min(400, remaining));
    }
  } while (Date.now() < deadline);

  return rendered;
};

const isCanvasBlank = async (page: Page, previewFrame: Frame): Promise<boolean> => {
  // Measured on the preview IFRAME in the host document, never on the canvas
  // inside it: the playground scales the preview with a CSS transform, under
  // which the inner canvas reports a rect in its own untransformed space -
  // coordinates that can sit outside the viewport entirely and clip to nothing.
  // The iframe element is laid out normally, so its rect is what the viewer
  // actually sees.
  const box = await page.locator('iframe').first().boundingBox();
  if (!box || box.width === 0 || box.height === 0) return true;

  // Examples draw their HUD as fixed-position `<aside>` overlays on top of the
  // canvas. Those are DOM, not rendered output, and would make a blank canvas
  // read as painted, so they are hidden for the duration of the capture.
  const hideOverlays = (visibility: string): Promise<void> =>
    previewFrame
      .evaluate((value: string) => {
        for (const overlay of document.querySelectorAll('aside')) {
          (overlay as HTMLElement).style.visibility = value;
        }
      }, visibility)
      .catch(() => undefined);

  await hideOverlays('hidden');
  const png = await page.screenshot({ clip: box });
  await hideOverlays('');

  const dataUrl = `data:image/png;base64,${png.toString('base64')}`;

  return page.evaluate(async (imageDataUrl: string) => {
    const image = new Image();
    image.src = imageDataUrl;
    await image.decode();

    const gridSize = 48;
    const probe = document.createElement('canvas');
    probe.width = gridSize;
    probe.height = gridSize;
    const ctx = probe.getContext('2d');
    if (!ctx) return false; // cannot judge - do not report a false failure

    ctx.drawImage(image, 0, 0, gridSize, gridSize);
    const { data } = ctx.getImageData(0, 0, gridSize, gridSize);

    const [r0, g0, b0, a0] = data;
    for (let i = 4; i < data.length; i += 4) {
      if (data[i] !== r0 || data[i + 1] !== g0 || data[i + 2] !== b0 || data[i + 3] !== a0) return false;
    }
    return true;
  }, dataUrl);
};

/**
 * Waits for the playground's preview iframe to attach and mount a canvas, and
 * returns that frame. `null` means it never got there within `timeoutMs`.
 *
 * The frame is re-resolved on every attempt rather than captured once: the
 * playground reloads the iframe whenever the source it feeds in changes, which
 * detaches the previous frame and would leave a stale handle behind.
 */
const waitForPreviewCanvas = async (page: Page, timeoutMs: number): Promise<Frame | null> => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const frame = page.frames().find(candidate => candidate !== page.mainFrame() && candidate.url().includes('preview.html'));

    if (frame) {
      const hasCanvas = await frame.evaluate(() => !!document.querySelector('canvas')).catch(() => false);
      if (hasCanvas) return frame;
    }

    await page.waitForTimeout(250);
  }

  return null;
};

/**
 * The playground's capability overlay text, or `null` when no frame is showing
 * one. The overlay marks itself with `data-preview-blanked="capabilities"`;
 * the error path sets the same attribute with an empty value, so the value is
 * what distinguishes "this browser cannot run it" from "it broke".
 */
const readCapabilityOverlay = async (page: Page): Promise<string | null> => {
  for (const frame of page.frames()) {
    const text = await frame
      .evaluate(() => (document.body.getAttribute('data-preview-blanked') === 'capabilities' ? document.body.innerText : null))
      .catch(() => null);

    if (text !== null) return text;
  }

  return null;
};

/**
 * Uncaught errors from every realm of the page, split by which one raised them.
 * Each frame keeps its own `__SMOKE_ERRORS__` (installed by the context init
 * script, which runs per frame), so a failure that only ever surfaces inside
 * the iframe is reported rather than silently dropped.
 *
 * The split matters for attribution: a broken playground shell throws
 * identically for every example in the catalog and is one site defect, not N
 * broken examples. Only `preview` errors judge the example itself; `shell`
 * errors are collected across the run and reported once.
 */
const collectErrors = async (page: Page, pageErrors: readonly string[]): Promise<{ shell: string[]; preview: string[] }> => {
  const readFrame = (frame: Frame): Promise<string[]> =>
    frame
      .evaluate(() => {
        const w = window as unknown as { __SMOKE_ERRORS__?: { message: string }[] };
        return (w.__SMOKE_ERRORS__ ?? []).map(error => error.message);
      })
      .catch(() => [] as string[]);

  const shell = await readFrame(page.mainFrame());
  const nested = await Promise.all(
    page
      .frames()
      .filter(frame => frame !== page.mainFrame())
      .map(readFrame),
  );
  const preview = nested.flat();

  // `pageerror` carries no frame attribution, so anything it saw that the
  // preview realm did not record is attributed to the shell.
  for (const message of pageErrors) {
    if (!preview.includes(message) && !shell.includes(message)) {
      shell.push(message);
    }
  }

  return { shell, preview };
};

const detectWebGpu = async (browser: Browser, baseUrl: string): Promise<boolean> => {
  // Navigate to a real origin rather than about:blank - some Chromium builds
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
};

interface ContextPool {
  acquire: (hasTouch: boolean) => Promise<BrowserContext>;
  close: () => Promise<void>;
}

/**
 * Hands out one long-lived browser context per touch mode instead of a fresh
 * one per example.
 *
 * A playground page pulls the editor shell, Monaco and the vendored engine
 * typings - on the order of a thousand requests and tens of megabytes - and a
 * new context starts with an empty HTTP cache and an empty V8 code cache, so
 * every example paid for all of it again: the preview took about three times as
 * long to mount as it does in a warm context, which is what pushed the catalog
 * past its budget on a runner with no GPU. Each example still gets its own page,
 * and the playground's only persistent state is the layout toggle and the
 * version picker, neither of which an example can write.
 *
 * One pool per worker rather than one for the whole run: same-origin pages in a
 * single context share a renderer process, so a shared pool would put every
 * concurrent example on one main thread.
 */
const createContextPool = (browser: Browser, colorScheme: 'light' | 'dark'): ContextPool => {
  const contexts = new Map<boolean, Promise<BrowserContext>>();

  return {
    acquire: (hasTouch: boolean): Promise<BrowserContext> => {
      let pending = contexts.get(hasTouch);

      if (!pending) {
        // Wide enough that the playground lays out sidebar, editor and preview
        // panel side by side. A narrower viewport collapses the layout and can
        // leave the preview outside the rasterised area, where the compositor
        // never paints it and every example would read as blank.
        // `hasTouch` is what makes a touch-only example testable at all: without
        // it the browser reports no touch points, the playground's capability
        // gate replaces the stage with an overlay, and the example is never run.
        //
        // Declared per example rather than for the whole run, and not as a
        // refinement: enabling touch emulation everywhere turned the entire
        // catalog blank on CI's software rasteriser while a local GPU run stayed
        // green, so every example that does not ask for touch keeps exactly the
        // context it had.
        pending = browser.newContext({ viewport: { width: 1600, height: 900 }, colorScheme, hasTouch }).then(async context => {
          await context.addInitScript(captureErrors);
          return context;
        });
        contexts.set(hasTouch, pending);
      }

      return pending;
    },
    close: async (): Promise<void> => {
      const pending = [...contexts.values()];
      contexts.clear();
      await Promise.all(pending.map(async context => (await context).close()));
    },
  };
};

const runExample = async (
  pool: ContextPool,
  baseUrl: string,
  entry: CatalogEntry & { category: string },
  index: number,
  webgpuAvailable: boolean,
  timeoutMs: number,
): Promise<Result> => {
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

  if (!existsSync(join(distDir, 'examples', entry.path))) {
    result.status = 'failed';
    result.note = `source missing in build output: ${entry.path}`;
    return result;
  }

  const context = await pool.acquire(entry.capabilities?.includes('touch') ?? false);
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  try {
    // The real playground route, not preview.html on its own: this exercises
    // the editor shell, the TypeScript transpile that feeds the iframe, the
    // capability gate and the iframe embedding - everything a visitor hits.
    const slug = entry.path.replace(/\.js$/, '');
    const url = `${baseUrl}${SITE_BASE}/en/playground/?example=${encodeURIComponent(slug)}&no-cache=${index}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

    const previewFrame = await waitForPreviewCanvas(page, timeoutMs);

    // Let async load()/init() settle so deferred rejections surface too. Keep
    // observing during that window: transient examples may intentionally draw
    // their only automatic effect before the settling delay has elapsed.
    const renderedDuringSettle = previewFrame ? await rendersDuringSettle(page, previewFrame, 1500) : false;

    // After the settle, never before it: the example subscribes to its pointer
    // events in `init()`, and an input pressed while that is still pending is
    // dispatched into a canvas nobody is listening on yet.
    const holdInput = previewFrame ? HELD_INPUT[entry.path] : undefined;

    if (previewFrame && holdInput) {
      await holdInput(previewFrame);
    }

    const { shell, preview } = await collectErrors(page, pageErrors);
    result.shellErrors = shell.map(oneLine);

    const recoverable = preview.find(isRecoverable);
    if (recoverable) {
      result.status = 'skipped';
      result.note = oneLine(`backend unsupported: ${recoverable}`);
    } else if (preview.length > 0) {
      result.status = 'failed';
      result.note = oneLine(preview[0]);
    } else if (!previewFrame) {
      // The playground refuses to run an example whose declared capabilities
      // the browser lacks, and replaces the stage with an explanatory overlay
      // instead of throwing. That is an environment limit, not a defect - the
      // same category as the WebGPU-adapter skip above.
      const missing = await readCapabilityOverlay(page);

      if (missing) {
        result.status = 'skipped';
        result.note = oneLine(`capabilities unavailable in this environment: ${missing}`);
      } else {
        result.status = 'failed';
        result.note = 'the preview iframe never mounted a canvas (no error thrown)';
      }
    } else if (!renderedDuringSettle && (await staysBlank(page, previewFrame, timeoutMs))) {
      const reason = BLANK_ALLOWLIST[entry.path];
      if (reason) {
        result.status = 'passed';
        result.note = `blank by design: ${reason}`;
      } else {
        result.status = 'failed';
        result.note = BLANK_FAILURE;

        const injectedSource = await previewFrame
          .evaluate(() => document.querySelector<HTMLScriptElement>('script[type="module"]')?.textContent ?? '')
          .catch(() => '');
        if (injectedSource) {
          await mkdir(artifactDir, { recursive: true });
          await writeFile(join(artifactDir, entry.path.replaceAll('/', '__')), injectedSource, 'utf8');
        }

        // The capture the verdict was read from, not a fresh view of the page:
        // a blank report is unfalsifiable without it, since the same uniform
        // image is produced by an example that drew nothing and by a capture
        // that never received the compositor's output.
        const box = await page
          .locator('iframe')
          .first()
          .boundingBox()
          .catch(() => null);
        const capture = box ? await page.screenshot({ clip: box }).catch(() => null) : null;

        if (capture) {
          await mkdir(artifactDir, { recursive: true });
          await writeFile(join(artifactDir, `${entry.path.replaceAll('/', '__')}.png`), capture);
        }
      }
    }
  } catch (error) {
    result.status = 'failed';
    result.note = oneLine(`harness error: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    // The page, never the context: the context is pooled and its warm caches are
    // what the next example in this worker starts from.
    await page.close();
  }

  return result;
};

/**
 * One example per catalog category, in catalog order.
 *
 * The trade for a fraction of the wall time: a defect confined to a single
 * example goes unseen until the full run, while anything that stops a whole
 * category - a renderer path, a shared recipe, an engine regression - still
 * shows up here. That is the shape the failures this harness exists for
 * actually take.
 */
const sampleByCategory = <T extends { readonly category: string }>(entries: readonly T[]): T[] => {
  const seen = new Set<string>();

  return entries.filter(entry => {
    if (seen.has(entry.category)) {
      return false;
    }

    seen.add(entry.category);

    return true;
  });
};

const main = async (): Promise<void> => {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      only: { type: 'string' },
      sample: { type: 'boolean' }, // one example per category (see `sampleByCategory`)
      renderer: { type: 'string' }, // 'auto' (default) | 'webgl2' (see `forceWebGl2`)
      concurrency: { type: 'string' },
      'timeout-ms': { type: 'string' },
      browser: { type: 'string' }, // 'chromium' (default) | 'firefox'
      headed: { type: 'boolean' }, // force headed (any browser)
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
  // Withholding the WebGPU flag rather than passing a backend preference: the
  // playground picks its renderer from what the browser actually reports, so
  // an adapter that is never offered is the only way to make that choice from
  // outside the page. Examples that declare `webgpu` as a required capability
  // are then skipped by the playground's own gate rather than failing.
  const forceWebGl2 = values.renderer === 'webgl2';
  const colorScheme = values['color-scheme'] === 'dark' ? 'dark' : 'light';
  // Firefox needs headed for WebGPU adapter (same constraint as browser-webgpu-firefox vitest project).
  const headless = values.headed ? false : browserName !== 'firefox';

  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')) as Record<string, CatalogEntry[]>;
  let entries = Object.entries(catalog).flatMap(([category, list]) => list.map(entry => ({ ...entry, category })));
  if (values.only) {
    entries = entries.filter(entry => entry.path.includes(values.only!));
  }

  if (values.sample) {
    entries = sampleByCategory(entries);
  }

  // Half the cores, at most four: every page runs a main thread and, without a
  // GPU, a software rasteriser beside it. Four pages on a four-core runner
  // starved the heavy examples until the capture itself timed out.
  const defaultConcurrency = Math.min(4, Math.max(1, Math.floor(availableParallelism() / 2)));
  const concurrency = Math.max(1, Number.parseInt(values.concurrency ?? '', 10) || defaultConcurrency);
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
    // channel:'chromium' is required for the WebGPU adapter to be
    // available in headless mode - without it Chromium's GPU process
    // does not initialize properly and requestAdapter() returns null.
    // This mirrors the browser-webgpu vitest project's launchOptions.
    //
    // --use-angle=swiftshader is deliberately omitted: it forces ANGLE's
    // WebGL backend to SwiftShader, which conflicts with Dawn's own
    // SwiftShader path for WebGPU and prevents adapter acquisition.
    browser = await chromium.launch({
      channel: 'chromium',
      headless,
      args: forceWebGl2 ? ['--enable-webgl', '--ignore-gpu-blocklist'] : ['--enable-webgl', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'],
    });
  }

  const webgpuAvailable = await detectWebGpu(browser, baseUrl);
  console.log(
    `[smoke] ${entries.length} example(s) · ${browserName} · ${headless ? 'headless' : 'headed'} · ` +
      `color-scheme: ${colorScheme} · WebGPU adapter: ${webgpuAvailable ? 'yes' : 'no'}` +
      `${forceWebGl2 ? ' (withheld: --renderer webgl2)' : ''} · concurrency ${concurrency}`,
  );

  const results: Result[] = new Array(entries.length);
  let cursor = 0;

  const worker = async (): Promise<void> => {
    const pool = createContextPool(browser, colorScheme);

    try {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= entries.length) return;

        const entry = entries[index];
        const result = await runExample(pool, baseUrl, entry, index, webgpuAvailable, timeoutMs);
        results[index] = result;

        const tag = result.status.toUpperCase().padEnd(7);
        const line = `[smoke] ${tag} ${entry.path}${result.note ? ` — ${result.note}` : ''}`;
        if (result.status === 'failed') console.error(line);
        else console.log(line);
      }
    } finally {
      await pool.close();
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, () => worker()));

  // Chromium's compositor can occasionally return only the clear colour when
  // several independent WebGPU pages are being captured concurrently. Retry
  // only that silent visual signature, serially and in a fresh context. A real
  // blank remains a failure; thrown errors and missing canvases are never
  // softened by this retry.
  const blankFailureIndexes = results.flatMap((result, index) => (result.status === 'failed' && result.note === BLANK_FAILURE ? [index] : []));
  const retryPool = createContextPool(browser, colorScheme);

  for (const index of blankFailureIndexes) {
    const entry = entries[index]!;
    const firstResult = results[index]!;

    console.log(`[smoke] RETRY  ${entry.path} - serial blank verification`);

    const retryResult = await runExample(retryPool, baseUrl, entry, index + entries.length, webgpuAvailable, timeoutMs);

    retryResult.shellErrors = [...new Set([...(firstResult.shellErrors ?? []), ...(retryResult.shellErrors ?? [])])];
    results[index] = retryResult;

    const tag = retryResult.status.toUpperCase().padEnd(7);
    const line = `[smoke] ${tag} ${entry.path}${retryResult.note ? ` - ${retryResult.note}` : ''}`;
    if (retryResult.status === 'failed') console.error(line);
    else console.log(line);
  }

  await retryPool.close();
  await browser.close();
  await new Promise<void>(resolveClose => server.close(() => resolveClose()));

  const counts = {
    passed: results.filter(result => result.status === 'passed').length,
    failed: results.filter(result => result.status === 'failed').length,
    skipped: results.filter(result => result.status === 'skipped').length,
    warned: results.filter(result => result.status === 'warned').length,
  };

  // One shell defect throws for every example, so the distinct messages are
  // what carries information - not how many entries tripped over them. The
  // example each message was first seen in is kept: a message that only some
  // entries produce is a different problem from one the shell raises always.
  const shellErrors = new Map<string, string>();
  for (const result of results) {
    for (const message of result.shellErrors ?? []) {
      if (!shellErrors.has(message)) shellErrors.set(message, result.path);
    }
  }

  await writeReport(results, counts, webgpuAvailable, browserName, colorScheme, headless, shellErrors);

  console.log(`[smoke] passed ${counts.passed} · warned ${counts.warned} · skipped ${counts.skipped} · failed ${counts.failed}`);

  if (shellErrors.size > 0) {
    console.error(`[smoke] playground shell raised ${shellErrors.size} distinct error(s) - a site defect, not an example defect:`);
    for (const [message, path] of shellErrors) {
      console.error(`[smoke]   ${message} (first seen in ${path})`);
    }
  }

  console.log(`[smoke] report: ${reportPath}`);

  if (counts.failed > 0 || shellErrors.size > 0) {
    process.exitCode = 1;
  }
};

const writeReport = async (
  results: Result[],
  counts: Record<string, number>,
  webgpuAvailable: boolean,
  browserName = 'chromium',
  colorScheme = 'light',
  headless = true,
  shellErrors: ReadonlyMap<string, string> = new Map(),
): Promise<void> => {
  const icon: Record<Status, string> = { passed: '✅', failed: '❌', skipped: '⏭️', warned: '⚠️' };
  const lines: string[] = [];
  const mode = headless ? 'headless' : 'headed';

  lines.push('# Playground Example Runtime Smoke', '');
  lines.push(
    `_Generated ${new Date().toISOString()} · ${browserName} ${mode} · color-scheme: ${colorScheme} · ` +
      `WebGPU adapter: ${webgpuAvailable ? 'available' : 'unavailable'} · this file is gitignored._`,
    '',
  );
  lines.push(
    'Each catalog example is opened through the real Playground route, compiled by Monaco, injected into the `preview.html` iframe, and checked for shell/preview errors plus visible canvas output.',
    '',
  );
  lines.push('## Totals', '');
  lines.push(`| Total | ✅ Passed | ⚠️ Warned | ⏭️ Skipped | ❌ Failed |`);
  lines.push(`| --- | --- | --- | --- | --- |`);
  lines.push(`| ${results.length} | ${counts.passed} | ${counts.warned} | ${counts.skipped} | ${counts.failed} |`, '');

  if (shellErrors.size > 0) {
    lines.push('## ❌ Playground shell', '');
    lines.push('Raised by the playground page itself rather than by the example it ran - the entry named is where the message was first seen:', '');
    for (const [message, path] of shellErrors) {
      lines.push(`- ${message} — first seen in \`${path}\``);
    }
    lines.push('');
  }

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
};

await main();
