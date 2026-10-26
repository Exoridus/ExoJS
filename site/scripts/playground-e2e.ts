/**
 * Browser checks for the playground shell's Output panel and standalone Asset Browser,
 * against the built site (`site/dist`) or an existing local origin.
 *
 * The console bridge spans two realms - the parent shell patches the preview
 * iframe's console - so these checks drive a real Chromium through the real
 * playground route rather than a recreated bridge. They cover:
 *
 * - capture of all five console severities, several arguments, error stacks,
 *   circular values and unhandled rejections, with DevTools still receiving
 *   every message;
 * - the bounded record (rate limit, ring buffer) and generation isolation
 *   across preview reloads;
 * - the panel in the split, swapped, stacked and phone layouts, keyboard use,
 *   and that logging never moves focus out of the preview;
 * - the Asset Browser: catalog listing, one asset of every preview kind,
 *   spritesheet frame selection and animation settings, a late load that must
 *   not surface after a newer selection, cancelled playback that waits for the
 *   audio unlock, what stays resident after many switches, and switching away
 *   from the example while a load is still in flight;
 * - that every generated snippet type-checks against the engine sources.
 *
 * Needs `pnpm site:build` first. Exits 1 on any failed check.
 *
 * Usage:
 *   pnpm --filter @codexo/exojs-examples playground:e2e
 *   ... --only asset          # run the standalone Asset Browser checks and snippet typechecks
 *   ... --origin http://127.0.0.1:4333 --only asset  # reuse a running site
 *   ... --shots <dir>         # write a screenshot after each asset preview
 *   ... --headed              # watch it run
 */
import { readFileSync } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { type Browser, chromium, firefox, type Frame, type Page } from 'playwright';
import ts from 'typescript';

import { resolveSiteChannel } from '../../scripts/pages/site-channel.ts';
import { readSiteBuildManifest } from '../../scripts/pages/site-manifest.ts';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');
const repoRoot = resolve(projectRoot, '..');
const distDir = resolve(projectRoot, 'dist');
const snippetDir = resolve(repoRoot, '.workspace', 'playground-e2e', 'snippets');

const { values: options } = parseArgs({
  args: process.argv.slice(2),
  options: {
    only: { type: 'string' },
    origin: { type: 'string' },
    shots: { type: 'string' },
    headed: { type: 'boolean', default: false },
    browser: { type: 'string', default: 'chromium' },
  },
});

const MIME: Record<string, string> = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json',
  '.tmj': 'application/json',
  '.ldtk': 'application/json',
  '.map': 'application/json',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.fnt': 'text/plain',
};

