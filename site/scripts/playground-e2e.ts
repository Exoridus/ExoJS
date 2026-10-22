/**
 * Browser checks for the playground shell's Output panel and the Asset Browser
 * example, against the built site (`site/dist`).
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
 *   ... --only asset          # run checks whose name contains "asset"
 *   ... --shots <dir>         # write a screenshot after each asset preview
 *   ... --headed              # watch it run
 */
import { readFileSync } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { type Browser, chromium, type Frame, type Page } from 'playwright';
import ts from 'typescript';

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
    shots: { type: 'string' },
    headed: { type: 'boolean', default: false },
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
  const context = await browser.newContext({ viewport, permissions: ['clipboard-read', 'clipboard-write'] });
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
  await page.locator('button[aria-label="Reload preview"]').click();
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
    await setOutputOpen(page, false);
    await page.evaluate("localStorage.removeItem('exo-playground-output-open')");
    await page.reload({ waitUntil: 'domcontentloaded' });
    await previewFrame(page);
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
    await page.locator('button[aria-label="Reload preview"]').click();
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

    await page.locator('button[aria-label="Swap the editor and the preview"]').click();

    const swappedPreview = await box(page, 'section[aria-label="Example preview"]');
    const swappedOutput = await box(page, '[aria-label="Preview output"]');

    assert(swappedPreview.x > preview.x, 'the swap did not move the preview');
    assert(Math.abs(swappedOutput.x - swappedPreview.x) < 2, 'the panel did not follow the preview');
    assert(swappedOutput.y >= swappedPreview.y + swappedPreview.height - 1, 'the panel overlaps the swapped preview');
    await page.locator('button[aria-label="Swap the editor and the preview"]').click();
  });

  await check('the panel sits between preview and editor in the stacked layout', async () => {
    await page.locator('button[aria-label="Switch to stacked layout"]').click();

    const preview = await box(page, 'section[aria-label="Example preview"]');
    const output = await box(page, '[aria-label="Preview output"]');
    const editor = await box(page, 'section[aria-label="Source editor"]');

    assert(output.y >= preview.y + preview.height - 1, 'the panel overlaps the preview');
    assert(editor.y >= output.y + output.height - 1, 'the editor is not below the panel');
    await page.locator('button[aria-label="Switch to split layout"]').click();
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
  'musicLoopMain',
  'videoDemoLoop',
  'fontKenneyFuture',
  'fontKenneyBlocksFnt',
];

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
  const session = await openPlayground(browser, origin, base, 'debug-layer/asset-browser');
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
      assert(!(await outputEntries(page)).some(entry => entry.kind === 'exception'), 'an uncaught error was recorded');

      const resident = await residentRows(frame);

      assert(resident.length >= 2 && resident.length <= 12, `the loader holds ${resident.length} assets: ${resident.join(', ')}`);

      await frame.getByRole('button', { name: 'Code', exact: true }).click();

      const code = await frame.locator('section[aria-label="Code"] pre').innerText();

      assert(code.includes(`assets.${id}`), `the snippet does not reference assets.${id}: ${code.slice(0, 200)}`);
      snippets.push(`// ${id}\n${code}`);
      await frame.getByRole('button', { name: 'Close', exact: true }).click();

      if (options.shots) {
        await mkdir(options.shots, { recursive: true });
        await page.locator('section[aria-label="Example preview"]').screenshot({ path: join(options.shots, `${id}.png`) });
      }
    });
  }

  await check('spritesheet frame selection and animation settings reach the snippet', async () => {
    await selectAsset(frame, 'platformerCharacters');
    await waitFor(
      () => inspectorHeading(frame),
      text => text === 'Platformer characters',
      'the spritesheet',
    );
    // The panel mounts once the atlas has loaded; a tap before that has nothing to hit.
    await frame.getByRole('slider', { name: 'FPS' }).waitFor();

    const canvas = frame.locator('canvas');
    const rect = await canvas.boundingBox();

    assert(rect, 'the canvas has no box');

    const before = session.console.length;

    // `position` is in page pixels from the canvas's scaled box; the fitted
    // atlas is centred in the preview area, above the frame strip.
    await canvas.click({ position: { x: (610 * rect.width) / 1280, y: (150 * rect.height) / 720 } });
    await waitFor(
      async () => session.console.slice(before).map(message => message.text),
      texts => texts.some(text => text.startsWith('Frame ')),
      'a frame selection log',
    );

    await frame.getByRole('slider', { name: 'FPS' }).fill('14');
    await frame.getByRole('slider', { name: 'Last frame' }).fill('3');
    await frame.getByRole('button', { name: 'Code', exact: true }).click();

    const code = await frame.locator('section[aria-label="Code"] pre').innerText();

    assert(code.includes('fps: 14'), 'the FPS setting is not in the snippet');
    assert((code.match(/"character_[a-z_]+"/g) ?? []).length === 4, `the frame range is not in the snippet: ${code}`);
    snippets.push(`// spritesheet settings\n${code}`);
    await frame.getByRole('button', { name: 'Close', exact: true }).click();
  });

  await check('texture filtering and zoom reach the snippet', async () => {
    await selectAsset(frame, 'ship');
    await waitFor(
      () => inspectorHeading(frame),
      text => text === 'Ship',
      'the texture',
    );
    await frame.getByRole('slider', { name: 'Zoom' }).fill('3');
    await frame.getByRole('button', { name: 'Next Filtering', exact: true }).click();
    await frame.getByRole('button', { name: 'Code', exact: true }).click();

    const code = await frame.locator('section[aria-label="Code"] pre').innerText();

    assert(code.includes('ScaleModes.Nearest') && code.includes('setScale(3)'), `snippet: ${code}`);
    snippets.push(`// texture settings\n${code}`);
    await frame.getByRole('button', { name: 'Close', exact: true }).click();
  });

  await check('a late load never surfaces after a newer selection', async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>(done => (release = done));

    await page.route('**/clips/high-res.mp4*', async route => {
      await held;
      await route.continue().catch(() => undefined);
    });

    const before = session.console.length;

    await selectAsset(frame, 'videoHighRes');
    await page.waitForTimeout(300);
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
    await page.unroute('**/clips/high-res.mp4*');
  });

  await check('many quick switches leave only the current selection resident', async () => {
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
    assert(!(await outputEntries(page)).some(entry => entry.kind === 'exception'), 'a switch raised an uncaught error');
  });

  await check('a double press of Play starts one voice and Stop stays harmless', async () => {
    await selectAsset(frame, 'musicLoopMain');
    await waitFor(
      () => inspectorHeading(frame),
      text => text === 'Loop main',
      'the music',
    );

    const before = session.console.length;
    const play = frame.getByRole('button', { name: 'Play', exact: true });

    await play.dblclick();
    await page.waitForTimeout(600);
    await frame.getByRole('button', { name: 'Stop', exact: true }).click();
    await frame.getByRole('button', { name: 'Stop', exact: true }).click();

    const played = session.console.slice(before).filter(message => message.text.startsWith('Playing'));

    assert(played.length === 1, `${played.length} voices started`);
    await selectAsset(frame, 'ship');
  });

  await check('leaving the example while a load is in flight raises nothing', async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>(done => (release = done));

    await page.route('**/clips/high-fps.webm*', async route => {
      await held;
      await route.continue().catch(() => undefined);
    });
    await selectAsset(frame, 'videoHighFps');
    await page.waitForTimeout(300);

    const errorsBefore = session.pageErrors.length;

    await page.locator('a[href$="/getting-started/hello-world"]').first().click();
    await waitFor(
      () => page.evaluate('location.hash'),
      hash => String(hash).endsWith('hello-world'),
      'the example switch',
    );
    release();
    await page.waitForTimeout(2000);
    assert(session.pageErrors.length === errorsBefore, `errors: ${session.pageErrors.slice(errorsBefore).join(' | ')}`);
    assert(!(await outputEntries(page)).some(entry => entry.kind === 'exception'), 'an uncaught error reached the new preview');
    await page.unroute('**/clips/high-fps.webm*');
  });

  await page.context().close();

  await check('playback waiting for the audio unlock is cancelled by a switch', async () => {
    // A fresh page: no real gesture has happened yet, so audio is still locked
    // and every interaction below until the final click is a synthetic one.
    const locked = await openPlayground(browser, origin, base, 'debug-layer/asset-browser');
    const lockedFrame = await assetFrame(locked.page);
    const clickPlay = `[...document.querySelectorAll('aside button')].find(button => button.textContent === 'Play').click()`;

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
  await check(`generated snippets type-check (${snippets.length})`, async () => {
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

const main = async (): Promise<void> => {
  const build = readSiteBuildManifest(distDir);
  const base = build.basePath.replace(/\/$/, '');
  const { server, origin } = await startServer(distDir, base);
  const browser = await chromium.launch({
    headless: !options.headed,
    // Audio stays locked until a real gesture, as it does for a visitor.
    ignoreDefaultArgs: ['--autoplay-policy=no-user-gesture-required'],
    args: ['--autoplay-policy=user-gesture-required', '--enable-webgl', '--ignore-gpu-blocklist'],
  });

  try {
    await consoleChecks(browser, origin, base);
    await typecheckSnippets(await assetChecks(browser, origin, base));
  } finally {
    await browser.close();
    server.close();
  }

  const failed = results.filter(result => result.error !== null);

  console.log(`[e2e] ${results.length - failed.length} passed, ${failed.length} failed`);
  process.exitCode = failed.length > 0 ? 1 : 0;
};

await main();
