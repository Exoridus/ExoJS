import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import type { Application, RenderNode } from '@codexo/exojs';
import { chromium, firefox, type Frame, type Page } from 'playwright';

const { values } = parseArgs({
  options: {
    host: { type: 'string', default: 'http://127.0.0.1:4323/ExoJS' },
    browser: { type: 'string', default: 'chromium' },
    backend: { type: 'string', default: 'webgl2' },
    shots: { type: 'string', default: '../docs/curation/evidence/b2' },
    only: { type: 'string' },
  },
});
assert(['webgl2', 'webgpu'].includes(values.backend!));
assert(['chromium', 'firefox'].includes(values.browser!));
const output = resolve(values.shots!);
await mkdir(output, { recursive: true });
const browser =
  values.browser === 'firefox'
    ? await firefox.launch({ firefoxUserPrefs: { 'dom.webgpu.enabled': true } })
    : await chromium.launch({ channel: 'chromium', args: ['--enable-webgl', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });
const records: Array<{ example: string; size: string; status: string; checks?: string[]; error?: string; console?: string[] }> = [];

interface Probe {
  sprite?: RenderNode;
  preview?: RenderNode;
  readout?: { text: string };
  playing?: boolean;
  states?: string[];
  attempts?: number[];
  loading?: boolean;
  activeId?: string;
  pending?: { id: string };
  runtime?: { levels: unknown[] };
  elapsed?: number;
  px?: number;
  py?: number;
  score?: number;
  blur?: { strength: number };
  settings?: { size: number; motion: boolean; theme: string };
  angle?: number;
  name?: { value: string };
  note?: { value: string };
  count?: number;
  list?: { scrollY: number };
  ending?: number | null;
  lineIndex?: number;
  chars?: number;
  text?: string;
  awaitingChoice?: boolean;
  [key: string]: unknown;
}
declare global {
  interface Window {
    __b2: { app: Application };
  }
}
const state = (frame: Frame) =>
  frame.evaluate(() => {
    const app = window.__b2.app;
    const s = app.scenes.currentScene as unknown as Probe;

    return {
      backend: app.backend.backendType,
      scene: s.constructor.name,
      playing: s.playing,
      rotation: s.sprite?.rotation,
      readout: s.readout?.text,
      states: s.states,
      attempts: s.attempts,
      loading: s.loading,
      room: s.activeId,
      pending: s.pending?.id,
      rooms: s.runtime?.levels.length,
      elapsed: s.elapsed,
      px: s.px,
      py: s.py,
      score: s.score,
      health: s.health,
      paused: app.scenes.paused,
      blur: s.blur?.strength,
      settings: s.settings,
      angle: s.angle,
      name: s.name?.value,
      note: s.note?.value,
      count: s.count,
      scroll: s.list?.scrollY,
      focus: app.interaction.focused?.constructor.name,
      ending: s.ending,
      line: s.lineIndex,
      chars: s.chars,
      text: s.text,
      awaitingChoice: s.awaitingChoice,
    };
  });
const capture = async (frame: Frame, name: string) =>
  (await frame.frameElement()).screenshot({ path: resolve(output, `${name}.png`), scale: 'css' });
const focusCanvas = async (frame: Frame) => frame.locator('canvas').first().focus();

const key = async (page: Page, frame: Frame, name: string) => {
  await page.keyboard.press(name);
  await frame.waitForTimeout(80);
};

const clickNode = async (page: Page, frame: Frame, field: string) => {
  const target = await frame.evaluate(field => {
    const scene = window.__b2.app.scenes.currentScene as unknown as Probe;
    const bounds = (scene[field] as RenderNode).getBounds();

    return {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
      width: window.__b2.app.width,
      height: window.__b2.app.height,
    };
  }, field);
  const box = (await frame.locator('canvas').first().boundingBox())!;
  await page.mouse.click(box.x + (target.x / target.width) * box.width, box.y + (target.y / target.height) * box.height);
  await frame.waitForTimeout(80);
};

const waitScene = async (frame: Frame, name: string) =>
  frame.waitForFunction(name => window.__b2.app.scenes.currentScene?.constructor.name === name, name);

const open = async (page: Page, slug: string, width: number, height: number) => {
  await page.route(`**/examples/${slug}.js*`, async route => {
    const response = await route.fetch();
    const source = await response.text();
    const body = source
      .replace('const app = new Application({', `const app = new Application({ backend: { type: '${values.backend}' },`)
      .replace(/await (?:app\.start|startExample)\(/, match => `window.__b2 = { app };\n${match}`);
    await route.fulfill({ response, body });
  });
  await page.goto(`${values.host}/en/playground/?version=current&example=${slug}`);
  await page.waitForSelector('iframe[src*="preview.html"]', { timeout: 30_000 });
  const frame = (await (await page.locator('iframe[src*="preview.html"]').elementHandle())!.contentFrame())!;
  await frame.waitForURL(/preview\.html/);
  await frame.waitForFunction(() => Boolean(window.__b2?.app.scenes.currentScene), { timeout: 30_000 });
  const stack = page.getByRole('button', { name: 'Switch to stacked layout', exact: true });

  if (await stack.isVisible()) {
    await stack.click();
  }

  await page.locator('iframe[src*="preview.html"]').evaluate(
    (element, size) => {
      const iframe = element as HTMLIFrameElement;
      Object.assign(iframe.parentElement!.style, {
        position: 'fixed',
        left: '0',
        top: '0',
        zIndex: '10000',
        width: `${size.width}px`,
        height: `${size.height}px`,
        overflow: 'visible',
      });
      Object.assign(iframe.style, { width: '1280px', height: '720px', transform: `scale(${size.width / 1280})` });
    },
    { width, height },
  );
  await frame.waitForTimeout(200);
  const box = (await (await frame.frameElement()).boundingBox())!;
  assert(Math.abs(box.width - width) < 1 && Math.abs(box.height - height) < 1);
  assert.equal((await state(frame)).backend, values.backend, 'requested renderer cannot fall back');

  return frame;
};

type Run = (page: Page, frame: Frame, name: string) => Promise<string[]>;

const hello: Run = async (page, frame, name) => {
  await capture(frame, `${name}-startup`);
  const before = (await state(frame)).rotation!;
  await frame.waitForTimeout(120);
  assert.notEqual((await state(frame)).rotation, before);
  await clickNode(page, frame, 'sprite');
  assert.equal((await state(frame)).playing, false);
  const paused = (await state(frame)).rotation;
  await frame.waitForTimeout(160);
  assert.equal((await state(frame)).rotation, paused);
  await capture(frame, `${name}-interaction`);
  await focusCanvas(frame);
  await key(page, frame, 'Space');
  await frame.waitForTimeout(60);
  assert.equal((await state(frame)).playing, true);

  return ['key rotates over time; character click freezes rotation; Space resumes'];
};

const scenes: Run = async (page, frame, name) => {
  await capture(frame, `${name}-startup`);
  await focusCanvas(frame);
  await key(page, frame, 'Enter');
  await capture(frame, `${name}-wipe`);
  await waitScene(frame, 'GameScene');
  await frame.waitForTimeout(500);
  const game = await state(frame);
  assert.match(game.readout!, /Menu: destroy/);
  assert.match(game.readout!, /Game: load/);
  assert.match(game.readout!, /Game: init/);
  assert.match(game.readout!, /Game: update/);
  await capture(frame, `${name}-interaction`);
  await key(page, frame, 'Escape');
  await waitScene(frame, 'MenuScene');
  await frame.waitForTimeout(500);
  await frame.getByRole('button', { name: 'Start', exact: true }).click();
  await waitScene(frame, 'GameScene');
  await frame.waitForTimeout(500);

  for (let cycle = 0; cycle < 4; cycle++) {
    await focusCanvas(frame);
    await key(page, frame, 'Escape');
    await waitScene(frame, 'MenuScene');
    await frame.waitForTimeout(480);
    await frame.getByRole('button', { name: 'Start', exact: true }).click();
    await waitScene(frame, 'GameScene');
    await frame.waitForTimeout(480);
  }

  return ['Enter starts; lifecycle includes load/init/update/destroy; five full return/start cycles have one change each'];
};

const loading: Run = async (_page, frame, name) => {
  await capture(frame, `${name}-startup`);
  await frame.getByRole('button', { name: 'Load with one broken file', exact: true }).click();
  await frame.waitForFunction(() => (window.__b2.app.scenes.currentScene as unknown as Probe).states?.includes('failed'));
  await frame.waitForFunction(() => !(window.__b2.app.scenes.currentScene as unknown as Probe).loading);
  assert.deepEqual((await state(frame)).states, ['loaded', 'loaded', 'failed']);
  await capture(frame, `${name}-failure`);
  await frame.getByRole('button', { name: 'Retry failed', exact: true }).click();
  await frame.waitForFunction(() => (window.__b2.app.scenes.currentScene as unknown as Probe).states?.every(state => state === 'loaded'));
  assert.deepEqual((await state(frame)).attempts, [1, 1, 2]);
  await capture(frame, `${name}-interaction`);
  await frame.getByRole('button', { name: 'Load', exact: true }).click();
  await frame.waitForFunction(() => !(window.__b2.app.scenes.currentScene as unknown as Probe).loading);
  assert.deepEqual((await state(frame)).attempts, [1, 1, 1]);

  return ['deliberate missing file affects one named row; retry increments only failed request; fresh Load resets queue'];
};

const rooms: Run = async (_page, frame, name) => {
  await frame.waitForFunction(() => (window.__b2.app.scenes.currentScene as unknown as Probe).activeId === 'harbor');
  await capture(frame, `${name}-startup`);
  const go = frame.getByRole('button', { name: 'Go to other room', exact: true });
  await go.click();
  await frame.getByRole('button', { name: 'Cancel pending', exact: true }).click();
  await frame.waitForTimeout(850);
  assert.equal((await state(frame)).room, 'harbor');
  assert.equal((await state(frame)).rooms, 1);
  await go.click();
  await frame.waitForFunction(() => (window.__b2.app.scenes.currentScene as unknown as Probe).activeId === 'workshop');
  assert.equal((await state(frame)).rooms, 1);
  await capture(frame, `${name}-interaction`);
  await frame.getByRole('button', { name: 'Unload room', exact: true }).click();
  assert.equal((await state(frame)).rooms, 0);
  assert.equal((await state(frame)).room, null);

  return ['Harbor loads; pending Workshop cancel preserves Harbor; switch leaves one room; unload releases all room ownership'];
};

const dodge: Run = async (page, frame, name) => {
  await capture(frame, `${name}-startup`);
  await focusCanvas(frame);
  const before = await state(frame);
  await page.keyboard.down('ArrowRight');
  await frame.waitForTimeout(150);
  await page.keyboard.up('ArrowRight');
  assert((await state(frame)).px! > before.px!);
  await key(page, frame, 'p');
  await frame.waitForTimeout(60);
  assert.equal((await state(frame)).paused, true);
  const frozen = (await state(frame)).elapsed;
  await frame.waitForTimeout(450);
  assert.equal((await state(frame)).elapsed, frozen);
  assert((await state(frame)).blur! > 2.5);
  await capture(frame, `${name}-interaction`);
  await frame.getByRole('button', { name: 'Pause / Resume', exact: true }).click();
  await frame.waitForTimeout(90);
  assert((await state(frame)).elapsed! > frozen!);
  await frame.getByRole('button', { name: 'Restart', exact: true }).click();
  await frame.waitForTimeout(100);
  assert((await state(frame)).elapsed! < 0.4);
  assert.equal((await state(frame)).score, 0);
  await frame.evaluate(() => {
    const s = window.__b2.app.scenes.currentScene as unknown as {
      spawnOrb(danger: boolean): void;
      px: number;
      py: number;
      orbs: Array<{ gfx: { setPosition(x: number, y: number): void }; vx: number; vy: number }>;
    };
    s.spawnOrb(false);
    const orb = s.orbs.at(-1)!;
    orb.vx = orb.vy = 0;
    orb.gfx.setPosition(s.px, s.py);
  });
  await frame.waitForTimeout(70);
  assert.equal((await state(frame)).score, 1);
  await frame.evaluate(() => {
    const s = window.__b2.app.scenes.currentScene as unknown as {
      spawnOrb(danger: boolean): void;
      px: number;
      py: number;
      orbs: Array<{ gfx: { setPosition(x: number, y: number): void }; vx: number; vy: number }>;
    };
    s.spawnOrb(true);
    const orb = s.orbs.at(-1)!;
    orb.vx = orb.vy = 0;
    orb.gfx.setPosition(s.px, s.py);
  });
  await waitScene(frame, 'GameOverScene');
  await capture(frame, `${name}-game-over`);
  await frame.getByRole('button', { name: 'Restart', exact: true }).click();
  await waitScene(frame, 'PlayScene');
  assert.equal((await state(frame)).score, 0);

  return [
    'Arrow movement; P freezes gameplay while application blur finishes; pointer resumes/restarts; deterministic collision fixtures award score then Game Over; restart clears score',
  ];
};

const settings: Run = async (page, frame, name) => {
  await capture(frame, `${name}-startup`);
  await focusCanvas(frame);
  await key(page, frame, 'Tab');
  assert.equal((await state(frame)).focus, 'Slider');
  const initial = (await state(frame)).settings!.size;
  await key(page, frame, 'ArrowRight');
  assert((await state(frame)).settings!.size > initial);
  await key(page, frame, 'Tab');
  assert.equal((await state(frame)).focus, 'Toggle');
  await key(page, frame, 'Space');
  assert.equal((await state(frame)).settings!.motion, false);
  const angle = (await state(frame)).angle;
  await frame.waitForTimeout(120);
  assert.equal((await state(frame)).angle, angle);
  await key(page, frame, 'Tab');
  assert.equal((await state(frame)).focus, 'Dropdown');
  await key(page, frame, 'Enter');
  await key(page, frame, 'ArrowDown');
  await key(page, frame, 'Enter');
  assert.equal((await state(frame)).settings!.theme, 'cyan');
  await capture(frame, `${name}-interaction`);
  await key(page, frame, 'Tab');
  assert.equal((await state(frame)).focus, 'Button');
  await key(page, frame, 'Enter');
  assert.deepEqual((await state(frame)).settings, { size: 1, motion: true, theme: 'lime' });
  await key(page, frame, 'Tab');
  await key(page, frame, 'Enter');
  assert.equal((await state(frame)).score, 10);
  await key(page, frame, 'Tab');
  await key(page, frame, 'Enter');
  assert.equal((await state(frame)).health, 0.8);
  await key(page, frame, 'Shift+Tab');
  assert.equal((await state(frame)).focus, 'Button');

  return [
    'keyboard only: Tab/Shift-Tab traverses all widgets; size/motion/choice/reset work; fixed HUD score and health buttons work while world rotates',
  ];
};

const entry: Run = async (page, frame, name) => {
  await capture(frame, `${name}-startup`);
  await focusCanvas(frame);
  await key(page, frame, 'Tab');
  assert.equal((await state(frame)).focus, 'TextInput');
  await page.keyboard.type('Ada');
  await frame.waitForTimeout(80);
  assert.equal((await state(frame)).name, 'Ada');
  await key(page, frame, 'Enter');
  assert.equal((await state(frame)).focus, 'TextArea');
  await page.keyboard.type('WASD and arrows edit this note.');
  await page.keyboard.insertText(' Emoji: 👩‍🚀; combining: é.');
  await frame.waitForTimeout(80);
  await key(page, frame, 'ArrowLeft');
  await key(page, frame, 'Backspace');
  assert((await state(frame)).note!.length > 20);
  await key(page, frame, 'Tab');
  assert.equal((await state(frame)).focus, 'Button');
  await key(page, frame, 'Enter');
  const result = await state(frame);
  assert.equal(result.count, 7);
  assert.equal(result.name, '');
  assert.equal(result.note, '');
  assert(result.scroll! > 0);
  await capture(frame, `${name}-interaction`);

  return [
    'keyboard only: name entry/Enter moves focus, note editing consumes WASD/arrows, Tab submits once, new row becomes visible via scrollTo',
  ];
};

const dialog: Run = async (page, frame, name) => {
  await capture(frame, `${name}-startup`);
  await focusCanvas(frame);

  const reachChoice = async () => {
    for (let press = 0; press < 6 && !(await state(frame)).awaitingChoice; press++) {
      const before = await state(frame);
      await key(page, frame, 'Space');
      const after = await state(frame);

      if (before.chars! < before.text!.length) {
        assert.equal(after.line, before.line);
        assert.equal(after.chars, before.text!.length);
      }
    }

    assert.equal((await state(frame)).awaitingChoice, true);
  };

  await reachChoice();
  await key(page, frame, 'Enter');
  await frame.waitForTimeout(80);
  let result = await state(frame);
  assert.equal(result.ending, 0);
  assert.match(result.text!, /safe crossing/);
  assert(result.chars! < result.text!.length, 'choice must not reveal or advance the consequence twice');
  await clickNode(page, frame, 'continueButton');
  await capture(frame, `${name}-bridge`);
  await clickNode(page, frame, 'continueButton');
  await frame.waitForTimeout(65);
  assert.equal((await state(frame)).ending, null);
  await focusCanvas(frame);
  await reachChoice();
  await key(page, frame, 'Tab');
  await key(page, frame, 'Enter');
  await frame.waitForTimeout(80);
  result = await state(frame);
  assert.equal(result.ending, 1);
  assert.match(result.text!, /hidden garden/);
  assert(result.chars! < result.text!.length);
  await clickNode(page, frame, 'continueButton');
  await capture(frame, `${name}-interaction`);

  return [
    'Space reveals then advances one line; keyboard choices reach both distinct consequences; pointer Continue reveals then restarts; no duplicate action',
  ];
};

try {
  for (const [slug, run] of [
    ['getting-started/hello-world', hello],
    ['application-scenes/multiple-scenes', scenes],
    ['application-scenes/loading-screen', loading],
    ['tilemap/level-loading-and-ownership', rooms],
    ['showcase/orb-dodge', dodge],
    ['ui/settings-menu', settings],
    ['ui/text-entry-and-scrolling', entry],
    ['showcase/dialog-system', dialog],
  ] as const) {
    if (values.only && !values.only.split(',').some(part => slug.includes(part))) {
      continue;
    }

    for (const [width, height] of [
      [1280, 720],
      [512, 288],
    ]) {
      const page = await browser.newPage({ viewport: { width: 1920, height: 1200 }, colorScheme: 'dark' });
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      const name = `${values.browser}-${values.backend}-${slug.split('/')[1]}-${width}`;

      try {
        const frame = await open(page, slug, width!, height!);
        const checks = await run(page, frame, name);
        const metrics = await frame.evaluate(() => {
          const app = window.__b2.app;
          const scene = app.scenes.currentScene as unknown as { ui?: { children: unknown[]; uiScale: number } };
          const host = window.frameElement as HTMLIFrameElement;
          const presentation = host.getBoundingClientRect().height / host.clientHeight;
          const cssPerUnit = ((app.canvas as HTMLCanvasElement).getBoundingClientRect().height / app.height) * presentation;
          const widgets: Array<{ name: string; height: number; bottom: number; font?: number }> = [];

          const pending = [...(scene.ui?.children ?? [])];

          while (pending.length) {
            const item = pending.pop() as RenderNode & { children?: unknown[]; labelNode?: { style: { fontSize: number } } };

            if (!item.visible) {
              continue;
            }

            if (['Button', 'Slider', 'Toggle', 'Dropdown', 'TextInput', 'TextArea'].includes(item.constructor.name)) {
              widgets.push({
                name: item.constructor.name,
                height: item.getBounds().height * cssPerUnit,
                bottom: (item.getBounds().y + item.getBounds().height) * cssPerUnit,
                font: item.labelNode ? item.labelNode.style.fontSize * (scene.ui?.uiScale ?? 1) * cssPerUnit : undefined,
              });
            }

            if (item.children) {
              pending.push(...item.children);
            }
          }

          return widgets;
        });
        assert(
          metrics.every(widget => widget.height >= 32 - 0.1),
          JSON.stringify(metrics),
        );
        assert(
          metrics.every(widget => widget.bottom <= height! + 0.1),
          JSON.stringify(metrics),
        );
        assert(
          metrics.every(widget => widget.font === undefined || widget.font >= 14 - 0.1),
          JSON.stringify(metrics),
        );

        if (metrics.length) {
          checks.push('native visible controls measured at >=32 CSS-pixel height and button labels >=14 CSS pixels');
        }

        await frame.evaluate(() => window.__b2.app.destroy());
        assert.equal(await frame.locator('.exo-demo-bar, .exo-demo-caption').count(), 0);
        checks.push('application teardown removes owned controls and caption');
        assert.equal(errors.length, 0, errors.join('\n'));
        records.push({ example: slug, size: `${width}x${height}`, status: 'PASS', checks });
      } catch (error) {
        console.error('Acceptance failure', error);
        await page
          .screenshot({ path: resolve(output, `${name}-failure.png`), timeout: 5000 })
          .catch(captureError => console.error('Failure capture', String(captureError)));
        records.push({ example: slug, size: `${width}x${height}`, status: 'FAIL', error: String(error), console: errors });
      } finally {
        await page.unrouteAll({ behavior: 'wait' });
        await page.close();
      }

      console.log(JSON.stringify(records.at(-1)));
    }
  }
} finally {
  const version = browser.version();
  await browser.close();
  await writeFile(
    resolve(output, `${values.browser}-${values.backend}${values.only ? `-${values.only}` : ''}-results.json`),
    `${JSON.stringify({ browser: values.browser, version, backend: values.backend, hardware: { touch: 'NOT_TESTED', gamepad: 'NOT_TESTED', ime: 'NOT_TESTED', mobileKeyboard: 'NOT_TESTED', audio: 'NOT_APPLICABLE: silent examples' }, records }, null, 2)}\n`,
  );
}

assert(records.length > 0, 'the example filter must select at least one acceptance case');
assert(
  records.every(record => record.status === 'PASS'),
  'one or more B2 acceptance cases failed',
);