const startServer = async (root: string, base: string): Promise<{ server: Server; origin: string }> => {
  const server = createServer((request, response) => {
    void (async () => {
      let urlPath = decodeURIComponent((request.url ?? '/').split('?')[0]!);

      if (urlPath !== base && !urlPath.startsWith(`${base}/`)) {
        response.writeHead(404).end();

        return;
      }

      urlPath = urlPath.slice(base.length) || '/';
      let filePath = resolve(join(root, urlPath));

      if (!filePath.startsWith(root)) {
        response.writeHead(403).end();

        return;
      }

      if ((await stat(filePath).catch(() => null))?.isDirectory()) {
        filePath = join(filePath, 'index.html');
      }

      const body = await readFile(filePath).catch(() => null);

      if (!body) {
        response.writeHead(404).end();

        return;
      }

      response.writeHead(200, { 'Content-Type': MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream' });
      response.end(body);
    })();
  });

  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const address = server.address();

  if (address === null || typeof address === 'string') {
    throw new Error('The static server has no port.');
  }

  return { server, origin: `http://127.0.0.1:${address.port}` };
};

// --- Check harness ------------------------------------------------------------

interface CheckResult {
  name: string;
  error: string | null;
}

const results: CheckResult[] = [];

const check = async (name: string, run: () => Promise<void>): Promise<void> => {
  if (options.only && !name.toLowerCase().includes(options.only.toLowerCase())) {
    return;
  }

  const started = performance.now();

  try {
    await run();
    results.push({ name, error: null });
    console.log(`[e2e] PASS ${name} (${Math.round(performance.now() - started)} ms)`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    results.push({ name, error: message });
    console.error(`[e2e] FAIL ${name}: ${message}`);
  }
};

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const waitFor = async <T>(read: () => Promise<T>, accept: (value: T) => boolean, what: string, timeoutMs = 15_000): Promise<T> => {
  const deadline = Date.now() + timeoutMs;
  let last: T = await read();

  while (!accept(last)) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${what}; last value: ${JSON.stringify(last)?.slice(0, 300)}`);
    }

    await new Promise(done => setTimeout(done, 100));
    last = await read();
  }

  return last;
};

// --- Page helpers ---------------------------------------------------------------

interface Session {
  page: Page;
  /** Console messages of every realm, as Playwright saw them: DevTools' view. */
  console: Array<{ type: string; text: string }>;
  pageErrors: string[];
}

const openPlayground = async (
  browser: Browser,
  origin: string,
  base: string,
  example: string,
  viewport = { width: 1600, height: 1000 },
): Promise<Session> => {
  const context = await browser.newContext({
    viewport,
    hasTouch: example === 'input/multitouch',
    ...(options.browser === 'chromium' ? { permissions: ['clipboard-read', 'clipboard-write'] } : {}),
  });
  const page = await context.newPage();
  const session: Session = { page, console: [], pageErrors: [] };

  page.on('console', message => session.console.push({ type: message.type(), text: message.text() }));
  page.on('pageerror', error => session.pageErrors.push(error.message));
  await context.addInitScript({ content: "try { localStorage.setItem('exo-playground-layout', 'split'); } catch {}" });
  await page.goto(`${origin}${base}/en/playground/?example=${encodeURIComponent(example)}`, { waitUntil: 'domcontentloaded' });
  await previewFrame(page);

  return session;
};

const previewFrame = async (page: Page): Promise<Frame> =>
  waitFor(
    async () => page.frames().find(frame => frame !== page.mainFrame() && frame.url().includes('preview.html')) ?? null,
    frame => frame !== null,
    'the preview iframe',
  ) as Promise<Frame>;

const outputEntries = async (page: Page): Promise<Array<{ severity: string; kind: string; text: string; details: string }>> =>
  page.$$eval('[aria-label="Preview output"] li[data-severity]', items =>
    items.map(item => ({
      severity: item.getAttribute('data-severity') ?? '',
      kind: item.getAttribute('data-kind') ?? '',
      text: item.querySelector('[class*="text"]')?.textContent ?? '',
      details: item.querySelector('pre')?.textContent ?? '',
    })),
  );

const outputToggle = (page: Page) => page.locator('[aria-label="Preview output"] button[aria-expanded]');

const outputOpen = async (page: Page): Promise<boolean> => (await outputToggle(page).getAttribute('aria-expanded')) === 'true';

const setOutputOpen = async (page: Page, open: boolean): Promise<void> => {
  if ((await outputOpen(page)) !== open) {
    await outputToggle(page).click();
  }
};

/** Replaces the editor's source and reloads the preview, the way a visitor runs their own code. */
const runSource = async (page: Page, source: string): Promise<void> => {
  const previousUrl = (await previewFrame(page)).url();
  await waitFor(
    () =>
      page.evaluate('Boolean(window.monaco && window.monaco.editor.getEditors()[0] && window.monaco.editor.getEditors()[0].getModel())'),
    ready => ready === true,
    'the editor model',
  );
  await page.evaluate(
    `(() => {
      // The editor's own model; the other models are type libraries and scratch buffers.
      window.monaco.editor.getEditors()[0].getModel().setValue(${JSON.stringify(source)});
    })()`,
  );
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await waitFor(
    async () => (await previewFrame(page)).url(),
    url => url !== previousUrl,
    'the reloaded iframe generation',
  );
};

const box = async (page: Page, selector: string): Promise<{ x: number; y: number; width: number; height: number }> => {
  const rect = await page.locator(selector).first().boundingBox();

  assert(rect, `${selector} has no layout box`);

  return rect;
};

// --- Console bridge -------------------------------------------------------------

const CONSOLE_SOURCE = `
const marker = Math.random().toString(36).slice(2, 8);
const circular: Record<string, unknown> = { name: 'loop' };
circular.self = circular;

console.log('log', marker, 1, { list: [1, 2] });
console.info('info', marker);
console.debug('debug', marker);
console.warn('warn', marker);
console.error('error', marker, new Error('logged failure'));
console.log('circular', circular);

for (let index = 0; index < 1500; index += 1) {
  console.log('flood', index);
}

let tick = 0;
setInterval(() => console.log('tick', marker, tick++), 60);
setTimeout(() => void Promise.reject(new Error('first rejection ' + marker)), 400);
setTimeout(() => void Promise.reject(new Error('second rejection ' + marker)), 1600);
`;

const consoleChecks = async (browser: Browser, origin: string, base: string): Promise<void> => {
  const session = await openPlayground(browser, origin, base, 'getting-started/hello-world');
  const { page } = session;
  let marker = '';

  await check('output panel is collapsed by default and plain logs keep it closed', async () => {
    await page.evaluate("localStorage.removeItem('exo-playground-output-open')");
    await page.reload({ waitUntil: 'domcontentloaded' });
    await previewFrame(page);
    assert((await outputToggle(page).count()) === 0 || !(await outputOpen(page)), 'empty output opened without a failure');
    await runSource(page, "console.log('plain preview log');");
    await waitFor(
      () => outputToggle(page).count(),
      count => count === 1,
      'the Output toggle',
    );
    assert(!(await outputOpen(page)), 'the Output panel opened without a failure');
  });

  await check('console bridge captures every severity and keeps DevTools output', async () => {
    session.console.length = 0;
    await runSource(page, CONSOLE_SOURCE);
    // The first rejection opens the panel on its own.
    await waitFor(
      () => outputOpen(page),
      open => open,
      'the panel to open on the uncaught rejection',
    );

    const entries = await outputEntries(page);
    const logEntry = entries.find(entry => entry.text.startsWith('log '));

    assert(logEntry, `no log entry in ${JSON.stringify(entries.slice(0, 5))}`);
    marker = logEntry.text.split(' ')[1]!;
    assert(logEntry.text === `log ${marker} 1 {list: [1, 2]}`, `log formatted as ${logEntry.text}`);

    for (const severity of ['info', 'debug', 'warn', 'error'] as const) {
      const entry = entries.find(candidate => candidate.text.startsWith(`${severity} ${marker}`));

      assert(entry?.severity === severity, `${severity} was recorded as ${entry?.severity}`);
    }

    const error = entries.find(entry => entry.text.startsWith(`error ${marker}`))!;

    assert(error.text.endsWith('Error: logged failure'), `error text: ${error.text}`);
    assert(error.details.includes('logged failure'), 'the error stack is missing from the details');
    assert(
      entries.some(entry => entry.text === 'circular {name: "loop", self: [Circular]}'),
      'the circular object was not described',
    );

    for (const type of ['log', 'info', 'debug', 'warning', 'error']) {
      assert(
        session.console.some(message => message.type === type && message.text.includes(marker)),
        `DevTools did not receive the ${type} message`,
      );
    }
  });

  await check('console bridge bounds a flood and counts what it dropped', async () => {
    const entries = await outputEntries(page);
    const floods = entries.filter(entry => entry.text.startsWith('flood '));
    const dropped = entries.find(entry => entry.kind === 'suppressed');

    assert(floods.length < 200, `${floods.length} flood entries recorded`);
    assert(dropped && /^\d+ messages dropped/.test(dropped.text), `no dropped-messages entry: ${JSON.stringify(dropped)}`);
    assert(entries.length <= 501, `${entries.length} entries exceed the ring buffer`);
    assert(
      session.console.filter(message => message.text.startsWith('flood ')).length === 1500,
      'DevTools did not receive every flood message',
    );
  });

  await check('an unhandled rejection is recorded once, as uncaught', async () => {
    const entries = await outputEntries(page);
    const rejections = entries.filter(entry => entry.text.includes(`first rejection ${marker}`));

    assert(rejections.length === 1, `${rejections.length} entries for one rejection`);
    assert(rejections[0]!.kind === 'exception', `the rejection was recorded as ${rejections[0]!.kind}`);

    const badge = await page.locator('[aria-label="Preview output"] [class*="badge--error"]').textContent();

    assert(badge?.startsWith('2 errors'), `error badge reads ${badge}`);
  });

  await check('a collapse holds for the rest of the run', async () => {
    await outputToggle(page).click();
    assert(!(await outputOpen(page)), 'the panel did not collapse');
    await waitFor(
      () => page.locator('[aria-label="Preview output"] [class*="badge--error"]').textContent(),
      text => text?.startsWith('3 errors') ?? false,
      'the second rejection',
    );
    assert(!(await outputOpen(page)), 'the second rejection reopened a panel the visitor collapsed');
  });

  await check('a reload starts a fresh record with nothing from the earlier preview', async () => {
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await setOutputOpen(page, true);

    const fresh = await waitFor(
      () => outputEntries(page),
      entries => entries.some(entry => entry.text.startsWith('log ') && !entry.text.includes(marker)),
      'the reloaded preview to log',
    );
    const nextMarker = fresh.find(entry => entry.text.startsWith('log '))!.text.split(' ')[1]!;

    await page.waitForTimeout(800);

    const entries = await outputEntries(page);
    const stale = entries.filter(entry => entry.text.includes(marker));

    assert(nextMarker !== marker, 'the marker did not change across the reload');
    assert(stale.length === 0, `entries of the earlier preview survived: ${JSON.stringify(stale.slice(0, 3))}`);
    assert(entries.filter(entry => entry.text.startsWith(`log ${nextMarker}`)).length === 1, 'the reloaded preview logged twice');
  });

  await check('logging never moves focus out of the preview', async () => {
    const frame = await box(page, '[data-preview-surface] iframe');

    await page.mouse.click(frame.x + frame.width / 2, frame.y + frame.height / 2);
    await page.waitForTimeout(700);

    const focused = await page.evaluate('document.activeElement && document.activeElement.tagName');

    assert(focused === 'IFRAME', `focus moved to ${String(focused)}`);
  });

  await check('the Output panel works from the keyboard', async () => {
    await setOutputOpen(page, false);
    await outputToggle(page).focus();
    await page.keyboard.press('Enter');
    assert(await outputOpen(page), 'Enter did not expand the panel');

    const errors = page.locator('[aria-label="Preview output"] button[data-filter="error"]');

    await errors.focus();
    await page.keyboard.press('Space');
    assert((await errors.getAttribute('aria-pressed')) === 'false', 'Space did not toggle the Errors filter');
    assert(!(await outputEntries(page)).some(entry => entry.severity === 'error'), 'error entries stayed visible behind the filter');
    await page.keyboard.press('Space');
    await outputToggle(page).focus();
    await page.keyboard.press('Space');
    assert(!(await outputOpen(page)), 'Space did not collapse the panel');
  });

  await check('Clear empties the list without stopping capture', async () => {
    await setOutputOpen(page, true);
    await page.locator('[aria-label="Preview output"] button', { hasText: 'Clear' }).click();
    await waitFor(
      () => outputEntries(page),
      entries => entries.length > 0 && entries.every(entry => entry.text.startsWith('tick ')),
      'ticks after the clear',
    );
  });

  await check('the panel sits under the preview in the split layout and follows a swap', async () => {
    const preview = await box(page, 'section[aria-label="Example preview"]');
    const output = await box(page, '[aria-label="Preview output"]');
    const editor = await box(page, 'section[aria-label="Source editor"]');

    assert(output.y >= preview.y + preview.height - 1, 'the panel overlaps the preview');
    assert(Math.abs(output.x - preview.x) < 2, 'the panel is not in the preview column');
    assert(editor.x > preview.x, 'the editor is not to the right of the preview');

    await page.locator('[data-example-header] summary').click();
    await page.getByRole('button', { name: 'Swap panes', exact: true }).click();

    const swappedPreview = await box(page, 'section[aria-label="Example preview"]');
    const swappedOutput = await box(page, '[aria-label="Preview output"]');

    assert(swappedPreview.x > preview.x, 'the swap did not move the preview');
    assert(Math.abs(swappedOutput.x - swappedPreview.x) < 2, 'the panel did not follow the preview');
    assert(swappedOutput.y >= swappedPreview.y + swappedPreview.height - 1, 'the panel overlaps the swapped preview');
    await page.locator('[data-example-header] summary').click();
    await page.getByRole('button', { name: 'Swap panes', exact: true }).click();
  });

  await check('the panel sits between preview and editor in the stacked layout', async () => {
    await page.locator('[data-example-header] summary').click();
    await page.getByRole('button', { name: 'Demo above code', exact: true }).click();

    const preview = await box(page, 'section[aria-label="Example preview"]');
    const output = await box(page, '[aria-label="Preview output"]');
    const editor = await box(page, 'section[aria-label="Source editor"]');

    assert(output.y >= preview.y + preview.height - 1, 'the panel overlaps the preview');
    assert(editor.y >= output.y + output.height - 1, 'the editor is not below the panel');
    await page.locator('[data-example-header] summary').click();
    await page.getByRole('button', { name: 'Split view', exact: true }).click();
  });

  await page.context().close();

  await check('an input example explains itself in the Output panel', async () => {
    const keyboard = await openPlayground(browser, origin, base, 'input/keyboard');
    const frame = await previewFrame(keyboard.page);
    const canvas = frame.locator('canvas');

    await canvas.waitFor();
    await canvas.click();
    await keyboard.page.keyboard.press('Space');
    await keyboard.page.keyboard.down('ArrowLeft');
    await keyboard.page.waitForTimeout(300);
    await keyboard.page.keyboard.up('ArrowLeft');
    await setOutputOpen(keyboard.page, true);

    const texts = await waitFor(
      async () => (await outputEntries(keyboard.page)).map(entry => entry.text),
      entries => entries.includes('KeyDown: Space') && entries.includes('Held: Left') && entries.includes('Held: none'),
      'the keyboard example to log',
    );

    assert(texts.filter(text => text === 'Held: Left').length === 1, `the held state was logged per frame: ${texts.join(' | ')}`);
    await keyboard.page.context().close();
  });

  await check('the panel stays usable at phone width', async () => {
    const phone = await openPlayground(browser, origin, base, 'getting-started/hello-world', { width: 390, height: 844 });
    await runSource(phone.page, "console.log('phone output');");
    await outputToggle(phone.page).waitFor({ state: 'visible' });
    const preview = await box(phone.page, 'section[aria-label="Example preview"]');
    const output = await box(phone.page, '[aria-label="Preview output"]');
    const scrollWidth = await phone.page.evaluate('document.documentElement.scrollWidth');

    assert(output.y >= preview.y + preview.height - 1, 'the panel overlaps the preview');
    assert(output.width <= 390 && output.width > 300, `the panel is ${output.width}px wide`);
    assert(Number(scrollWidth) <= 390, `the page scrolls sideways (${String(scrollWidth)}px)`);
    await setOutputOpen(phone.page, true);
    assert(await outputOpen(phone.page), 'the panel did not open');
    await phone.page.context().close();
  });
};

// --- Asset Browser --------------------------------------------------------------

interface CatalogEntry {
  key: string;
  type: string;
  category: string;
}

const readCatalog = (): CatalogEntry[] => {
  const catalog = JSON.parse(readFileSync(resolve(repoRoot, 'packages', 'exojs-demo-assets', 'manifest.json'), 'utf8')) as {
    entries: Array<CatalogEntry & { profile: string }>;
  };

  return catalog.entries.filter(entry => entry.profile === 'standard');
};

/** One asset of every preview kind, by the id the browser lists it under. */
const REPRESENTATIVES = [
  'ship',
  'iconPlay',
  'platformerCharacters',
  'keyboardMouseInputPrompts',
  'harborPlazaMap',
  'isometricLandscape',
  'harborWorldProject',
  'soundUiClick',
  'uiSoundSprite',
  'musicLofiRhodes',
  'videoHighFps',
  'fontKenneyFuture',
  'fontKenneyBlocksFnt',
];

const openAssetBrowser = async (browser: Browser, origin: string, base: string): Promise<Session> => {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    ...(options.browser === 'chromium' ? { permissions: ['clipboard-read', 'clipboard-write'] } : {}),
  });
  const page = await context.newPage();
  const session: Session = { page, console: [], pageErrors: [] };

  page.on('console', message => session.console.push({ type: message.type(), text: message.text() }));
  page.on('pageerror', error => session.pageErrors.push(error.message));
  await page.route('**/examples/debug-layer/asset-browser.js*', async route => {
    const response = await route.fetch();
    const source = await response.text();
    const hook = 'init() {';

    assert(source.includes(hook), 'the Asset Browser scene has no init hook');
    await route.fulfill({
      response,
      body: source.replace(
        hook,
        `${hook} globalThis.__assetBrowserApp = this.app; globalThis.__assetBrowserScene = this; globalThis.__assetBrowserArea = PREVIEW;`,
      ),
    });
  });
  await page.goto(`${origin}${base}/en/tools/asset-browser/?asset=ship`, { waitUntil: 'domcontentloaded' });
  const frame = await assetFrame(page);

  await frame.waitForFunction('globalThis.__assetBrowserApp?.state === "running" && globalThis.__assetBrowserScene.preview');
  assert((await page.locator('.monaco-editor').count()) === 0, 'the tool unexpectedly mounted an editor');

  return session;
};

const setAssetSlider = async (frame: Frame, label: string, value: number): Promise<void> => {
  const input = frame.getByRole('slider', { name: label, exact: true });
  const min = Number(await input.getAttribute('min'));
  const step = Number(await input.getAttribute('step'));

  await input.press('Home');

  for (let index = 0; index < Math.round((value - min) / step); index++) {
    await input.press('ArrowRight');
  }

  assert(Number(await input.inputValue()) === value, `${label} did not reach ${value}`);
};

const assetFrame = async (page: Page): Promise<Frame> => {
  const frame = await previewFrame(page);

  await waitFor(
    () => frame.locator('nav[aria-label="Demo assets"] button[data-asset]').count(),
    count => count > 0,
    'the asset list',
  );

  return frame;
};

/** Selects through the search box, so it works for an asset in any group. */
const selectAsset = async (frame: Frame, id: string, options: { trusted?: boolean } = {}): Promise<void> => {
  const search = frame.locator('nav[aria-label="Demo assets"] input[type="search"]');

  if (options.trusted === false) {
    await frame.evaluate(
      `(() => {
        const search = document.querySelector('nav[aria-label="Demo assets"] input[type="search"]');
        search.value = ${JSON.stringify(id)};
        search.dispatchEvent(new Event('input'));
        document.querySelector('button[data-asset="${id}"]').click();
      })()`,
    );

    return;
  }

  await search.fill(id);
  await frame.locator(`button[data-asset="${id}"]`).click();
};

const inspectorHeading = (frame: Frame): Promise<string> => frame.locator('aside[aria-label="Selected asset"] h2').innerText();

const residentRows = async (frame: Frame): Promise<string[]> =>
  frame.$$eval('aside[aria-label="Selected asset"] details li', items => items.map(item => item.textContent ?? ''));

const assetChecks = async (browser: Browser, origin: string, base: string): Promise<string[]> => {
  const snippets: string[] = [];
  const session = await openAssetBrowser(browser, origin, base);
  const { page } = session;
  const frame = await assetFrame(page);
  const catalog = readCatalog();

  await check('asset browser lists the catalog by type', async () => {
    const tabs = await frame.$$eval('nav[aria-label="Demo assets"] [role="group"] button', buttons =>
      buttons.map(button => button.textContent ?? ''),
    );
    const total = tabs.reduce((sum, tab) => sum + Number(tab.split(' ').pop()), 0);
    const atlases = catalog.filter(
      entry => entry.key.endsWith('Atlas') && catalog.some(other => other.key === entry.key.replace(/Atlas$/, 'Image')),
    ).length;

    assert(
      tabs.map(tab => tab.replace(/ \d+$/, '')).join(',') === 'Textures,Spritesheets,Maps,Audio,Video,Fonts',
      `groups: ${tabs.join(', ')}`,
    );
    assert(total === catalog.length - atlases, `the groups list ${total} assets, the catalog has ${catalog.length - atlases}`);
    assert(!tabs.some(tab => tab.startsWith('Meshes')), 'a Meshes group appeared without mesh assets');
  });

  for (const id of REPRESENTATIVES) {
    await check(`asset browser previews ${id}`, async () => {
      const before = session.console.length;

      await selectAsset(frame, id);
      await waitFor(
        async () => session.console.slice(before).map(message => message.text),
        texts => texts.some(text => text.startsWith('Loaded ') || text.startsWith('Failed to load')),
        `${id} to load`,
        30_000,
      );

      const failure = session.console.slice(before).find(message => message.text.startsWith('Failed to load'));

      assert(!failure, failure?.text ?? '');
      const health = (await frame.evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
        const app = globalThis.__assetBrowserApp;
        resolve({state: app.state, errors: app.recentErrors.map(error => error.message)});
      })))`)) as { state: string; errors: string[] };

      assert(health.state === 'running' && health.errors.length === 0, `${id} render health: ${JSON.stringify(health)}`);
      assert(session.pageErrors.length === 0, `page errors: ${session.pageErrors.join(' | ')}`);

      const resident = await residentRows(frame);

      assert(resident.length >= 2 && resident.length <= 12, `the loader holds ${resident.length} assets: ${resident.join(', ')}`);

      await frame.getByRole('button', { name: 'Code', exact: true }).click();

      const code = await frame.locator('section[aria-label="Code"] pre').innerText();

      assert(code.includes(`assets.${id}`), `the snippet does not reference assets.${id}: ${code.slice(0, 200)}`);
      snippets.push(`// ${id}\n${code}`);
      await frame.getByRole('button', { name: 'Close', exact: true }).click();

      if (options.shots) {
        await mkdir(options.shots, { recursive: true });
        await page.locator('section[aria-label="Asset Browser"]').screenshot({ path: join(options.shots, `${id}.png`) });
      }
    });
  }

  await check('asset browser: spritesheet frame selection and animation settings reach the snippet', async () => {
    await selectAsset(frame, 'platformerCharacters');
    await waitFor(
      () => inspectorHeading(frame),
      text => text === 'Platformer characters',
      'the spritesheet',
    );
    // The panel mounts once the atlas has loaded; a tap before that has nothing to hit.
    await frame.getByRole('slider', { name: 'FPS' }).waitFor();

    const atlas = JSON.parse(readFileSync(resolve(repoRoot, 'examples/assets/images/platformer-characters-atlas.json'), 'utf8')) as {
      frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
    };
    const selected = Object.values(atlas.frames)[1]!.frame;
    const point = await frame.evaluate<{ x: number; y: number; width: number; height: number }>(`(() => {
      const app = globalThis.__assetBrowserApp;
      const view = globalThis.__assetBrowserScene.view;
      return {...view.worldToScreen(${selected.x + selected.w / 2}, ${selected.y + selected.h / 2}, app.width, app.height), width: app.width, height: app.height};
    })()`);
    const canvas = frame.locator('canvas');
    const rect = await canvas.boundingBox();

    assert(rect, 'the canvas has no box');
    const before = session.console.length;

    await canvas.click({ position: { x: (point.x * rect.width) / point.width, y: (point.y * rect.height) / point.height } });
    await waitFor(
      async () => session.console.slice(before).map(message => message.text),
      texts => texts.some(text => text.startsWith('Frame 2:')),
      'the selected atlas frame',
    );
    await setAssetSlider(frame, 'FPS', 14);
    await setAssetSlider(frame, 'Last frame', 3);
    await frame.getByRole('button', { name: 'Code', exact: true }).click();

    const code = await frame.locator('section[aria-label="Code"] pre').innerText();

    assert(code.includes('fps: 14'), 'the FPS setting is not in the snippet');
    assert((code.match(/"character_[a-z_]+"/g) ?? []).length === 4, `the frame range is not in the snippet: ${code}`);
    snippets.push(`// spritesheet settings\n${code}`);
    await frame.getByRole('button', { name: 'Close', exact: true }).click();
  });

  await check('asset browser: texture filtering and zoom reach the snippet', async () => {
    await selectAsset(frame, 'ship');
    await waitFor(
      () => inspectorHeading(frame),
      text => text === 'Ship',
      'the texture',
    );
    const viewport = await frame.evaluate<{ x: number; y: number; width: number; height: number }>('({...globalThis.__assetBrowserArea})');
    const appSize = await frame.evaluate<{ width: number; height: number }>(
      '({width:globalThis.__assetBrowserApp.width,height:globalThis.__assetBrowserApp.height})',
    );
    const canvas = frame.locator('canvas');
    const canvasBox = (await canvas.boundingBox())!;
    const point = { x: viewport.x + viewport.width * 0.6, y: viewport.height * 0.4 };
    const screen = {
      x: canvasBox.x + (point.x * canvasBox.width) / appSize.width,
      y: canvasBox.y + (point.y * canvasBox.height) / appSize.height,
    };
    const worldAtCursor = (): Promise<{ x: number; y: number }> =>
      frame.evaluate(`(() => {
      const app = globalThis.__assetBrowserApp;
      return globalThis.__assetBrowserScene.view.screenToWorld(${point.x},${point.y},app.width,app.height);
    })()`);

    assert((await frame.getByRole('slider', { name: 'Zoom', exact: true }).count()) === 0, 'a removed zoom slider is still present');
    await frame.getByRole('button', { name: '1:1', exact: true }).click();
    const one = await frame.evaluate<number>(`(() => {
      const app = globalThis.__assetBrowserApp;
      return globalThis.__assetBrowserScene.view.zoomLevel * app.canvas.getBoundingClientRect().width / app.width;
    })()`);

    assert(Math.abs(one - 1) < 0.001, `1:1 renders a source pixel at ${one} CSS pixels`);
    await page.mouse.move(screen.x, screen.y);
    await frame.waitForFunction(point => {
      const current = (
        globalThis as unknown as { __assetBrowserApp: { input: { getPrimaryPointerPosition(): { x: number; y: number } | null } } }
      ).__assetBrowserApp.input.getPrimaryPointerPosition();

      return current && Math.hypot(current.x - point.x, current.y - point.y) < 2;
    }, point);
    const before = await worldAtCursor();
    const oldZoom = await frame.evaluate<number>('globalThis.__assetBrowserScene.view.zoomLevel');

    await page.mouse.wheel(0, -180);
    const zoom = await waitFor(
      () => frame.evaluate<number>('globalThis.__assetBrowserScene.view.zoomLevel'),
      value => value > oldZoom,
      'cursor zoom',
    );
    const after = await worldAtCursor();

    assert(Math.hypot(before.x - after.x, before.y - after.y) < 0.001, 'wheel zoom moved the world point under the cursor');
    await frame.getByRole('button', { name: 'Next Filtering', exact: true }).click();
    await frame.getByRole('button', { name: 'Code', exact: true }).click();

    const code = await frame.locator('section[aria-label="Code"] pre').innerText();

    assert(code.includes('ScaleModes.Nearest') && code.includes(`setScale(${Number(zoom.toFixed(2))})`), `snippet: ${code}`);
    snippets.push(`// texture settings\n${code}`);
    await frame.getByRole('button', { name: 'Close', exact: true }).click();
    const center = await frame.evaluate<{ x: number; y: number }>(
      '({x:globalThis.__assetBrowserScene.view.center.x,y:globalThis.__assetBrowserScene.view.center.y})',
    );

    await page.mouse.move(screen.x, screen.y);
    await page.mouse.down();
    await page.mouse.move(screen.x + 90, screen.y + 40, { steps: 12 });
    await page.mouse.up();
    await waitFor(
      () => frame.evaluate<number>('globalThis.__assetBrowserScene.view.center.x'),
      value => Math.abs(value - center.x) > 0.01,
      'drag pan',
    );
    await frame.getByRole('button', { name: 'Fit', exact: true }).click();
    const fitted = await frame.evaluate<{ left: number; top: number; right: number; bottom: number }>(`(() => {
      const app = globalThis.__assetBrowserApp, scene = globalThis.__assetBrowserScene, bounds = scene.preview.bounds;
      const top = scene.view.worldToScreen(0,0,app.width,app.height), bottom = scene.view.worldToScreen(bounds.width,bounds.height,app.width,app.height);
      return {left:top.x,top:top.y,right:bottom.x,bottom:bottom.y};
    })()`);

    assert(
      fitted.left >= viewport.x && fitted.right <= viewport.x + viewport.width && fitted.top >= 0 && fitted.bottom <= viewport.height,
      `Fit bounds: ${JSON.stringify(fitted)}`,
    );
  });

  await check('asset browser: a late load never surfaces after a newer selection', async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>(done => (release = done));
    let requested = false;

    await page.route('**/video/high-res.mp4*', async route => {
      requested = true;
      await held;
      await route.continue().catch(() => undefined);
    });

    try {
      const before = session.console.length;

      await selectAsset(frame, 'videoHighRes');
      await waitFor(
        () => Promise.resolve(requested),
        value => value,
        'the held high-res video request',
      );
      await selectAsset(frame, 'ship');
      await waitFor(
        () => inspectorHeading(frame),
        text => text === 'Ship',
        'the newer selection',
      );
      release();
      await page.waitForTimeout(2500);

      const texts = session.console.slice(before).map(message => message.text);

      assert(!texts.some(text => text.includes('High res')), `the late video surfaced: ${texts.join(' | ')}`);
      assert((await inspectorHeading(frame)) === 'Ship', 'the inspector shows the late selection');
      assert(!(await residentRows(frame)).some(row => row.includes('high-res')), 'the late video stayed resident');
    } finally {
      release();
      await page.unroute('**/video/high-res.mp4*');
    }
  });

  await check('asset browser: many quick switches leave only the current selection resident', async () => {
    for (const id of [...REPRESENTATIVES, ...REPRESENTATIVES.slice().reverse()]) {
      await selectAsset(frame, id, { trusted: false });
    }

    await selectAsset(frame, 'ship');
    await waitFor(
      () => inspectorHeading(frame),
      text => text === 'Ship',
      'the final selection',
    );
    await page.waitForTimeout(1500);
    await selectAsset(frame, 'iconPlay');
    await waitFor(
      async () => (await residentRows(frame)).join(','),
      rows => rows.includes('play.svg'),
      'the last preview',
    );

    const rows = await residentRows(frame);

    assert(rows.length === 2, `the loader holds ${rows.length} assets: ${rows.join(', ')}`);
    assert(
      rows.some(row => row.startsWith('manifest.json')),
      'the manifest is missing',
    );
    assert(session.pageErrors.length === 0, `a switch raised an uncaught error: ${session.pageErrors.join(' | ')}`);
  });

  await check('asset browser: a double press of Play starts one voice and Stop stays harmless', async () => {
    await selectAsset(frame, 'musicLofiRhodes');
    await waitFor(
      () => inspectorHeading(frame),
      text => text === 'Lofi rhodes',
      'the music',
    );

    const before = session.console.length;
    const transport = frame.getByRole('group', { name: 'Preview controls' });
    const play = transport.getByRole('button', { name: 'Play', exact: true });

    await play.dblclick();
    await waitFor(
      () => frame.evaluate<number>('[...globalThis.__assetBrowserApp.audio._voices].filter(voice=>!voice.ended).length'),
      count => count === 1,
      'one active preview voice',
    );
    await page.waitForTimeout(600);
    await transport.getByRole('button', { name: 'Stop', exact: true }).click();
    await transport.getByRole('button', { name: 'Stop', exact: true }).click();

    const played = session.console.slice(before).filter(message => message.text.startsWith('Playing'));

    assert(played.length === 1, `${played.length} voices started`);
    await selectAsset(frame, 'ship');
  });

  await check('asset browser: leaving the tool while a load is in flight raises nothing', async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>(done => (release = done));
    let requested = false;

    await page.route('**/video/high-fps.webm*', async route => {
      requested = true;
      await held;
      await route.continue().catch(() => undefined);
    });

    try {
      await selectAsset(frame, 'videoHighFps');
      await waitFor(
        () => Promise.resolve(requested),
        value => value,
        'the held high-fps video request',
      );

      const errorsBefore = session.pageErrors.length;

      await page.locator('nav[aria-label="Playground tools"]').getByRole('link', { name: 'Playground', exact: true }).click();
      await waitFor(
        () => Promise.resolve(page.url()),
        url => new URL(url).pathname.endsWith('/en/playground/'),
        'navigation away from the tool',
      );
      release();
      await page.waitForTimeout(2000);
      assert(session.pageErrors.length === errorsBefore, `errors: ${session.pageErrors.slice(errorsBefore).join(' | ')}`);
      const nextFrame = await previewFrame(page);
      assert(!(await nextFrame.locator('body').getAttribute('data-preview-blanked')), 'an uncaught error blanked the new preview');
    } finally {
      release();
      await page.unroute('**/video/high-fps.webm*');
    }
  });

  await page.context().close();

  await check('asset browser: playback waiting for the audio unlock is cancelled by a switch', async () => {
    // A fresh page: no real gesture has happened yet, so audio is still locked
    // and every interaction below until the final click is a synthetic one.
    const locked = await openAssetBrowser(browser, origin, base);
    const lockedFrame = await assetFrame(locked.page);
    const clickPlay = `[...document.querySelectorAll('[aria-label="Preview controls"] button')].find(button => button.textContent === 'Play').click()`;

    await selectAsset(lockedFrame, 'soundUiClick', { trusted: false });
    await lockedFrame.getByRole('button', { name: 'Play', exact: true }).waitFor();
    await lockedFrame.evaluate(clickPlay);
    await waitFor(
      () => lockedFrame.locator('aside[aria-label="Selected asset"]').innerText(),
      text => text.includes('Waiting for the browser to allow audio'),
      'the locked state',
    );
    await selectAsset(lockedFrame, 'ship', { trusted: false });
    await waitFor(
      () => inspectorHeading(lockedFrame),
      text => text === 'Ship',
      'the switch',
    );

    // A real click: the gesture the browser unlocks audio for.
    const canvas = lockedFrame.locator('canvas');
    const rect = (await canvas.boundingBox())!;

    await canvas.click({ position: { x: (610 * rect.width) / 1280, y: rect.height / 2 } });
    await locked.page.waitForTimeout(800);
    assert(!locked.console.some(message => message.text.startsWith('Playing')), 'a cancelled start played after the unlock');

    // The same path without the switch does start once audio is allowed.
    await selectAsset(lockedFrame, 'soundUiClick', { trusted: false });
    await lockedFrame.getByRole('button', { name: 'Play', exact: true }).waitFor();
    await lockedFrame.evaluate(clickPlay);
    await waitFor(
      async () => locked.console.filter(message => message.text.startsWith('Playing')).length,
      count => count === 1,
      'the uncancelled start',
    );
    await locked.page.context().close();
  });

  return snippets;
};

