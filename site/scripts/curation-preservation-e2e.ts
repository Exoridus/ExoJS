import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import type { Application, BitmapText, BmFont, Text } from '@codexo/exojs';
import { chromium, firefox, type Frame, type Page } from 'playwright';

import { EXAMPLE_ALIASES, resolveExampleAlias } from '../src/lib/example-aliases.ts';

interface Target {
  number: number;
  source: string;
  prerequisites: number[];
  next: number[];
  status: string;
}

interface Contract {
  source: string;
  disposition: string;
  migration: string;
  destinations: string[];
}

interface FixtureScene {
  frame: number;
  font: BmFont;
  title: BitmapText;
  info: BitmapText;
  wrapped: BitmapText;
  counter: BitmapText;
  labels: Text[];
}

interface Probe {
  app: Application;
  scenes: string[];
  progress: number[][];
  starts: number;
  completions: number;
  errors: string[];
  ready?: () => boolean;
}

declare global {
  interface Window {
    __preservation: Probe;
  }
}

interface RecordEntry {
  name: string;
  coverage: 'http' | 'site-ui' | 'functional';
  status: 'PASS' | 'FAIL';
  size?: string;
  locale?: string;
  checks?: string[];
  evidence?: unknown;
  error?: string;
  console?: string[];
}

