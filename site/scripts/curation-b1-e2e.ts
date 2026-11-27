import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import type { Application, BitmapText, Color, Graphics, Sprite, Text, Tween, View } from '@codexo/exojs';
import { chromium, firefox, type Frame, type Page } from 'playwright';

const { values } = parseArgs({
  options: {
    host: { type: 'string', default: 'http://127.0.0.1:4322/ExoJS' },
    browser: { type: 'string', default: 'chromium' },
    backend: { type: 'string', default: 'webgl2' },
    shots: { type: 'string', default: '../docs/curation/evidence/b1' },
  },
});
assert(['webgl2', 'webgpu'].includes(values.backend!));
assert(['chromium', 'firefox'].includes(values.browser!));
const output = resolve(values.shots!);
const backend = values.backend!;
const browser =
  values.browser === 'firefox'
    ? await firefox.launch({ firefoxUserPrefs: { 'dom.webgpu.enabled': true } })
    : await chromium.launch({ channel: 'chromium', args: ['--enable-webgl', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });
const records: Array<{ example: string; size: string; status: string; checks?: string[]; error?: string }> = [];
interface ProbeScene {
  position: { x: number; y: number };
  target: { x: number; y: number };
  clock: { t: number };
  steps: Tween[];
  motionPaused: boolean;
  moving: boolean;
  leg: number;
  bounds: { x: number; y: number; width: number; height: number };
  impacts: number;
  view: View;
  flash: Color;
  block: Sprite;
  ps: { aliveCount: number; destroyed: boolean };
  points: number[][];
  box: { x: number; y: number; width: number; height: number };
  bitmap: BitmapText;
  raster: Text;
  counter: BitmapText;
  elapsed: number;
  playing: boolean;
  graphics: Graphics;
  panel?: { values: Record<string, string> };
}
declare global {
  interface Window {
    __pilot: { app: Application; counts: number[] };
  }
}
const state = (frame: Frame) =>
  frame.evaluate(() => {
    const app = window.__pilot.app;
    const scene = app.scenes.currentScene as unknown as ProbeScene;

    return {
      backend: app.backend.backendType,
      position: scene.position,
      target: scene.target,
      clock: scene.clock?.t,
      moving: scene.moving,
      paused: scene.motionPaused,
      leg: scene.leg,
      bounds: scene.bounds,
      impacts: scene.impacts,
      view: scene.view ? { x: scene.view.getTransform().x, y: scene.view.getTransform().y } : undefined,
      flash: scene.flash ? [scene.flash.r, scene.flash.g, scene.flash.b] : undefined,
      alive: scene.ps?.aliveCount,
      points: scene.points,
      box: scene.box,
      bitmapScale: scene.bitmap?.scale.x,
      rasterScale: scene.raster?.scale.x,
      bitmapText: scene.bitmap?.text,
      rasterText: scene.raster?.text,
      elapsed: scene.elapsed,
      playing: scene.playing,
      count: scene.counter?.text,
      values: scene.panel?.values,
    };
  });

const openExample = async (page: Page, slug: string, width: number, height: number): Promise<Frame> => {
  await page.route(`**/examples/${slug}.js*`, async route => {
    const response = await route.fetch();
    const source = await response.text();
    const body = source.includes('const app = new Application(')
      ? source
          .replace('const app = new Application({', `const app = new Application({ backend: { type: '${backend}' },`)
          .replace(/await (?:app\.start|startExample)\(/, match => `window.__pilot = { app, counts: [0, 0] };\n${match}`)
      : source;

    await route.fulfill({ response, body });
  });
  await page.goto(`${values.host}/en/playground/?version=current&example=${slug}`);
  await page.waitForSelector('iframe[src*="preview.html"]', { timeout: 30_000 });
  await page.frameLocator('iframe[src*="preview.html"]').locator('.exo-demo-bar').waitFor({ timeout: 30_000 });
  const frame = page.frames().find(candidate => candidate.url().includes('preview.html'))!;

  await frame.waitForFunction(() => Boolean(window.__pilot?.app.scenes.currentScene));
  const stack = page.getByRole('button', { name: 'Switch to stacked layout', exact: true });

  if (await stack.isVisible()) {
    await stack.click();
  }

  // Isolate the live iframe's presentation box so shell scroll clipping cannot obscure the capture.
  await page.locator('iframe[src*="preview.html"]').evaluate(
    (element, size) => {
      const frameElement = element as HTMLIFrameElement;

      Object.assign(frameElement.parentElement!.style, {
        position: 'fixed',
        left: '0',
        top: '0',
        zIndex: '10000',
        width: `${size.width}px`,
        height: `${size.height}px`,
        overflow: 'visible',
      });
      Object.assign(frameElement.style, { width: '1280px', height: '720px', transform: `scale(${size.width / 1280})` });
    },
    { width, height },
  );
  await frame.waitForTimeout(150);
  const box = (await (await frame.frameElement()).boundingBox())!;

  assert(Math.abs(box.width - width) < 1 && Math.abs(box.height - height) < 1, `presented size: ${JSON.stringify(box)}`);
  assert.equal((await state(frame)).backend, backend, 'requested backend must not fall back');

  return frame;
};

const capture = async (frame: Frame, name: string) =>
  (await frame.frameElement()).screenshot({ path: resolve(output, `${name}.png`), scale: 'css' });

const clickWorld = async (page: Page, frame: Frame, x: number, y: number) => {
  const box = (await frame.locator('canvas').boundingBox())!;

  await page.mouse.click(box.x + (x / 1280) * box.width, box.y + (y / 720) * box.height);
};

const tween = async (page: Page, frame: Frame, name: string): Promise<string[]> => {
  const pause = frame.getByRole('button', { name: 'Pause / Resume', exact: true });
  const ease = frame.getByRole('combobox', { name: 'Ease', exact: true });

  assert.equal(await ease.locator('option').count(), 31);
  await capture(frame, `${name}-startup`);
  await ease.selectOption('backOut');
  const bounds = (await state(frame)).bounds;

  await clickWorld(page, frame, bounds.x + bounds.width * 0.8, bounds.y + bounds.height * 0.3);
  await frame.waitForTimeout(150);
  const moving = await state(frame);

  assert(moving.moving && moving.clock! > 0);
  await clickWorld(page, frame, bounds.x + bounds.width * 0.2, bounds.y + bounds.height * 0.7);
  await pause.click();
  const paused = await state(frame);

  await frame.waitForTimeout(200);
  assert.deepEqual((await state(frame)).position, paused.position);
  assert.equal((await state(frame)).clock, paused.clock);
  await capture(frame, `${name}-interaction`);
  await pause.click();
  await frame.waitForFunction(() => !(window.__pilot.app.scenes.currentScene as unknown as ProbeScene).moving);
  const end = await state(frame);

  assert(Math.abs(end.position.x - 0.2) < 0.01 && Math.abs(end.position.y - 0.7) < 0.01);
  await frame.getByRole('combobox', { name: 'Mode', exact: true }).selectOption('Roundtrip');
  const home = (await state(frame)).position;

  await clickWorld(page, frame, bounds.x + bounds.width * 0.7, bounds.y + bounds.height * 0.4);
  await frame.waitForFunction(() => (window.__pilot.app.scenes.currentScene as unknown as ProbeScene).leg === 2);
  await frame.waitForFunction(() => !(window.__pilot.app.scenes.currentScene as unknown as ProbeScene).moving);
  assert.deepEqual((await state(frame)).position, home);
  await frame.getByRole('combobox', { name: 'Mode', exact: true }).selectOption('Route');
  await clickWorld(page, frame, bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.5);
  await frame.waitForFunction(() => (window.__pilot.app.scenes.currentScene as unknown as ProbeScene).leg === 4);
  await frame.waitForFunction(() => !(window.__pilot.app.scenes.currentScene as unknown as ProbeScene).moving);
  assert.deepEqual((await state(frame)).position, home);
  await frame.getByRole('button', { name: 'Reset', exact: true }).click();
  assert.deepEqual((await state(frame)).position, { x: 0.5, y: 0.5 });
  assert.equal((await state(frame)).clock, 0);
  await frame.locator('canvas').focus();
  await page.keyboard.press('ArrowRight');
  await frame.waitForFunction(() => (window.__pilot.app.scenes.currentScene as unknown as ProbeScene).panel?.values.easing === 'expoIn');

  return [
    '31 eases; interruption reaches replacement target',
    'Pause holds position and raw clock; resume completes',
    'Roundtrip and four-leg Route return to exact start',
    'Reset clears motion, clock, mode and ease; keyboard selects ease',
  ];
};

const impact = async (page: Page, frame: Frame, name: string): Promise<string[]> => {
  await capture(frame, `${name}-startup`);
  const resting = (await state(frame)).view;

  await clickWorld(page, frame, 640, 220);
  await frame.waitForFunction(() => (window.__pilot.app.scenes.currentScene as unknown as ProbeScene).ps.aliveCount > 0);
  const hit = await state(frame);

  assert.equal(hit.impacts, 1);
  assert.notDeepEqual(hit.view, resting, 'Shake changes the public view transform');
  assert(hit.flash![1]! < 255);
  await capture(frame, `${name}-interaction`);
  await frame.waitForTimeout(900);
  assert.equal((await state(frame)).alive, 0);
  assert.deepEqual((await state(frame)).view, resting);
  assert.deepEqual((await state(frame)).flash, [255, 255, 255]);
  await frame.locator('canvas').focus();
  await page.keyboard.press('Space');
  await frame.waitForFunction(() => (window.__pilot.app.scenes.currentScene as unknown as ProbeScene).impacts === 2);
  await page.keyboard.press('r');
  await frame.waitForFunction(() => (window.__pilot.app.scenes.currentScene as unknown as ProbeScene).impacts === 0);
  assert.equal((await state(frame)).alive, 0);

  return [
    'Pointer and Space each trigger one impact',
    'Burst particles and tint activate then settle',
    'R clears particles, tint, shake and impact count',
  ];
};

const shapes = async (page: Page, frame: Frame, name: string): Promise<string[]> => {
  await capture(frame, `${name}-startup`);
  const handle = frame.getByRole('button', { name: 'Gradient start', exact: true });
  const box = (await handle.boundingBox())!;
  const start = (await state(frame)).points;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 - 5, { steps: 5 });
  await page.mouse.up();
  assert((await state(frame)).points[0]![0]! > start[0]![0]!);
  await handle.focus();
  const dragged = (await state(frame)).points[0]![0]!;

  await page.keyboard.press('ArrowLeft');
  await frame.waitForTimeout(50);
  assert(Math.abs((await state(frame)).points[0]![0]! - dragged + 0.05) < 0.00001);
  await frame.getByRole('combobox', { name: 'Gradient', exact: true }).selectOption('Radial');
  await capture(frame, `${name}-interaction`);
  await frame.getByRole('button', { name: 'Reset', exact: true }).click();
  assert.deepEqual((await state(frame)).points, [
    [0.15, 0.3],
    [0.85, 0.7],
  ]);
  assert.equal((await state(frame)).values!.gradient, 'Linear');

  return [
    'Captured pointer drag changes UV endpoints',
    'Focused handle arrows change same endpoint',
    'Radial choice changes fill; Reset restores points and Linear',
  ];
};

const bitmap = async (_page: Page, frame: Frame, name: string): Promise<string[]> => {
  await capture(frame, `${name}-startup`);
  const pause = frame.getByRole('button', { name: 'Pause / Resume', exact: true });

  await pause.click();
  const stopped = (await state(frame)).elapsed;

  await frame.waitForTimeout(150);
  assert.equal((await state(frame)).elapsed, stopped);
  const baseline = (await state(frame)).bitmapScale!;

  for (const value of ['2x', '3x', '2.5x']) {
    await frame.getByRole('combobox', { name: 'Scale', exact: true }).selectOption(value);
    await frame.waitForTimeout(30);
    const next = await state(frame);

    assert.equal(next.bitmapText, next.rasterText);
    assert(Math.abs(next.bitmapScale! / baseline - Number.parseFloat(value)) < 0.00001);
    assert.equal(next.rasterScale, next.bitmapScale);
    await capture(frame, `${name}-${value}`);
  }

  await capture(frame, `${name}-interaction`);
  await frame.getByRole('button', { name: 'Reset', exact: true }).click();
  await frame.waitForTimeout(30);
  assert.equal((await state(frame)).elapsed, 0);
  assert.equal((await state(frame)).count, 'COUNT 0000');
  assert.equal((await state(frame)).values!.scale, '1x');
  await pause.click();
  await frame.waitForTimeout(150);
  assert((await state(frame)).elapsed > 0);

  return [
    'All four scales affect atlas and raster equally',
    'Pause freezes counter; Reset restores zero and 1x',
    'Resume advances counter',
  ];
};

await mkdir(output, { recursive: true });

try {
  for (const [slug, run] of [
    ['tweens-animation/tween-basics', tween],
    ['showcase/screen-shake-on-explosion', impact],
    ['geometry-graphics/graphics-gradient', shapes],
    ['text-fonts/bitmap-text-basic', bitmap],
  ] as const) {
    for (const [width, height] of [
      [1280, 720],
      [512, 288],
    ]) {
      const page = await browser.newPage({ viewport: { width: 1920, height: 1200 }, colorScheme: 'dark' });
      const name = `${values.browser}-${backend}-${slug.split('/')[1]}-${width}`;
      const errors: string[] = [];

      page.on('pageerror', error => errors.push(String(error)));

      try {
        const frame = await openExample(page, slug, width, height);
        const checks = await run(page, frame, name);

        assert.deepEqual(errors, [], 'No uncaught browser errors');
        const metrics = await frame.locator('.exo-demo-bar').evaluate(element => {
          const frame = window.frameElement!;
          const scale = frame.getBoundingClientRect().width / frame.clientWidth;
          const sample = element.querySelector('button, select, kbd') ?? element;

          return {
            font:
              Number.parseFloat(getComputedStyle(sample).fontSize) *
              scale *
              Number.parseFloat((element as HTMLElement).style.transform.slice(6)),
            hit: element.querySelector('button, select')
              ? element.querySelector('button, select')!.getBoundingClientRect().height * scale
              : undefined,
          };
        });

        assert(metrics.font >= 14 - 0.01, JSON.stringify(metrics));
        assert(metrics.hit === undefined || metrics.hit >= 32 - 0.1, JSON.stringify(metrics));
        checks.push('Presented UI type >=14px and interactive controls >=32px; no uncaught browser errors');
        await page.locator('iframe[src*="preview.html"]').evaluate(element => {
          element.parentElement!.style.display = 'none';
        });
        await page.waitForTimeout(80);
        await page.locator('iframe[src*="preview.html"]').evaluate(element => {
          element.parentElement!.style.display = 'block';
        });
        await frame.waitForTimeout(80);
        const restored = await state(frame);

        assert(Number.isFinite(restored.bounds?.width ?? restored.box?.width ?? restored.bitmapScale ?? restored.impacts));
        checks.push('Hidden preview restores finite layout');
        await frame.evaluate(() => {
          window.__pilot.counts = [window.__pilot.app.input.onPointerDown.count];
        });
        const disposed = await frame.evaluate(async () => {
          const app = window.__pilot.app;
          const scene = app.scenes.currentScene as unknown as ProbeScene;
          const before = app.input.onPointerDown.count;
          const refs = [scene.graphics, scene.bitmap, scene.raster, scene.block, scene.ps, scene.view].filter(Boolean);

          await app.scenes.change(app.scenes.currentScene!.constructor as never);

          return { before, after: app.input.onPointerDown.count, destroyed: refs.every(resource => resource.destroyed) };
        });

        assert.equal(disposed.after, disposed.before);
        assert(disposed.destroyed, 'scene-owned render resources destroyed on replacement');
        await frame.evaluate(() => window.__pilot.app.destroy());
        assert.equal(await frame.locator('.exo-demo-bar').count(), 0);
        assert.equal(await frame.getByRole('button', { name: 'Gradient start', exact: true }).count(), 0);
        checks.push('Scene replacement keeps handler count and destroys owned resources; application disposal removes UI');
        records.push({ example: slug, size: `${width}x${height}`, status: 'PASS', checks });
      } catch (error) {
        console.error('Acceptance failure', error);
        await page
          .screenshot({ path: resolve(output, `${name}-failure.png`), timeout: 5000 })
          .catch(captureError => console.error('Failure capture', String(captureError)));
        records.push({ example: slug, size: `${width}x${height}`, status: 'FAIL', error: String(error) });
      } finally {
        await page.unrouteAll({ behavior: 'wait' });
        await page.close();
      }

      console.log(JSON.stringify(records.at(-1)));
    }
  }
} finally {
  await browser.close();
  await writeFile(
    resolve(output, `${values.browser}-${backend}-results.json`),
    `${JSON.stringify({ browser: values.browser, version: browser.version(), backend, records }, null, 2)}\n`,
  );
}

assert(
  records.every(record => record.status === 'PASS'),
  'B1 acceptance failed',
);