/** Type-checks every generated snippet as its own module against the engine sources. */
const typecheckSnippets = async (snippets: string[]): Promise<void> => {
  await check(`asset browser generated snippets type-check (${snippets.length})`, async () => {
    assert(snippets.length > 0, 'no snippets were collected');
    await rm(snippetDir, { recursive: true, force: true });
    await mkdir(snippetDir, { recursive: true });

    const files = await Promise.all(
      snippets.map(async (snippet, index) => {
        const file = join(snippetDir, `snippet-${String(index).padStart(2, '0')}.ts`);

        await writeFile(file, snippet);

        return file;
      }),
    );
    const config = ts.getParsedCommandLineOfConfigFile(
      resolve(repoRoot, 'tsconfig.examples.json'),
      {},
      {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic: diagnostic => {
          throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
        },
      },
    );

    assert(config, 'tsconfig.examples.json did not parse');

    const program = ts.createProgram(files, { ...config.options, noEmit: true });
    const diagnostics = ts
      .getPreEmitDiagnostics(program)
      .filter(diagnostic => diagnostic.file && files.includes(resolve(diagnostic.file.fileName)));

    assert(
      diagnostics.length === 0,
      diagnostics
        .slice(0, 8)
        .map(diagnostic => `${diagnostic.file!.fileName}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`)
        .join('\n'),
    );
  });
};