const fixtures = ['application-loading', 'bitmap-layout', 'text-styles'] as const;
const sizes = [
  [1280, 720],
  [512, 288],
] as const;
const locales = ['en', 'de'] as const;
const root = fileURLToPath(new URL('../../', import.meta.url));
const sourcePath = (source: string) => source.replace(/^examples\//, '').replace(/\.ts$/, '.js');
const slug = (path: string) => path.replace(/\.js$/, '');
const sha256 = (body: string) => createHash('sha256').update(body).digest('hex');

const instrument = (source: string, fixture: string, backend: string): string => {
  const declaration = 'const app = new Application({';
  assert.equal(source.split(declaration).length, 2, 'exactly one application constructor must be intercepted');
  const startup = /await (?:app\.start|startExample)\(/g;
  assert.equal([...source.matchAll(startup)].length, 1, 'exactly one application startup must be intercepted');
  let probe = `
window.__preservation = { app, scenes: [], progress: [], starts: 0, completions: 0, errors: [] };
app.onError.add(error => window.__preservation.errors.push(error.message));
`;

  if (fixture === 'application-loading') {
    probe += `
window.__preservation.ready = () => GameAssets.ship.ready && GameAssets.grid.ready && GameAssets.ramp.ready && GameAssets.click.ready;
app.loader.onLoadStart.add(() => window.__preservation.starts++);
app.loader.onLoadProgress.add((loaded, total) => window.__preservation.progress.push([loaded, total]));
app.loader.onLoadComplete.add(() => window.__preservation.completions++);
for (const SceneType of [BootScene, PlayScene]) {
  const init = SceneType.prototype.init;
  SceneType.prototype.init = function(...args) {
    window.__preservation.scenes.push(SceneType.name);
    return init.apply(this, args);
  };
}
`;
  }

  return source.replace(declaration, `${declaration} backend: { type: '${backend}' },`).replace(startup, match => `${probe}\n${match}`);
};

const validateDetail = (html: string, path: string, locale: string): void => {
  assert(html.includes(`lang="${locale}"`), `detail locale: ${locale}/${path}`);
  assert(
    [...html.matchAll(/<code\b[^>]*>([^<]*)<\/code>/g)].some(match => match[1] === path),
    `detail source: ${path}`,
  );
  assert(html.replaceAll('&amp;', '&').includes(`?version=current&example=${slug(path)}`), `current-version detail link: ${path}`);
};

const { values } = parseArgs({
  options: {
    host: { type: 'string', default: 'http://127.0.0.1:4328/ExoJS' },
    browser: { type: 'string', default: 'chromium' },
    backend: { type: 'string', default: 'webgl2' },
    only: { type: 'string' },
    shots: { type: 'string', default: resolve(root, 'docs/curation/evidence/b7') },
    'self-check': { type: 'boolean', default: false },
  },
});

if (values['self-check']) {
  const sample = 'const app = new Application({ scenes: {} });\nawait app.start(BootScene);';
  const changed = instrument(sample, 'application-loading', 'webgpu');
  assert(changed.includes("backend: { type: 'webgpu' }"));
  assert(changed.indexOf('window.__preservation =') < changed.indexOf('await app.start('));
  assert(changed.includes('return init.apply(this, args)'));
  assert(
    instrument(
      sample.replace('await app.start(BootScene)', 'await startExample(app, () => app.start(BootScene))'),
      'bitmap-layout',
      'webgl2',
    ).includes('window.__preservation ='),
  );
  assert.throws(() => instrument('await app.start(BootScene);', 'bitmap-layout', 'webgl2'));
  assert.throws(() => instrument(`${sample}\nawait app.start(BootScene);`, 'bitmap-layout', 'webgl2'));
  const detail =
    '<html lang="de"><code>guide-fixtures/bitmap-layout.js</code><a href="?version=current&amp;example=guide-fixtures/bitmap-layout">Open</a>';
  validateDetail(detail, 'guide-fixtures/bitmap-layout.js', 'de');
  validateDetail(detail.replace('<code>', '<code data-astro-cid-test>'), 'guide-fixtures/bitmap-layout.js', 'de');
  assert.throws(() => validateDetail(detail.replace('version=current', 'version=0.19.1'), 'guide-fixtures/bitmap-layout.js', 'de'));
  assert.throws(() => validateDetail(detail, 'guide-fixtures/text-styles.js', 'de'));
  console.log('PASS: source interception and detail-route guards reject malformed inputs');
} else {
  assert(['chromium', 'firefox'].includes(values.browser!));
  assert(['webgl2', 'webgpu'].includes(values.backend!));
  assert(values.browser !== 'firefox' || values.backend === 'webgl2', 'Firefox WebGPU is outside this acceptance matrix');
  const host = values.host!.replace(/\/$/, '');
  const output = resolve(values.shots!);
  assert(!values.only || ['http', 'ui', ...fixtures].includes(values.only), 'unknown focused contract');
  const prefix = `${values.browser}-${values.backend}${values.only ? `-${values.only}` : ''}`;
  const records: RecordEntry[] = [];
  const http: Array<{ url: string; status: number; sha256?: string; error?: string }> = [];
  const catalog = JSON.parse(await readFile(resolve(root, 'examples/examples.json'), 'utf8')) as Record<string, Array<{ path: string }>>;
  const curation = JSON.parse(await readFile(resolve(root, 'docs/curation/catalog.json'), 'utf8')) as {
    targets: Target[];
    contracts: Contract[];
  };
  const original = Object.values(catalog)
    .flat()
    .map(entry => entry.path);
  const runnable = [...original, ...fixtures.map(name => `guide-fixtures/${name}.js`)];
  const preserved = [
    ...curation.contracts
      .filter(contract => ['merge', 'guide-tool-test'].includes(contract.disposition))
      .map(contract => sourcePath(contract.source)),
    ...fixtures.map(name => `guide-fixtures/${name}.js`),
  ];
  const ready =
    curation.targets.every(target => target.status === 'accepted') &&
    curation.contracts.every(contract => contract.migration === 'verified');
  assert.equal(original.length, 111);
  assert.equal(curation.contracts.length, 111);
  assert.equal(runnable.length, 114);
  assert.equal(new Set(runnable).size, 114);
  assert.equal(Object.keys(EXAMPLE_ALIASES).length, 55);
  assert.equal(curation.targets.length, 48);
  assert.equal(preserved.length, 66);
  assert.deepEqual([...curation.contracts.map(contract => sourcePath(contract.source))].sort(), [...original].sort());

  for (const contract of curation.contracts) {
    assert(contract.destinations.length > 0, `preservation destination: ${contract.source}`);

    for (const destination of contract.destinations) {
      assert((await readFile(resolve(root, destination), 'utf8')).trim().length > 0, `nonempty destination: ${destination}`);

      if (destination.startsWith('examples/')) {
        assert(runnable.includes(sourcePath(destination)), `runnable destination: ${destination}`);
      }
    }
  }

  const visit = (number: number, ancestors: number[] = []): void => {
    assert(!ancestors.includes(number), `prerequisite cycle: ${[...ancestors, number].join(' -> ')}`);
    const target = curation.targets.find(candidate => candidate.number === number);
    assert(target, `missing prerequisite target: ${number}`);

    for (const dependency of target.prerequisites) {
      visit(dependency, [...ancestors, number]);
    }
  };

  for (const target of curation.targets) {
    visit(target.number);
    assert(
      target.next.every(number => curation.targets.some(candidate => candidate.number === number)),
      `next steps: ${target.number}`,
    );
  }

  const browser =
    values.browser === 'firefox'
      ? await firefox.launch({ firefoxUserPrefs: { 'dom.webgpu.enabled': true } })
      : await chromium.launch({ channel: 'chromium', args: ['--enable-webgl', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ colorScheme: 'dark' });
  const responses = new Map<string, string>();
  await mkdir(output, { recursive: true });

  const fetchText = async (url: string): Promise<string> => {
    const cached = responses.get(url);

    if (cached !== undefined) {
      return cached;
    }

    const response = await context.request.get(url, { timeout: 30_000 });
    const text = await response.text();
    http.push({ url, status: response.status(), sha256: sha256(text) });
    assert.equal(response.status(), 200, url);
    responses.set(url, text);

    return text;
  };

  const capture = async (page: Page, name: string): Promise<void> => {
    await page.screenshot({ path: resolve(output, `${prefix}-${name}.png`), scale: 'css' });
  };

  const record = (entry: RecordEntry): void => {
    records.push(entry);
    console.log(JSON.stringify({ name: entry.name, coverage: entry.coverage, status: entry.status, error: entry.error }));
  };

  const checkHttp = async (): Promise<void> => {
    const jobs = [
      ...runnable.flatMap(path =>
        [path, path.replace(/\.js$/, '.ts')].map(source => async () => {
          const text = await fetchText(`${host}/examples/${source}`);
          assert(text.trim().length > 0 && !/^\s*<!doctype/i.test(text), `expected source, not an HTML fallback: ${source}`);
        }),
      ),
      ...locales.flatMap(locale =>
        [...original, ...Object.keys(EXAMPLE_ALIASES)].map(path => async () => {
          const canonical = resolveExampleAlias(path);
          assert(runnable.includes(canonical), `alias target has executable metadata: ${path}`);
          validateDetail(await fetchText(`${host}/${locale}/playground/examples/${slug(path)}/`), canonical, locale);
        }),
      ),
      ...['index.js', 'core/Application.js', 'input/InputSystem.js', 'input/FocusController.js'].map(path => async () => {
        const text = await fetchText(`${host}/vendor/exojs/esm/${path}`);
        assert(!/^\s*<!doctype/i.test(text), `expected runtime module: ${path}`);
      }),
    ];
    const failures: string[] = [];

    for (let start = 0; start < jobs.length; start += 4) {
      const batch = await Promise.allSettled(jobs.slice(start, start + 4).map(job => job()));

      for (const result of batch) {
        if (result.status === 'rejected') {
          failures.push(String(result.reason));
        }
      }
    }

    assert.deepEqual(failures, [], 'HTTP preservation failures');
  };

  const checkIndex = async (page: Page, locale: string, kind: string): Promise<unknown> => {
    await page.goto(`${host}/${locale}/playground/${kind}/`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('html').getAttribute('lang'), locale);
    assert.equal(await page.locator('.english-fallback-notice').count(), locale === 'de' ? 1 : 0);
    const cards = await page.locator('.curation-index .entries > li').evaluateAll(elements =>
      elements.map(element => ({
        number: Number(element.getAttribute('data-curated-number')),
        path: element.getAttribute('data-preserved-source'),
        detail: element.querySelector<HTMLAnchorElement>('h3 a')!.href,
        runs: [...element.querySelectorAll<HTMLAnchorElement>('a.run')].map(link => ({ label: link.textContent!.trim(), href: link.href })),
        related: [...element.querySelectorAll('.related')].map(item => ({
          label: item.textContent!.trim(),
          links: [...item.querySelectorAll<HTMLAnchorElement>('a')].map(link => link.href),
        })),
      })),
    );
    const detail = (path: string) => `${host}/${locale}/playground/examples/${slug(path)}`;
    assert.equal(cards.length, kind === 'curriculum' ? 48 : 66);

    if (kind === 'curriculum') {
      assert.deepEqual(
        cards.map(card => card.number),
        Array.from({ length: 48 }, (_, index) => index + 1),
      );

      for (const card of cards) {
        const target = curation.targets.find(candidate => candidate.number === card.number)!;
        assert.equal(card.detail, detail(sourcePath(target.source)));
        const related = card.related.flatMap(item => item.links);
        assert.deepEqual(
          related,
          [...target.prerequisites, ...target.next].map(id =>
            detail(sourcePath(curation.targets.find(candidate => candidate.number === id)!.source)),
          ),
        );
      }

      assert.equal((await page.locator('.curation-index').innerText()).includes('Preview the focused learning path.'), !ready);
    } else {
      assert.deepEqual(cards.map(card => card.path).sort(), [...preserved].sort());

      for (const card of cards) {
        assert.equal(card.detail, detail(card.path!));
        assert.equal(card.runs.find(link => link.label === 'TypeScript')?.href, `${host}/examples/${card.path!.replace(/\.js$/, '.ts')}`);
      }
    }

    for (const card of cards) {
      const path = card.path ?? sourcePath(curation.targets.find(target => target.number === card.number)!.source);
      const run = new URL(card.runs[0].href);
      assert.equal(run.pathname, new URL(`${host}/${locale}/playground/`).pathname);
      assert.equal(run.searchParams.get('version'), 'current');
      assert.equal(run.searchParams.get('example'), slug(path));
    }

    const links = await page
      .locator('.curation-index a')
      .evaluateAll(elements => elements.map(element => (element as HTMLAnchorElement).href));

    for (const link of new Set(links)) {
      const url = new URL(link);
      assert(
        url.href.startsWith(`${host}/${locale}/playground/`) || url.href.startsWith(`${host}/examples/`),
        `locale-preserving local link: ${url.href}`,
      );

      if (!url.search) {
        await fetchText(url.href);
      }
    }

    const metrics = await page.locator('.curation-index').evaluate(element => {
      const card = element.querySelector<HTMLElement>('.entries > li')!;
      const sample = document.createElement('span');
      sample.style.cssText =
        'position:absolute;visibility:hidden;background:var(--bg-elevated);border:1px solid var(--line-soft);color:var(--accent)';
      element.appendChild(sample);
      const expected = getComputedStyle(sample);
      const style = getComputedStyle(card);
      const result = {
        overflow: document.documentElement.scrollWidth - innerWidth,
        cardOverflow: [...element.querySelectorAll('.entries > li')].some(
          item => item.getBoundingClientRect().right > innerWidth + 1 || item.getBoundingClientRect().left < -1,
        ),
        tokenValues: ['--bg-elevated', '--line-soft', '--accent'].map(token => getComputedStyle(element).getPropertyValue(token).trim()),
        backgroundMatches: style.backgroundColor === expected.backgroundColor,
        borderMatches: style.borderTopColor === expected.borderTopColor,
        linkMatches: getComputedStyle(card.querySelector('a')!).color === expected.color,
        controls: [...element.querySelectorAll('.run')].map(link => ({
          height: link.getBoundingClientRect().height,
          font: Number.parseFloat(getComputedStyle(link).fontSize),
        })),
      };
      sample.remove();

      return result;
    });
    assert(metrics.overflow <= 1 && !metrics.cardOverflow, JSON.stringify(metrics));
    assert(
      metrics.tokenValues.every(Boolean) && metrics.backgroundMatches && metrics.borderMatches && metrics.linkMatches,
      'cards use website surface, border and accent tokens',
    );
    assert(
      metrics.controls.every(control => control.height >= 32 - 0.1 && control.font >= 14 - 0.1),
      'presented run controls remain readable',
    );

    return { cards: cards.length, links: new Set(links).size, ...metrics };
  };

  const openFixture = async (page: Page, fixture: string, width: number, height: number): Promise<Frame> => {
    await page.route(`**/examples/guide-fixtures/${fixture}.js*`, async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: instrument(await response.text(), fixture, values.backend!) });
    });
    await page.goto(`${host}/en/playground/?version=current&example=guide-fixtures/${fixture}`);
    const iframe = page.locator('iframe[src*="preview.html"]');
    await iframe.waitFor({ timeout: 30_000 });
    const frame = await (await iframe.elementHandle())!.contentFrame();
    assert(frame);
    await frame.waitForFunction(() => Boolean(window.__preservation?.app.scenes.currentScene), undefined, { timeout: 30_000 });
    // Keep the real Playground iframe; isolate its presentation box from the editor shell's scroll clipping.
    await iframe.evaluate(
      (element, size) => {
        const host = element as HTMLIFrameElement;
        Object.assign(host.parentElement!.style, {
          position: 'fixed',
          left: '0',
          top: '0',
          zIndex: '10000',
          width: `${size.width}px`,
          height: `${size.height}px`,
          overflow: 'visible',
        });
        Object.assign(host.style, { width: '1280px', height: '720px', transformOrigin: '0 0', transform: `scale(${size.width / 1280})` });
      },
      { width, height },
    );
    const box = await iframe.boundingBox();
    assert(box && Math.abs(box.width - width) < 1 && Math.abs(box.height - height) < 1, `actual presented size: ${JSON.stringify(box)}`);
    assert.equal(
      await frame.evaluate(() => window.__preservation.app.backend.backendType),
      values.backend,
      'requested backend cannot fall back',
    );

    return frame;
  };

  const checkFixture = async (page: Page, frame: Frame, fixture: string): Promise<unknown> => {
    if (fixture === 'application-loading') {
      await frame.waitForFunction(() => window.__preservation.app.scenes.currentScene?.constructor.name === 'PlayScene');
      const initial = await frame.evaluate(() => {
        const probe = window.__preservation;
        const loader = probe.app.loader;

        return {
          scenes: probe.scenes,
          progress: probe.progress,
          starts: probe.starts,
          completions: probe.completions,
          ready: probe.ready!(),
          listeners: [loader.onLoadStart.count, loader.onLoadProgress.count, loader.onLoadError.count, loader.onLoadComplete.count],
        };
      });
      assert.deepEqual(initial.scenes, ['BootScene', 'PlayScene']);
      assert.equal(initial.starts, 1, 'the first fetch emits one batch-start signal');
      assert.equal(initial.completions, 1, 'all four assets settle one batch');
      assert(initial.ready, JSON.stringify(initial));
      assert(
        initial.progress.some(([loaded, total]) => loaded === total && total > 0),
        'real loader progress reaches completion',
      );

      for (let cycle = 2; cycle <= 4; cycle++) {
        await frame.locator('canvas').first().focus();
        await page.keyboard.press('Space');
        await frame.waitForFunction(count => {
          const probe = window.__preservation;

          return (
            probe.scenes.filter(name => name === 'PlayScene').length === count &&
            probe.app.scenes.currentScene?.constructor.name === 'PlayScene'
          );
        }, cycle);
        const current = await frame.evaluate(() => {
          const probe = window.__preservation;
          const loader = probe.app.loader;

          return {
            scenes: probe.scenes,
            ready: probe.ready!(),
            listeners: [loader.onLoadStart.count, loader.onLoadProgress.count, loader.onLoadError.count, loader.onLoadComplete.count],
          };
        });
        assert.equal(current.scenes.filter(name => name === 'BootScene').length, cycle);
        assert(current.ready);
        assert.deepEqual(current.listeners, initial.listeners, 'warm navigation removes each departing BootScene listener');
      }

      return { initial, warmRoundTrips: 3 };
    }

    if (fixture === 'bitmap-layout') {
      const initial = await frame.evaluate(() => {
        const scene = window.__preservation.app.scenes.currentScene as unknown as FixtureScene;

        return {
          frame: scene.frame,
          counter: scene.counter.text,
          bounds: scene.wrapped.textBounds,
          maxWidth: scene.wrapped.layout.maxWidth,
          glyphs: scene.font.fontData.chars.size,
          pages: scene.font.textures.length,
          quads: scene.wrapped.pageQuads.length,
        };
      });
      assert.equal(initial.maxWidth, 760);
      assert(initial.glyphs > 0 && initial.pages > 0 && initial.quads > 0);
      await frame.waitForFunction(
        previous => (window.__preservation.app.scenes.currentScene as unknown as FixtureScene).frame > previous + 3,
        initial.frame,
      );
      const wrapped = await frame.evaluate(() => {
        const scene = window.__preservation.app.scenes.currentScene as unknown as FixtureScene;
        scene.wrapped.layout = { ...scene.wrapped.layout, maxWidth: 200 };

        return { bounds: scene.wrapped.textBounds, counter: scene.counter.text };
      });
      assert(
        wrapped.bounds.height > initial.bounds.height && wrapped.bounds.width <= 200 + 0.01,
        'narrowing the bitmap layout wraps into more lines',
      );
      assert.notEqual(wrapped.counter, initial.counter, 'counter advances through real frames');
      await frame.evaluate(() => {
        const scene = window.__preservation.app.scenes.currentScene as unknown as FixtureScene;
        scene.wrapped.layout = { ...scene.wrapped.layout, maxWidth: 760 };
      });

      return { initial, narrow: wrapped };
    }

    const result = await frame.evaluate(async () => {
      await document.fonts.ready;
      const scene = window.__preservation.app.scenes.currentScene as unknown as FixtureScene;

      return {
        fonts: [...document.fonts].map(face => ({ family: face.family, status: face.status })),
        labels: scene.labels.map(label => ({
          text: label.text,
          family: label.style.fontFamily,
          bounds: label.textBounds,
          quads: label.pageQuads.length,
          stops: label.style.gradient?.stops.length ?? 0,
          outline: label.style.outlineWidth,
          shadow: label.style.shadowAlpha,
          underline: label.style.underline,
        })),
      };
    });
    assert(
      result.fonts.some(font => font.family.replaceAll('"', '') === 'Kenney Future' && font.status === 'loaded'),
      'the requested font is loaded, not an unspecified fallback',
    );
    assert.equal(result.labels.length, 4);
    assert(
      result.labels.every(label => label.bounds.width > 0 && label.bounds.height > 0 && label.quads > 0),
      'all four labels produce glyph geometry',
    );
    assert.equal(result.labels[0].stops, 3);
    assert(result.labels[0].outline > 0 && result.labels[0].shadow > 0);
    assert.equal(result.labels[2].family, 'Kenney Future');
    assert.notEqual(result.labels[1].family, result.labels[2].family);
    assert(result.labels[3].underline && result.labels[3].shadow > 0);

    return result;
  };

  try {
    if (!values.only || values.only === 'http') {
      try {
        await checkHttp();
        record({
          name: 'original routes, aliases and runnable sources',
          coverage: 'http',
          status: 'PASS',
          checks: [
            '114 TS + 114 JS source responses; 111 original + 55 alias detail pages in each locale resolve to a current-version source link',
            'HTTP availability and resolution only; original applications were not instantiated',
          ],
        });
      } catch (error) {
        record({ name: 'original routes, aliases and runnable sources', coverage: 'http', status: 'FAIL', error: String(error) });
      }
    }

    for (const locale of values.only && values.only !== 'ui' ? [] : locales) {
      for (const kind of ['curriculum', 'tools']) {
        for (const [width, height] of sizes) {
          const page = await context.newPage();
          await page.setViewportSize({ width, height });
          const name = `${locale}-${kind}-${width}`;
          const errors: string[] = [];
          page.on('pageerror', error => errors.push(error.message));

          try {
            const evidence = await checkIndex(page, locale, kind);
            assert.deepEqual(errors, []);
            await capture(page, name);
            record({ name, coverage: 'site-ui', status: 'PASS', locale, size: `${width}x${height}`, evidence });
          } catch (error) {
            await capture(page, `${name}-failure`).catch(captureError => console.error(`Failure capture: ${String(captureError)}`));
            record({
              name,
              coverage: 'site-ui',
              status: 'FAIL',
              locale,
              size: `${width}x${height}`,
              error: String(error),
              console: errors,
            });
          } finally {
            await page.close();
          }
        }
      }
    }

    for (const fixture of fixtures.filter(fixture => !values.only || fixture === values.only)) {
      for (const [width, height] of sizes) {
        const page = await context.newPage();
        await page.setViewportSize({ width: 1440, height: 900 });
        const name = `${fixture}-${width}`;
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => {
          if (message.type() === 'error') {
            errors.push(message.text());
          }
        });

        try {
          const frame = await openFixture(page, fixture, width, height);
          await (await frame.frameElement()).screenshot({ path: resolve(output, `${prefix}-${name}-startup.png`), scale: 'css' });
          const evidence = await checkFixture(page, frame, fixture);
          await (await frame.frameElement()).screenshot({ path: resolve(output, `${prefix}-${name}-interaction.png`), scale: 'css' });
          assert.deepEqual(await frame.evaluate(() => window.__preservation.errors), [], 'application error channel');
          assert.deepEqual(errors, [], 'uncaught browser and console errors');
          await frame.evaluate(() => window.__preservation.app.destroy());
          record({ name: `guide-fixtures/${fixture}`, coverage: 'functional', status: 'PASS', size: `${width}x${height}`, evidence });
        } catch (error) {
          await capture(page, `${name}-failure`).catch(captureError => console.error(`Failure capture: ${String(captureError)}`));
          record({
            name: `guide-fixtures/${fixture}`,
            coverage: 'functional',
            status: 'FAIL',
            size: `${width}x${height}`,
            error: String(error),
            console: errors,
          });
        } finally {
          await page.unrouteAll({ behavior: 'wait' });
          await page.close();
        }
      }
    }
  } finally {
    const version = browser.version();
    await browser.close();
    await writeFile(resolve(output, `${prefix}-http.json`), `${JSON.stringify(http, null, 2)}\n`);
    await writeFile(
      resolve(output, `${prefix}-results.json`),
      `${JSON.stringify(
        {
          browser: values.browser,
          version,
          backend: values.backend,
          host,
          ready,
          limits: [
            'HTTP route/source checks do not certify the 111 original application contracts.',
            'Specialty hex/JPS/LUT/PCM/GPU-PCM/worker runtime contracts and known PR866 failures are NOT_TESTED by this runner.',
            'Screenshots capture glyph effects; geometry and style assertions are not a pixel-perfect visual comparison.',
            'Physical keyboard, touch, controller, IME and mobile keyboard hardware are NOT_TESTED.',
          ],
          records,
        },
        null,
        2,
      )}\n`,
    );
  }

  const expected = values.only === 'http' ? 1 : values.only === 'ui' ? 8 : values.only ? 2 : 15;
  assert(
    records.length === expected && records.every(entry => entry.status === 'PASS'),
    'one or more B7 preservation acceptance cases failed',
  );
}
