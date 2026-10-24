import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import type { AnimatedSprite, Application, Text } from '@codexo/exojs';
import { chromium, firefox, type Frame, type Page } from 'playwright';

const { values } = parseArgs({
  options: {
    host: { type: 'string', default: 'http://127.0.0.1:4321/ExoJS' },
    browser: { type: 'string', default: 'chromium' },
    backend: { type: 'string', default: 'webgl2' },
    shots: { type: 'string', default: '.workspace/playground-curation-pilot' },
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
  clips: AnimatedSprite[];
  clipTime: number;
  playing: boolean;
  body: Text;
  title: Text;
  width: number;
  scale: number;
  panel: { values: { fps: number; font: string; wrap: string; heading: string } };
}

declare global {
  interface Window {
    __pilot: { app: Application; counts: number[] };
  }
}

const state = (frame: Frame) =>
  frame.evaluate(() => {
    const probe = window.__pilot;
    const scene = probe.app.scenes.currentScene as unknown as ProbeScene;

    return {
      backend: probe.app.backend.backendType,
      frames: scene.clips?.map(clip => clip.currentFrame),
      counts: probe.counts,
      time: scene.clipTime,
      playing: scene.playing,
      fps: scene.panel.values.fps,
      width: scene.width,
      scale: scene.scale,
      lines: scene.body
        ? Math.round(scene.body.textBounds.height / (scene.body.style.fontSize * scene.body.style.lineHeight + scene.body.style.leading))
        : undefined,
      advance: scene.body?.textBounds.width,
      font: scene.body?.style.fontFamily,
      layout: scene.body?.layout,
      heading: scene.title?.text,
      headingStyle: scene.title
        ? { outline: scene.title.style.outlineWidth, shadow: scene.title.style.shadowAlpha, gradient: scene.title.style.gradient }
        : undefined,
    };
  });

const openExample = async (page: Page, slug: string, width: number, height: number): Promise<Frame> => {
  await page.route(`**/examples/${slug}.js*`, async route => {
    const response = await route.fetch();
    const source = await response.text();
    const body = source.includes('const app = new Application(')
      ? source
          .replace('const app = new Application({', `const app = new Application({ backend: { type: '${backend}' },`)
          .replace('await app.start(', 'window.__pilot = { app, counts: [0, 0] };\nawait app.start(')
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

const capture = async (frame: Frame, name: string) => (await frame.frameElement()).screenshot({ path: resolve(output, `${name}.png`) });

const animation = async (page: Page, frame: Frame, name: string): Promise<string[]> => {
  const checks: string[] = [];
  const pause = frame.getByRole('button', { name: 'Pause / Resume', exact: true });

  await capture(frame, `${name}-startup`);
  await pause.click();
  await frame.getByRole('button', { name: 'Reset', exact: true }).click();
  assert.deepEqual((await state(frame)).frames, [0, 0]);
  const fps = frame.getByRole('slider', { name: 'Your fps' });

  await fps.fill('16');
  await fps.dispatchEvent('input');

  for (let step = 0; step < 3; step++) {
    await frame.getByRole('button', { name: '+0.1 s', exact: true }).click();
  }

  assert.deepEqual((await state(frame)).frames, [2, 4]);
  assert(Math.abs((await state(frame)).time - 0.3) < 0.00001);
  checks.push('reset frame 1; three shared 0.1s steps produce frames 3/8 and 5/8');
  await capture(frame, `${name}-interaction`);
  const paused = await state(frame);

  await frame.waitForTimeout(600);
  assert.deepEqual((await state(frame)).frames, paused.frames);
  assert.equal((await state(frame)).time, paused.time);
  checks.push('paused: no frame or clock advancement over 0.6s');
  await frame.evaluate(() => {
    const probe = window.__pilot;
    const scene = probe.app.scenes.currentScene as unknown as ProbeScene;

    scene.clips.forEach((clip, index) => clip.onFrame.add(() => probe.counts[index]!++));
  });
  await pause.click();
  const start = await state(frame);

  await frame.waitForFunction(startTime => {
    const scene = window.__pilot.app.scenes.currentScene as unknown as ProbeScene;

    return scene.clipTime - startTime >= 4;
  }, start.time);
  await pause.click();
  const end = await state(frame);
  const elapsed = end.time - start.time;

  assert(Math.abs(end.counts[0]! - elapsed * 8) <= 1);
  assert(Math.abs(end.counts[1]! - elapsed * 16) <= 1);
  checks.push(`${elapsed.toFixed(3)}s clip time: ${end.counts.join('/')} onFrame events at 8/16fps`);
  await (await frame.locator('canvas').elementHandle())!.focus();
  await page.keyboard.press('ArrowRight');
  await frame.waitForFunction(() => (window.__pilot.app.scenes.currentScene as unknown as ProbeScene).panel.values.fps === 17);
  await page.keyboard.press('r');
  await frame.waitForFunction(() => (window.__pilot.app.scenes.currentScene as unknown as ProbeScene).panel.values.fps === 8);
  checks.push('keyboard arrows and R update the same control state');

  return checks;
};

const textLayout = async (page: Page, frame: Frame, name: string): Promise<string[]> => {
  const checks: string[] = [];

  await frame.getByText('Space Grotesk loaded', { exact: false }).waitFor();
  await capture(frame, `${name}-startup`);
  const handle = frame.getByRole('slider', { name: 'Wrap width' });
  const start = await state(frame);
  const readout = await frame.locator('.exo-demo-status').innerText();
  const lineCounts = /\| (\d+) of (\d+) lines/.exec(readout)!;

  assert.equal(start.layout?.overflow, 'ellipsis');

  if (name.endsWith('-512')) {
    assert(Number(lineCounts[1]) < Number(lineCounts[2]), readout);
    assert((start.layout?.maxHeight ?? 0) > 0);
  }

  const box = (await handle.boundingBox())!;

  await page.mouse.move(box.x + 16, box.y + 16);
  await page.mouse.down();
  await page.mouse.move(box.x - 120, box.y + 16, { steps: 8 });
  await page.mouse.up();
  await frame.waitForTimeout(80);
  assert((await state(frame)).width < start.width - 100, `drag did not change width: ${JSON.stringify(await state(frame))}`);
  await handle.focus();
  const dragWidth = (await state(frame)).width;

  await page.keyboard.press('ArrowLeft');
  await frame.waitForTimeout(80);
  assert.equal((await state(frame)).width, dragWidth - 20);
  checks.push('captured pointer drag and keyboard change wrap width');
  await frame.getByRole('combobox', { name: 'Font', exact: true }).selectOption('Kenney Future');
  await frame.getByRole('combobox', { name: 'Wrap', exact: true }).selectOption('Words');
  await frame.waitForTimeout(80);
  const words = await state(frame);

  await frame.getByRole('combobox', { name: 'Wrap', exact: true }).selectOption('Break words');
  await frame.waitForTimeout(80);
  const broken = await state(frame);

  assert(broken.advance <= broken.width * broken.scale + 1);
  assert(words.advance > broken.advance, 'unbroken token must visibly overflow the wrap edge');
  await frame.getByRole('combobox', { name: 'Wrap', exact: true }).selectOption('No wrap');
  await frame.waitForTimeout(80);
  assert.equal((await state(frame)).lines, 1);
  checks.push('Words overflow, Break words fits, No wrap has exactly one line');

  for (const heading of ['Outline', 'Shadow', 'Gradient']) {
    await frame.getByRole('combobox', { name: 'Heading', exact: true }).selectOption(heading);
    await frame.waitForTimeout(50);
    assert.equal((await state(frame)).heading, heading);
    const style = (await state(frame)).headingStyle!;

    assert.equal(style.outline > 0, heading === 'Outline');
    assert.equal(style.shadow > 0, heading === 'Shadow');
    assert.equal(style.gradient !== null, heading === 'Gradient');
    await capture(frame, `${name}-${heading.toLowerCase()}`);
  }

  await frame.getByRole('combobox', { name: 'Font', exact: true }).selectOption('Missing file');
  await frame.getByText('File failed', { exact: false }).waitFor();
  assert.equal((await state(frame)).font, 'Missing Example Font');
  await capture(frame, `${name}-interaction`);
  checks.push('heading styles; genuine missing-font request shows fallback warning');
  await frame.getByRole('button', { name: 'Reset', exact: true }).click();
  await frame.waitForTimeout(80);
  assert.equal((await state(frame)).heading, 'Plain');
  assert.equal((await state(frame)).font, 'Space Grotesk');
  assert.equal(await frame.getByRole('combobox', { name: 'Wrap', exact: true }).inputValue(), 'Words');
  assert.equal((await state(frame)).width, start.width);
  checks.push('Reset restores all four parameters');

  return checks;
};

await mkdir(output, { recursive: true });

try {
  for (const [slug, run] of [
    ['tweens-animation/frame-animation', animation],
    ['text-fonts/typographic-styling', textLayout],
  ] as const) {
    for (const [width, height] of [
      [1280, 720],
      [512, 288],
    ]) {
      const page = await browser.newPage({ viewport: { width: 1920, height: 1200 }, colorScheme: 'dark' });
      const name = `${values.browser}-${backend}-${slug.split('/')[1]}-${width}`;

      try {
        const frame = await openExample(page, slug, width!, height!);
        const checks = await run(page, frame, name);
        const metrics = await frame.locator('.exo-demo-bar').evaluate(element => {
          const frameElement = window.frameElement!;
          const scale = frameElement.getBoundingClientRect().height / frameElement.clientHeight;
          const button = element.querySelector('button')!;

          return {
            font: Number.parseFloat(getComputedStyle(button).fontSize) * scale * Number.parseFloat(element.style.transform.slice(6)),
            height: button.getBoundingClientRect().height * scale,
          };
        });

        assert(metrics.font >= 14 && metrics.height >= 32 - 0.1, JSON.stringify(metrics));
        checks.push('presented controls >=14px type and >=32px hit area');
        await frame.evaluate(() => window.__pilot.app.destroy());
        assert.equal(await frame.locator('.exo-demo-bar').count(), 0);
        checks.push('application disposal removes controls');
        records.push({ example: slug, size: `${width}x${height}`, status: 'PASS', checks });
      } catch (error) {
        await page.screenshot({ path: resolve(output, `${name}-failure.png`) });
        records.push({ example: slug, size: `${width}x${height}`, status: 'FAIL', error: String(error) });
      } finally {
        await page.unrouteAll({ behavior: 'wait' });
        await page.close();
      }

      console.log(JSON.stringify(records.at(-1)));
    }
  }

  const detached = await browser.newPage({ viewport: { width: 512, height: 288 } });

  try {
    await detached.route('**/examples/text-fonts/typographic-styling.js', async route => {
      const response = await route.fetch();
      const source = (await response.text()).replace(
        'const app = new Application({',
        `const app = new Application({ backend: { type: '${backend}' },`,
      );

      await route.fulfill({ response, body: source });
    });
    await detached.goto(`${values.host}/preview.html?v=current`);
    await detached.addScriptTag({ type: 'module', content: `import '${values.host}/examples/text-fonts/typographic-styling.js';` });
    await detached.getByText('Space Grotesk loaded', { exact: false }).waitFor({ timeout: 30_000 });
    assert(
      await detached.evaluate(() =>
        [...document.fonts].some(face => face.family.replace(/^['"]|['"]$/g, '') === 'Space Grotesk' && face.status === 'loaded'),
      ),
    );
    await detached.screenshot({ path: resolve(output, `${values.browser}-${backend}-text-detached-512.png`) });
    records.push({
      example: 'text-fonts/typographic-styling',
      size: 'detached 512x288',
      status: 'PASS',
      checks: ['default website font loaded without a parent document'],
    });
  } catch (error) {
    records.push({ example: 'text-fonts/typographic-styling', size: 'detached 512x288', status: 'FAIL', error: String(error) });
  } finally {
    await detached.unrouteAll({ behavior: 'wait' });
    await detached.close();
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
  'pilot acceptance failed',
);