const exampleLifecycleChecks = async (browser: Browser, origin: string, base: string): Promise<void> => {
  const examples = [
    'input/mouse-and-pointer',
    'input/key-rebinding',
    'input/multitouch',
    'showcase/dialog-system',
    'sprites-textures/blendmodes',
    'showcase/screen-shake-on-explosion',
    'sprites-textures/video-drawable',
    'audio-basics/play-sound',
    'audio-basics/sound-pool',
    'showcase/audio-visualisation',
    'pathfinding/grid-navigation',
    'audio-fx/ducking',
    'text-fonts/typographic-styling',
  ];

  for (const example of examples) {
    await check(`acceptance lifecycle: ${example}`, async () => {
      const session = await openPlayground(browser, origin, base, example);
      const { page, pageErrors } = session;
      let phase = 'compile and start';

      try {
        const source = await readFile(resolve(repoRoot, 'examples', `${example}.ts`), 'utf8');
        await runSource(page, `${source}\n(globalThis as any).__acceptanceApp = app;`);
        const frame = await previewFrame(page);
        await frame.waitForFunction('globalThis.__acceptanceApp?.state === "running"');
        const counts = () =>
          frame.evaluate(`Object.fromEntries(
          ['onPointerMove', 'onPointerDown', 'onPointerUp', 'onPointerTap', 'onPointerCancel', 'onKeyDown']
            .map(key => [key, globalThis.__acceptanceApp.input[key].count]))`);
        const baseline = JSON.stringify(await counts());
        const countPanels = () =>
          frame.evaluate<number>(`document.querySelectorAll('body > aside').length +
          (globalThis.__acceptanceApp.scenes.currentScene._peekUI()?.children.length ?? 0)`);
        const panels = await countPanels();

        if (
          [
            'input/mouse-and-pointer',
            'input/key-rebinding',
            'input/multitouch',
            'sprites-textures/blendmodes',
            'sprites-textures/video-drawable',
            'pathfinding/grid-navigation',
          ].includes(example)
        ) {
          assert(panels > 0, `${example}: expected controls were absent`);
        }

        for (let cycle = 0; cycle < 2; cycle++) {
          phase = `restart ${cycle + 1}`;
          await frame.evaluate(`(() => {
            const app = globalThis.__acceptanceApp;
            globalThis.__acceptanceScene = app.scenes.currentScene.constructor;
            app.stop();
          })()`);
          await frame.waitForFunction('globalThis.__acceptanceApp.scenes.currentScene === null');
          await frame.evaluate('globalThis.__acceptanceApp.start(globalThis.__acceptanceScene)');
          assert(JSON.stringify(await counts()) === baseline, `${example}: input listeners grew after restart ${cycle + 1}`);
          assert((await countPanels()) === panels, `${example}: controls grew after restart`);
          const unlock = frame.getByRole('button', { name: 'Enable sound', exact: true });

          if (await unlock.isVisible()) {
            const bounds = await unlock.boundingBox();
            assert(bounds, 'audio unlock has no bounds');
            await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
          }

          await frame
            .locator('canvas')
            .first()
            .click({ position: { x: 100, y: 100 } });
          await page.keyboard.press('ArrowRight');

          if (example === 'input/multitouch') {
            await frame
              .locator('canvas')
              .first()
              .tap({ position: { x: 100, y: 100 } });
          }

          await frame.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
          assert(pageErrors.length === 0, pageErrors.join('\n'));
        }

        if (options.shots) {
          await mkdir(options.shots, { recursive: true });
          await frame.locator('body').screenshot({ path: resolve(options.shots, `${example.replaceAll('/', '-')}-restarted.png`) });
        }
      } catch (error) {
        const frame = await previewFrame(page);
        const diagnostics = await frame.evaluate(
          `({url:location.href,body:document.body.innerText,app:globalThis.__acceptanceApp?.state,source:[...document.scripts].at(-1)?.textContent?.slice(-300)})`,
        );

        throw new Error(
          `${phase}: ${String(error)}; browser errors: ${JSON.stringify(pageErrors)}; console: ${JSON.stringify(session.console.filter(message => message.type === 'error').slice(-4))}; preview: ${JSON.stringify(diagnostics)}`,
          { cause: error },
        );
      } finally {
        await page.context().close();
      }
    });
  }
};

const clickNativeControl = async (frame: Frame, label: string, kind: string): Promise<void> => {
  await frame.waitForFunction('globalThis.__acceptanceApp?.scenes.currentScene?.state === "active"');
  await frame.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  const hit = await frame.evaluate<{ x: number; y: number }>(`(() => {
    const app=globalThis.__acceptanceApp;
    let label;
    const visit=node=>{if(node.constructor.name==='Label'&&node.text===${JSON.stringify(label)})label=node;for(const child of node.children??[])visit(child);};
    visit(app.scenes.currentScene._peekUI());
    const node=label.parent.children.find(child=>child.constructor.name===${JSON.stringify(kind)});
    globalThis.__clickedNativeControl=node;
    const bounds=node.getBounds();
    return {x:(bounds.x+bounds.width/2)/app.width,y:(bounds.y+bounds.height/2)/app.height};
  })()`);
  const canvas = (await frame.locator('canvas').first().boundingBox())!;
  await frame.page().mouse.click(canvas.x + hit.x * canvas.width, canvas.y + hit.y * canvas.height);
  await frame.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  await frame.waitForFunction('globalThis.__acceptanceApp.interaction.focused === globalThis.__clickedNativeControl');
};

const workerChecks = async (browser: Browser, origin: string, base: string): Promise<void> => {
  await check('acceptance worker terrain: initial, unchanged reload, edited reload and new tab', async () => {
    const { page, pageErrors } = await openPlayground(browser, origin, base, 'tilemap/worker-streamed-terrain');
    page.setDefaultTimeout(15_000);

    const verifyTerrain = async (frame: Frame): Promise<void> => {
      for (const provider of ['worker', 'sync']) {
        await clickNativeControl(frame, 'Provider', 'DemoDropdown');
        await frame.page().keyboard.press(provider === 'worker' ? 'ArrowDown' : 'ArrowUp');
        await frame.page().keyboard.press('Enter');
        await frame.waitForFunction(value => {
          const scene = (
            globalThis as unknown as {
              __acceptanceApp: { scenes: { currentScene: { providerMode: string; streamer: { residentCount: number } } } };
            }
          ).__acceptanceApp.scenes.currentScene;

          return scene.providerMode === value && scene.streamer.residentCount > 0;
        }, provider);
      }
    };

    try {
      const source = `${await readFile(resolve(repoRoot, 'examples/tilemap/worker-streamed-terrain.ts'), 'utf8')}\n(globalThis as any).__acceptanceApp = app;`;
      await runSource(page, source);
      await verifyTerrain(await previewFrame(page));
      const previousUrl = (await previewFrame(page)).url();
      await page.getByRole('button', { name: 'Run', exact: true }).click();
      await waitFor(
        async () => (await previewFrame(page)).url(),
        url => url !== previousUrl,
        'worker reload generation',
      );
      await verifyTerrain(await previewFrame(page));

      for (let cycle = 0; cycle < 2; cycle++) {
        await runSource(page, `${source}\ndocument.body.dataset.editedTerrain = '${cycle}';`);
        const frame = await previewFrame(page);
        await frame.waitForFunction(value => document.body.dataset.editedTerrain === value, String(cycle));
        await verifyTerrain(frame);
        await page.locator('[data-example-header] summary').click();
        const popupPromise = page.waitForEvent('popup');
        await page.getByRole('button', { name: 'Open demo in new tab', exact: true }).click();
        const popup = await popupPromise;
        popup.on('pageerror', error => pageErrors.push(error.message));
        await popup.waitForFunction(value => document.body.dataset.editedTerrain === value, String(cycle));
        assert(await popup.evaluate(() => window.opener === null && document.referrer === ''), 'new tab exposes its opener or referrer');
        assert(
          await popup.evaluate(() => sessionStorage.getItem(new URLSearchParams(location.search).get('source-key')!) === null),
          'new tab retained consumed source',
        );
        await verifyTerrain(popup.mainFrame());
        await popup.close();
        const editedUrl = frame.url();
        await page.getByRole('button', { name: 'Run', exact: true }).click();
        await waitFor(
          async () => (await previewFrame(page)).url(),
          url => url !== editedUrl,
          'edited worker reload generation',
        );
        const reloaded = await previewFrame(page);
        await reloaded.waitForFunction(value => document.body.dataset.editedTerrain === value, String(cycle));
        await verifyTerrain(reloaded);
      }

      assert(pageErrors.length === 0, pageErrors.join('\n'));
    } finally {
      await page.context().close();
    }
  });
};

const newTabChecks = async (browser: Browser, origin: string, base: string): Promise<void> => {
  await check('acceptance new tab: repeated edited TypeScript and unchanged reload', async () => {
    const { page, pageErrors } = await openPlayground(browser, origin, base, 'getting-started/hello-world');

    try {
      const source = await readFile(resolve(repoRoot, 'examples/getting-started/hello-world.ts'), 'utf8');

      for (let cycle = 0; cycle < 2; cycle++) {
        await runSource(page, `${source}\ndocument.body.dataset.editedExample = '${cycle}';`);
        const frame = await previewFrame(page);
        await frame.waitForFunction(value => document.body.dataset.editedExample === value, String(cycle));
        const previousUrl = frame.url();
        await page.getByRole('button', { name: 'Run', exact: true }).click();
        await waitFor(
          async () => (await previewFrame(page)).url(),
          url => url !== previousUrl,
          'unchanged edited reload',
        );
        await (await previewFrame(page)).waitForFunction(value => document.body.dataset.editedExample === value, String(cycle));
        await page.locator('[data-example-header] summary').click();
        const popupPromise = page.waitForEvent('popup');
        await page.getByRole('button', { name: 'Open demo in new tab', exact: true }).click();
        const popup = await popupPromise;
        popup.on('pageerror', error => pageErrors.push(error.message));
        await popup.waitForFunction(
          value => document.body.dataset.editedExample === value && document.querySelector('canvas'),
          String(cycle),
        );
        assert(await popup.evaluate(() => window.opener === null && document.referrer === ''), 'new tab exposes opener/referrer');
        assert(
          await popup.evaluate(() => sessionStorage.getItem(new URLSearchParams(location.search).get('source-key')!) === null),
          'source key retained',
        );
        await popup.close();
      }

      assert(pageErrors.length === 0, pageErrors.join('\n'));
    } finally {
      await page.context().close();
    }
  });
};

const responsivePreviewChecks = async (browser: Browser, origin: string, base: string): Promise<void> => {
  await check('acceptance responsive preview: resize and restore remain inside the surface', async () => {
    const { page, pageErrors } = await openPlayground(browser, origin, base, 'getting-started/hello-world');

    try {
      await (await previewFrame(page)).locator('canvas').first().waitFor({ state: 'visible' });
      const measure = () =>
        page.locator('[data-preview-surface]').evaluate(surface => {
          const root = surface.querySelector('iframe')!.parentElement!;
          const outer = surface.getBoundingClientRect();
          const inner = root.getBoundingClientRect();

          return {
            width: inner.width,
            height: inner.height,
            available: surface.clientWidth,
            top: inner.top - outer.top,
            bottom: outer.bottom - inner.bottom,
          };
        });
      const fits = (layout: Awaited<ReturnType<typeof measure>>): boolean =>
        layout.width > 0 && layout.width <= layout.available + 1 && layout.top >= -1 && layout.bottom >= -1;

      for (const viewport of [
        { width: 1600, height: 1000 },
        { width: 1000, height: 800 },
        { width: 1600, height: 1000 },
      ]) {
        await page.setViewportSize(viewport);
        let previous = '';
        let stableSamples = 0;
        const settled = await waitFor(
          measure,
          layout => {
            const current = JSON.stringify(layout);
            stableSamples = fits(layout) && current === previous ? stableSamples + 1 : 0;
            previous = current;

            return stableSamples >= 2;
          },
          `preview fits at ${viewport.width}x${viewport.height}`,
        );
        await page.waitForTimeout(2000);
        const stable = await measure();
        assert(fits(stable), `preview clipped after settling: ${JSON.stringify(stable)}`);
        assert(
          Math.abs(stable.width - settled.width) <= 1 && Math.abs(stable.height - settled.height) <= 1,
          'preview scale did not remain stable',
        );
      }

      assert(pageErrors.length === 0, pageErrors.join('\n'));
    } finally {
      await page.context().close();
    }
  });
};

const crtChecks = async (browser: Browser, origin: string, base: string): Promise<void> => {
  await check('acceptance CRT: toggle, strength and RGB separation change rendered pixels', async () => {
    const { page, pageErrors } = await openPlayground(browser, origin, base, 'filters/crt-scanlines');

    try {
      const source = await readFile(resolve(repoRoot, 'examples/filters/crt-scanlines.ts'), 'utf8');
      // Freeze grain time while the scene and native UI keep updating.
      await runSource(
        page,
        `${source.replace('this.filter.time += delta;', 'this.filter.time += 0;')}\n(globalThis as any).__acceptanceApp = app;\n(globalThis as any).__crtBackend = app.backend.backendType;`,
      );
      const frame = await previewFrame(page);
      await frame.waitForFunction('globalThis.__crtBackend !== undefined');
      console.log(`[e2e] CRT backend: ${await frame.evaluate('globalThis.__crtBackend')}`);
      const canvas = frame.locator('canvas').first();

      const capture = async (): Promise<string> => {
        await frame.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');

        return (await canvas.screenshot()).toString('base64');
      };

      const difference = async (first: string, second: string): Promise<number> =>
        page.evaluate(
          async ([a, b]) => {
            const images = await Promise.all(
              [a, b].map(async data => createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob())),
            );
            const pixels = images.map(image => {
              const surface = new OffscreenCanvas(image.width, image.height);
              const context = surface.getContext('2d')!;
              context.drawImage(image, 0, 0);
              // Compare the scene away from the controls and any keyboard focus outline.
              const data = context.getImageData(0, Math.ceil(image.height * 0.2), image.width, Math.floor(image.height * 0.5)).data;
              image.close();

              return data;
            });
            let changed = 0;

            for (let i = 0; i < pixels[0]!.length; i += 4) {
              if (pixels[0]![i] !== pixels[1]![i] || pixels[0]![i + 1] !== pixels[1]![i + 1] || pixels[0]![i + 2] !== pixels[1]![i + 2]) {
                changed++;
              }
            }

            return changed;
          },
          [first, second],
        );

      const setSlider = async (name: string, key: 'Home' | 'End'): Promise<void> => {
        await clickNativeControl(frame, name, 'Slider');
        await page.keyboard.press(key);
      };

      const on = await capture();
      await clickNativeControl(frame, 'CRT', 'Toggle');
      assert((await difference(on, await capture())) > 500, 'CRT toggle changed no meaningful scene pixels');
      await clickNativeControl(frame, 'CRT', 'Toggle');
      assert((await difference(on, await capture())) === 0, 'CRT toggle did not restore the frozen scene');
      await setSlider('RGB separation', 'Home');
      await setSlider('Effect strength', 'Home');
      const clean = await capture();
      await setSlider('Effect strength', 'End');
      const strong = await capture();
      assert((await difference(clean, strong)) > 500, 'CRT strength changed no meaningful scene pixels');
      await setSlider('RGB separation', 'End');
      assert((await difference(strong, await capture())) > 500, 'CRT RGB separation changed no meaningful scene pixels');
      await setSlider('RGB separation', 'Home');
      const restoredDifference = await difference(strong, await capture());
      assert(restoredDifference === 0, `CRT RGB separation did not restore the frozen scene (${restoredDifference} pixels)`);
      assert(pageErrors.length === 0, pageErrors.join('\n'));
    } finally {
      await page.context().close();
    }
  });
};

const maskChecks = async (browser: Browser, origin: string, base: string): Promise<void> => {
  await check('acceptance mask: circular region is visible', async () => {
    const { page } = await openPlayground(browser, origin, base, 'scene-graph/masks');

    try {
      const frame = await previewFrame(page);
      const canvas = frame.locator('canvas').first();
      await canvas.waitFor({ state: 'visible' });
      // Wait for the asynchronous texture, then sample the actual composited canvas capture.
      await waitFor(
        async () => {
          const png = await canvas.screenshot();

          return page.evaluate(async data => {
            const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
            const surface = new OffscreenCanvas(bitmap.width, bitmap.height);
            const context = surface.getContext('2d')!;
            context.drawImage(bitmap, 0, 0);
            const pixels = context.getImageData(
              Math.floor(bitmap.width * 0.69),
              Math.floor(bitmap.height * 0.38),
              Math.floor(bitmap.width * 0.12),
              Math.floor(bitmap.height * 0.24),
            ).data;
            bitmap.close();
            let visible = 0;

            for (let i = 0; i < pixels.length; i += 4) {
              if (pixels[i]! + pixels[i + 1]! + pixels[i + 2]! > 30) {
                visible++;
              }
            }

            return visible;
          }, png.toString('base64'));
        },
        visible => visible > 100,
        'the circular masked image',
      );

      if (options.shots) {
        await mkdir(options.shots, { recursive: true });
        await canvas.screenshot({ path: resolve(options.shots, 'mask-circular-region.png') });
      }
    } finally {
      await page.context().close();
    }
  });
};

const audioBusChecks = async (browser: Browser, origin: string, base: string): Promise<void> => {
  await check('acceptance audio bus: idle mute and rapid gain replacement', async () => {
    const { page } = await openPlayground(browser, origin, base, 'audio-basics/audio-buses');

    try {
      const frame = await previewFrame(page);
      await frame.locator('canvas').first().click();
      const peaks = await frame.evaluate<{
        audible: number;
        idleMuted: number;
        restored: number;
        muted: number;
        unmuted: number;
        continuousMuted: number;
        continuousRestored: number;
        nonzero: number;
        interruptedFade: number;
        maxStep: number;
        windows: Array<{ peak: number; step: number; samples: number }>;
      }>(`(async () => {
        const { AudioBus, getAudioContext } = await import('@codexo/exojs');
        const context = getAudioContext();
        await context.resume();
        const bus = new AudioBus('idle-regression');
        const processor = 'class Meter extends AudioWorkletProcessor { constructor() { super(); this.window = null; this.port.onmessage = e => { if (Array.isArray(e.data)) { this.window = e.data; this.step = 0; this.previous = []; } else { this.window[0] = e.data.start; this.window[1] = e.data.end; } this.peak = 0; this.samples = 0; }; } process(inputs) { if (this.window) { const [start, end, transition] = this.window; for (let i = 0; i < 128; i++) { const time = currentTime + i / sampleRate; if (time >= start && time < end) { this.samples++; for (const channel of inputs[0]) this.peak = Math.max(this.peak, Math.abs(channel[i])); } if (time >= transition && time < end) { for (let channel = 0; channel < inputs[0].length; channel++) { const value = inputs[0][channel][i]; if (this.previous[channel] !== undefined) this.step = Math.max(this.step, Math.abs(value - this.previous[channel])); this.previous[channel] = value; } } } if (currentTime + 128 / sampleRate >= end) { this.port.postMessage({peak:this.peak,samples:this.samples,step:this.step}); this.window = null; } } return true; } } registerProcessor("acceptance-meter", Meter);';
        const url = URL.createObjectURL(new Blob([processor], {type: 'text/javascript'}));
        await context.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);
        const meter = new AudioWorkletNode(context, 'acceptance-meter');
        bus.getOutputNode().connect(meter);
        meter.connect(context.destination);
        const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
        let maxStep = 0;
        const windows = [];
        const probe = async (change = null) => {
          const source = context.createBufferSource();
          const buffer = context.createBuffer(1, context.sampleRate * (change ? 3 : 0.3), context.sampleRate);
          // Fill before assignment so the source acquires initialized PCM.
          buffer.getChannelData(0).fill(0.1);
          source.buffer = buffer;
          source.connect(bus.getInputNode());
          const start = context.currentTime + 0.1;
          const measured = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('PCM window timed out: ' + context.state)), 5000);
            meter.port.onmessage = event => { clearTimeout(timeout); resolve(event.data); };
          });
          // A busy page delays timers by far more than the gain ramps take, so the peak
          // window follows the audio time the change actually landed at, not a fixed offset.
          meter.port.postMessage(change ? [Infinity, start + 2.9, start + 0.03] : [start - 0.01, start + 0.25, start + 0.03]);
          source.start(start);
          if (change) {
            while (context.currentTime < start + 0.05) await sleep(5);
            await change();
            const settled = context.currentTime + 0.1;
            if (settled + 0.1 > start + 2.9) throw new Error('Gain change landed after the probe signal');
            meter.port.postMessage({ start: settled, end: settled + 0.1 });
          }
          const {peak, samples, step} = await measured;
          windows.push({peak, samples, step});
          maxStep = Math.max(maxStep, step);
          if (samples < context.sampleRate * 0.09) throw new Error('Incomplete PCM window');
          source.stop(); source.disconnect();
          await sleep(500);
          return peak;
        };
        try {
          const audible = await probe();
          bus.volume = 0;
          await sleep(500);
          const idleMuted = await probe();
          bus.volume = 1; bus.volume = 0; bus.volume = 0.5;
          await sleep(100);
          const restored = await probe();
          bus.muted = true;
          await sleep(100);
          const muted = await probe();
          bus.muted = false;
          await sleep(100);
          const unmuted = await probe();
          const continuousMuted = await probe(() => { bus.volume = 0; });
          const continuousRestored = await probe(async () => {
            bus.volume = 1; await sleep(5); bus.volume = 0; await sleep(5); bus.volume = 0.5;
          });
          const nonzero = await probe(async () => {
            bus.volume = 0.8; await sleep(5); bus.volume = 0.3;
          });
          const interruptedFade = await probe(async () => {
            bus.volume = 1; await sleep(5); bus.fadeOut(0.05, { stopAfter: false });
          });
          return { audible, idleMuted, restored, muted, unmuted, continuousMuted, continuousRestored, nonzero, interruptedFade, maxStep, windows };
        } finally { bus.destroy(); meter.disconnect(); meter.port.close(); }
      })()`);
      assert(peaks.audible > 0.07 && peaks.audible < 0.072, `missing calibration signal: ${JSON.stringify(peaks)}`);
      assert(peaks.maxStep < 0.001, `gain transition discontinuity: ${JSON.stringify(peaks)}`);
      assert(
        Math.abs(peaks.continuousRestored / peaks.audible - 0.5) < 0.01,
        `active reversal ended at wrong gain: ${JSON.stringify(peaks)}`,
      );
      assert(
        peaks.idleMuted === 0 && peaks.muted === 0 && peaks.continuousMuted === 0 && peaks.interruptedFade === 0,
        `muted bus leaked samples: ${JSON.stringify(peaks)}`,
      );
      assert(
        Math.abs(peaks.restored / peaks.audible - 0.5) < 0.01 &&
          Math.abs(peaks.unmuted / peaks.audible - 0.5) < 0.01 &&
          Math.abs(peaks.nonzero / peaks.audible - 0.3) < 0.01,
        `replacement gain incorrect: ${JSON.stringify(peaks)}`,
      );
      console.log(`[e2e] PCM ${options.browser}: ${JSON.stringify(peaks)}`);
    } finally {
      await page.context().close();
    }
  });
};

const headerChecks = async (browser: Browser, origin: string, base: string): Promise<void> => {
  await check('header stays stable and navigation remains compact', async () => {
    for (const width of [1440, 1024, 390, 320]) {
      const { page } = await openPlayground(browser, origin, base, 'filters/bloom-filter', { width, height: 1000 });

      try {
        await page.getByRole('button', { name: 'Run', exact: true }).waitFor();
        const header = page.locator('[data-example-header]');
        const height = (await header.boundingBox())!.height;
        assert(
          await header.locator('[data-header-row="context"] > p').isVisible(),
          'Example instructions must remain visible on narrow screens',
        );
        assert((await header.getByText('Info', { exact: true }).count()) === 0, 'duplicate information panel remains');
        await header.locator('summary').click();
        assert((await header.locator('details').getAttribute('open')) !== null, 'view options are inaccessible');
        await header.locator('summary').press('Escape');
        assert((await header.locator('details').getAttribute('open')) === null, 'Escape did not close view options');

        if (width >= 1120) {
          for (const title of ['First Animated Sprite', 'Room Loading and Asset Ownership', 'Bloom Threshold']) {
            await page
              .locator('#playground-navigation')
              .getByRole('link', { name: new RegExp(`^${title}`) })
              .click();
            await waitFor(
              () => header.locator('h1').textContent(),
              value => value === title,
              'selected example title',
            );
            assert((await header.boundingBox())!.height === height, 'example selection changed the header height');
          }

          await page.getByRole('button', { name: 'Hide example list', exact: true }).click();
          await page.getByRole('button', { name: 'Show example list', exact: true }).click();
          await waitFor(
            () => page.getByRole('button', { name: 'Hide example list', exact: true }).evaluate(node => node === document.activeElement),
            focused => focused,
            'navigation keyboard focus',
          );

          let releasePreview!: () => void;
          let previewRequested = false;
          const resumePreview = new Promise<void>(resolve => {
            releasePreview = resolve;
          });
          await page.route(
            '**/preview.html?*',
            async route => {
              previewRequested = true;
              await resumePreview;
              await route.continue();
            },
            { times: 1 },
          );
          await page.getByRole('button', { name: 'Run', exact: true }).click();
          await waitFor(
            async () => previewRequested,
            requested => requested,
            'pending preview load',
          );
          await page.getByRole('button', { name: 'Hide example list', exact: true }).click();
          await page.getByRole('button', { name: 'Show example list', exact: true }).click();
          await waitFor(
            () => page.getByRole('button', { name: 'Hide example list', exact: true }).evaluate(node => node === document.activeElement),
            focused => focused,
            'navigation keyboard focus before preview load',
          );
          releasePreview();
          await page.waitForFunction("document.querySelector('iframe')?.contentDocument?.body?.tabIndex === -1");
          assert(
            await page.getByRole('button', { name: 'Hide example list', exact: true }).evaluate(node => node === document.activeElement),
            'a late preview load stole navigation focus',
          );
        } else if (width <= 760) {
          assert((await page.getByRole('button', { name: 'Examples', exact: true }).count()) === 1, 'multiple mobile navigation entrances');
          assert(
            (await page.getByRole('button', { name: 'Examples', exact: true }).boundingBox())!.height <= 50,
            'navigation styles stretched the mobile actions',
          );
          await page.getByRole('tab', { name: 'Code', exact: true }).click();
          await page.getByRole('button', { name: 'File options', exact: true }).click();
          await page.getByRole('menuitem', { name: 'Copy', exact: true }).waitFor();
        }

        assert(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), 'header overflows the viewport');
      } finally {
        await page.context().close();
      }
    }
  });
};

const nativeControlChecks = async (browser: Browser, origin: string, base: string): Promise<void> => {
  await check('native control gestures run only their own action', async () => {
    for (const [path, kind] of [
      ['sprites-textures/blendmodes', 'choice'],
      ['particles/cursor-attractor-particles', 'choice'],
      ['scene-graph/nested-transforms', 'pause'],
      ['sprites-textures/video-drawable', 'video'],
      ['render-targets/render-to-texture', 'capture'],
    ]) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

      try {
        await page.route('**/examples/shared/runtime.js*', async route => {
          const response = await route.fetch();
          const source = await response.text();
          const hook = 'scene.track({ destroy: dispose });';
          assert(source.includes(hook), 'native controls probe could not attach');
          await route.fulfill({
            response,
            body: source.replace(hook, `${hook} window.__controlProbe={scene,panel:handle,controls:options.controls};`),
          });
        });
        await page.goto(`${origin}${base}/en/playground/?version=current&example=${path}`);
        await page.waitForFunction("document.querySelector('iframe')?.contentWindow?.__controlProbe?.scene.state === 'active'");
        const frame = await previewFrame(page);
        const hit = await frame.evaluate<{ key?: string; expected: string | number | boolean; x: number; y: number }>(`(() => {
          const {scene:s,panel,controls}=window.__controlProbe;
          const kind=${JSON.stringify(kind)};
          let node,expected,key;
          if(kind==='choice') {
            [key]=Object.entries(controls).find(([,spec])=>spec.kind==='choice');
            const spec=controls[key], value=panel.values[key];
            let label;
            const visit=n=>{if(n.constructor.name==='Label'&&n.text===spec.label)label=n;for(const c of n.children??[])visit(c);};
            visit(panel.element);
            node=label.parent.children.find(n=>n.constructor.name==='DemoDropdown');
            expected=value;
            if(!node.visible) {
              node=label.parent.children.find(n=>n.constructor.name==='Button'&&n.label==='>');
              expected=spec.options[(spec.options.indexOf(value)+1)%spec.options.length];
            }
          } else {
            node=panel.actions[kind==='video'?'Play / Pause':'Pause / Resume'];
            const value=kind==='video'?panel.values.paused:kind==='capture'?s.captureCount:s.playing;
            expected=kind==='capture'?value:!value;
          }
          const b=node.getBounds();
          return {key,expected,x:(b.x+b.width/2)/s.app.width,y:(b.y+b.height/2)/s.app.height};
        })()`);
        const canvas = (await frame.locator('canvas').boundingBox())!;
        await page.mouse.click(canvas.x + hit.x * canvas.width, canvas.y + hit.y * canvas.height);
        await frame.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
        const actual = await frame.evaluate(`(() => {
          const {scene:s,panel}=window.__controlProbe;
          const kind=${JSON.stringify(kind)},key=${JSON.stringify(hit.key ?? '')};
          return kind==='choice'?panel.values[key]:kind==='video'?panel.values.paused:kind==='capture'?s.captureCount:s.playing;
        })()`);
        assert(actual === hit.expected, `${path}: expected ${JSON.stringify(hit.expected)}, got ${JSON.stringify(actual)}`);
      } finally {
        await page.close();
      }
    }
  });
};

const fileTabChecks = async (browser: Browser, origin: string, base: string): Promise<void> => {
  await check('file tabs preserve edits and run the entry while a helper is open', async () => {
    const session = await openPlayground(browser, origin, base, 'getting-started/hello-world');
    const { page } = session;
    page.on('dialog', dialog => void dialog.accept());

    try {
      await page.waitForFunction("window.monaco?.editor.getEditors()[0]?.getValue().includes('await startExample')");
      const tabs = page.getByRole('group', { name: 'Example files' });
      const entry = tabs.locator('button').first();
      const helper = tabs.getByRole('button', { name: 'runtime.ts Editable' });
      await page.locator('.monaco-editor').scrollIntoViewIfNeeded();
      await page.locator('.monaco-editor .overflow-guard').click({ position: { x: 350, y: 110 } });
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\n(window as any).__fileTabRun = "entry";');
      const before = await page.evaluate<{ source: string; position: unknown; scroll: number; uri: string }>(`(() => {
        const e=window.monaco.editor.getEditors()[0];
        e.setPosition({lineNumber:25,column:4});e.setScrollTop(180);
        return {source:e.getValue(),position:e.getPosition(),scroll:e.getScrollTop(),uri:e.getModel().uri.toString()};
      })()`);
      assert(before.source.includes('__fileTabRun'), 'The entry accepts keyboard edits');
      await helper.click();
      await page.waitForFunction("window.monaco.editor.getEditors()[0].getModel().uri.path.endsWith('/shared/runtime.ts')");
      assert(
        !(await page.evaluate('window.monaco.editor.getEditors()[0].getOption(window.monaco.editor.EditorOption.readOnly)')),
        'Shared helper source is editable',
      );
      await page.getByRole('button', { name: 'Copy', exact: true }).click();
      assert(
        await page.evaluate(
          "navigator.clipboard.readText().then(text=>text.replaceAll('\\r\\n','\\n')===window.monaco.editor.getEditors()[0].getValue())",
        ),
        'Copy uses the visible helper',
      );
      await page.locator('.monaco-editor .overflow-guard').click({ position: { x: 350, y: 110 } });
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\n(window as any).__helperRun = "edited";');
      await page.getByRole('button', { name: 'Run', exact: true }).click();
      await page.waitForFunction(
        "document.querySelector('iframe')?.contentWindow?.__fileTabRun === 'entry' && document.querySelector('iframe')?.contentWindow?.__helperRun === 'edited'",
      );
      await page.locator('[data-example-header] summary').click();
      const popupPromise = page.context().waitForEvent('page');
      await page.getByRole('button', { name: 'Open demo in new tab', exact: true }).click();
      const standalone = await popupPromise;
      await standalone.waitForFunction("window.__fileTabRun === 'entry' && window.__helperRun === 'edited'");
      assert(await standalone.evaluate(() => window.opener === null), 'Edited helpers preserve detached-tab isolation');
      await standalone.close();
      await entry.click();
      const after = await page.evaluate<{ source: string; position: unknown; scroll: number }>(`(() => {
        const e=window.monaco.editor.getEditors()[0];return {source:e.getValue(),position:e.getPosition(),scroll:e.getScrollTop()};
      })()`);
      assert(
        after.source === before.source &&
          JSON.stringify(after.position) === JSON.stringify(before.position) &&
          after.scroll === before.scroll,
        'Entry content and view survive the tab switch',
      );
      await page.locator('.monaco-editor .overflow-guard').click({ position: { x: 350, y: 110 } });
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\n(window as any).__fileTabRun = "changed";');
      await page.getByRole('button', { name: 'File options', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Open compiled JavaScript', exact: true }).click();
      await page.waitForFunction("window.monaco.editor.getEditors()[0].getModel().uri.path.endsWith('/hello-world.js')");
      assert(await page.getByRole('button', { name: 'Run', exact: true }).isEnabled(), 'Run stays available on compiled output');
      await page.getByRole('button', { name: 'Run', exact: true }).click();
      await page.waitForFunction("document.querySelector('iframe')?.contentWindow?.__fileTabRun === 'changed'");
      assert(
        (await page.evaluate<string>('window.monaco.editor.getEditors()[0].getValue()')).includes('"changed"'),
        'Compiled output refreshes from the entry',
      );
      await entry.click();
      assert(
        (await page.evaluate<string>('window.monaco.editor.getEditors()[0].getValue()')).includes('"changed"'),
        'Opening compiled output preserves unrun edits',
      );
      await helper.click();
      await page.getByRole('button', { name: 'Reset', exact: true }).click();
      assert(
        !(await page.evaluate<string>('window.monaco.editor.getEditors()[0].getValue()')).includes('__helperRun'),
        'Reset restores helper source',
      );
      await entry.click();
      assert(
        !(await page.evaluate<string>('window.monaco.editor.getEditors()[0].getValue()')).includes('__fileTabRun'),
        'Reset targets the entry',
      );
      await page.waitForFunction(
        "document.querySelector('iframe')?.contentDocument?.querySelector('canvas') && !('__helperRun' in document.querySelector('iframe').contentWindow)",
      );
      await page
        .locator('#playground-navigation')
        .getByRole('link', { name: /^Bloom Threshold/ })
        .click();
      await page.waitForFunction("window.monaco?.editor.getEditors()[0]?.getModel()?.uri.path.includes('bloom-filter')");
      assert(
        await page.evaluate(
          `window.monaco.editor.getEditors().length===1 && !window.monaco.editor.getModels().some(model=>model.uri.toString()===${JSON.stringify(before.uri)})`,
        ),
        'Old example models are disposed',
      );
      assert(session.pageErrors.length === 0, session.pageErrors.join('\n'));
    } finally {
      await page.context().close();
    }
  });
  await check('file tabs keep helper diagnostics on their originating file', async () => {
    const { page, pageErrors } = await openPlayground(browser, origin, base, 'getting-started/hello-world');

    try {
      await page.route('**/examples/shared/runtime.ts', route =>
        route.fulfill({ contentType: 'text/plain', body: "export const broken: number = 'bad';" }),
      );
      await page.getByRole('group', { name: 'Example files' }).getByRole('button', { name: 'runtime.ts Editable' }).click();
      await page.waitForFunction("window.monaco?.editor.getEditors()[0]?.getModel()?.uri.path.endsWith('/shared/runtime.ts')");
      await page.getByRole('button', { name: 'Jump to line 1', exact: true }).first().click({ timeout: 45000 });
      assert(
        await page.evaluate("window.monaco.editor.getEditors()[0].getModel().uri.path.endsWith('/shared/runtime.ts')"),
        'The diagnostic belongs to the visible helper',
      );
      assert(pageErrors.length === 0, pageErrors.join('\n'));
    } finally {
      await page.context().close();
    }
  });

  await check('used assets open the standalone tool without losing editor changes', async () => {
    const { page, pageErrors } = await openPlayground(browser, origin, base, 'getting-started/hello-world');

    try {
      await page.locator('[data-used-assets] summary').click({ timeout: 45000 });
      const source = await page.evaluate<string>(`(() => {
        const model=window.monaco.editor.getEditors()[0].getModel();
        model.setValue(model.getValue()+'\\n// unsaved asset navigation check\\n');return model.getValue();
      })()`);
      await page.locator('[data-used-assets] button').first().click();
      await page.getByRole('region', { name: 'Asset preview' }).waitFor();
      const link = page.locator('[data-used-assets] a[href*="/tools/asset-browser/"]').first();
      const href = (await link.getAttribute('href'))!;
      const [tool] = await Promise.all([page.context().waitForEvent('page'), link.click()]);
      await tool.waitForLoadState('domcontentloaded');
      await tool.waitForFunction(
        `Boolean(document.querySelector('[data-asset-tool]')?.contentDocument?.querySelector('aside[aria-label="Selected asset"] h2')?.textContent)`,
      );
      assert((await tool.locator('.monaco-editor').count()) === 0, 'The tool has no permanent code pane');
      assert(
        tool.url().includes('/tools/asset-browser/') && tool.url().includes(new URL(href).search),
        'The selected asset deep link is preserved',
      );
      assert((await page.evaluate<string>('window.monaco.editor.getEditors()[0].getValue()')) === source, 'Unrun entry changes survive');
      await tool.close();
      assert(pageErrors.length === 0, pageErrors.join('\n'));
    } finally {
      await page.context().close();
    }
  });

  await check('native canvas dropdown arrows do not scroll the Playground', async () => {
    const { page, pageErrors } = await openPlayground(browser, origin, base, 'ui/settings-menu');

    try {
      await page.waitForFunction("window.monaco?.editor.getEditors()[0]?.getValue().includes('class SettingsMenuScene')");
      const source = await page.evaluate<string>('window.monaco.editor.getEditors()[0].getValue()');
      assert(source.includes('override init(): void {'), 'The settings scene init is available');
      await runSource(page, source.replace('override init(): void {', 'override init(): void { (window as any).__scrollScene = this;'));
      const frame = await previewFrame(page);
      await frame.waitForFunction('Boolean(globalThis.__scrollScene?.theme?.visible)');
      await page.evaluate("document.body.style.minHeight='1600px'");
      const hit = await frame.evaluate<{ x: number; y: number }>(`(() => {
        const s=globalThis.__scrollScene,b=s.theme.getBounds();
        return {x:(b.x+b.width/2)/s.app.width,y:(b.y+b.height/2)/s.app.height};
      })()`);
      const canvas = (await frame.locator('canvas').boundingBox())!;
      await page.mouse.click(canvas.x + canvas.width * hit.x, canvas.y + canvas.height * hit.y);
      await frame.waitForFunction('globalThis.__scrollScene.theme.isOpen');
      const selected = await frame.evaluate<number>('globalThis.__scrollScene.theme.highlightedIndex');
      const before = await page.evaluate<number>('scrollY');
      await frame.evaluate(
        "window.addEventListener('keydown',event=>{if(event.key==='ArrowDown')setTimeout(()=>globalThis.__arrowPrevented=event.defaultPrevented,0)},{once:true})",
      );
      await page.keyboard.press('ArrowDown', { delay: 35 });
      await frame.waitForFunction(`globalThis.__scrollScene.theme.highlightedIndex === ${selected + 1} && globalThis.__arrowPrevented`);
      await page.waitForTimeout(250);
      assert((await page.evaluate<number>('scrollY')) === before, 'Canvas arrows must not scroll the parent document');
      assert(pageErrors.length === 0, pageErrors.join('\n'));
    } finally {
      await page.context().close();
    }
  });
};

const main = async (): Promise<void> => {
  const build = options.origin ? resolveSiteChannel(process.env) : readSiteBuildManifest(distDir);
  const base = build.basePath.replace(/\/$/, '');
  const { server, origin } = options.origin ? { server: null, origin: new URL(options.origin).origin } : await startServer(distDir, base);
  assert(['chromium', 'firefox'].includes(options.browser!), 'Unsupported browser');
  const browser = await (options.browser === 'firefox'
    ? firefox.launch({ headless: !options.headed, firefoxUserPrefs: { 'dom.webgpu.enabled': true } })
    : chromium.launch({
        channel: 'chromium',
        headless: !options.headed,
        // Audio stays locked until a real gesture, as it does for a visitor.
        ignoreDefaultArgs: ['--autoplay-policy=no-user-gesture-required'],
        args: ['--autoplay-policy=user-gesture-required', '--enable-webgl', '--ignore-gpu-blocklist'],
      }));

  try {
    if (options.only?.toLowerCase() !== 'asset' && !options.only?.toLowerCase().includes('asset browser')) {
      await fileTabChecks(browser, origin, base);
      await headerChecks(browser, origin, base);
      await nativeControlChecks(browser, origin, base);
      await responsivePreviewChecks(browser, origin, base);
      await crtChecks(browser, origin, base);
      await maskChecks(browser, origin, base);
      await audioBusChecks(browser, origin, base);
      await workerChecks(browser, origin, base);
      await newTabChecks(browser, origin, base);
      await exampleLifecycleChecks(browser, origin, base);
      await consoleChecks(browser, origin, base);
    }

    await typecheckSnippets(await assetChecks(browser, origin, base));
  } finally {
    await browser.close();
    server?.close();
  }

  const failed = results.filter(result => result.error !== null);

  console.log(`[e2e] ${results.length - failed.length} passed, ${failed.length} failed`);
  process.exitCode = failed.length > 0 ? 1 : 0;
};

await main();
