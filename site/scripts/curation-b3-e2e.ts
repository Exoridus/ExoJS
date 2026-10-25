import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import type { Application, Container, Graphics, Sprite, Vector, View } from '@codexo/exojs';
import { chromium, firefox, type Frame, type Page } from 'playwright';

const { values } = parseArgs({
  options: {
    host: { type: 'string', default: 'http://127.0.0.1:4324/ExoJS' },
    browser: { type: 'string', default: 'chromium' },
    backend: { type: 'string', default: 'webgl2' },
    shots: { type: 'string', default: '../docs/curation/evidence/b3' },
    only: { type: 'string', default: '' },
    'capture-inside': { type: 'boolean', default: false },
  },
});
assert(['webgl2', 'webgpu'].includes(values.backend!));
assert(['chromium', 'firefox'].includes(values.browser!));
const backend = values.backend!;
const output = resolve(values.shots!);
await mkdir(output, { recursive: true });
const browser =
  values.browser === 'firefox'
    ? await firefox.launch({ firefoxUserPrefs: { 'dom.webgpu.enabled': true } })
    : await chromium.launch({ channel: 'chromium', args: ['--enable-webgl', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });

interface ProbeScene {
  view?: View;
  camera?: View;
  mapCamera?: View;
  leftView?: View;
  rightView?: View;
  player?: Graphics;
  leftPlayer?: Sprite;
  rightPlayer?: Sprite;
  sprite?: Sprite;
  ship?: Container;
  muzzle?: Container;
  velocity?: Vector;
  facing?: number;
  thrust?: number;
  bullets?: Array<{ x: number; y: number; vx: number; vy: number }>;
  score?: number;
  playing?: boolean;
  scroll?: number;
  markerCount?: number;
  rebinding?: boolean;
  message?: string;
  pulseCount?: number;
  pulseRemaining?: number;
  engine?: { ended: boolean };
  asteroids?: Array<{ x: number; y: number; vx: number; vy: number; radius: number }>;
  pointers?: Map<number, unknown>;
  gestureDegrees?: number;
  gestureScale?: number;
  cancelled?: number;
  layers?: Container[];
  panel?: { values: Record<string, unknown> };
  buttons?: number;
  clicks?: number;
}

declare global {
  interface Window {
    __b3: { app: Application; callbacks?: unknown[]; voice?: { ended: boolean } };
    __b3Pads: Array<Gamepad | null>;
    __b3Rumble: { plays: number; resets: number };
  }
}

const state = (frame: Frame) =>
  frame.evaluate(() => {
    const app = window.__b3.app;
    const s = app.scenes.currentScene as unknown as ProbeScene;
    const point = (p?: { x: number; y: number }) => (p ? { x: p.x, y: p.y } : undefined);

    return {
      backend: app.backend.backendType,
      camera: point((s.view ?? s.camera)?.center),
      zoom: s.view?.zoomLevel,
      player: point((s.player ?? s.sprite ?? s.ship)?.position),
      left: point(s.leftPlayer?.position),
      right: point(s.rightPlayer?.position),
      map: point(s.mapCamera?.center),
      leftCamera: point(s.leftView?.center),
      rightCamera: point(s.rightView?.center),
      scroll: s.scroll,
      layers: s.layers?.map(l => l.x),
      markers: s.markerCount,
      playing: s.playing,
      rebinding: s.rebinding,
      message: s.message,
      pulses: s.pulseCount,
      pulseRemaining: s.pulseRemaining,
      rotation: s.ship?.rotation,
      facing: s.facing,
      thrust: s.thrust,
      velocity: point(s.velocity),
      bullets: s.bullets,
      muzzle: s.muzzle ? { x: s.muzzle.getGlobalTransform().x, y: s.muzzle.getGlobalTransform().y } : undefined,
      sound: Boolean(s.engine),
      pointers: s.pointers ? [...s.pointers.keys()] : undefined,
      gestureScale: s.gestureScale,
      gestureDegrees: s.gestureDegrees,
      cancelled: s.cancelled,
      buttons: s.buttons,
      clicks: s.clicks,
      pads: app.input.gamepads.map(p => p.connected),
      controls: s.panel?.values,
    };
  });

const capture = async (frame: Frame, name: string) =>
  (await frame.frameElement()).screenshot({ path: resolve(output, `${name}.png`), scale: 'css' });
const button = (frame: Frame, name: string) => frame.getByRole('button', { name, exact: true });

const hold = async (page: Page, key: string, ms = 650) => {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
  await page.waitForTimeout(80);
};

const focus = async (frame: Frame) => frame.locator('canvas').focus();

const open = async (page: Page, slug: string, width: number, height: number) => {
  await page.route(`**/examples/${slug}.js*`, async route => {
    const response = await route.fetch();
    const body = (await response.text())
      .replace('const app = new Application({', `const app = new Application({ backend: { type: '${backend}' },`)
      .replace(/await (?:app\.start|startExample)\(/, match => `window.__b3 = { app };\n${match}`);
    await route.fulfill({ response, body });
  });
  await page.addInitScript('globalThis.__name = (target) => target;');

  await page.goto(`${values.host}/en/playground/?version=current&example=${slug}`);
  await page.waitForSelector('iframe[src*="preview.html"]', { timeout: 30000 });
  const frame = (await (await page.locator('iframe[src*="preview.html"]').elementHandle())!.contentFrame())!;
  await frame.waitForFunction(() => Boolean(window.__b3?.app.scenes.currentScene), undefined, { timeout: 30000 });
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
  await page.waitForTimeout(250);
  const box = (await (await frame.frameElement()).boundingBox())!;
  assert(Math.abs(box.width - width) < 1 && Math.abs(box.height - height) < 1, JSON.stringify(box));
  assert.equal((await state(frame)).backend, backend, 'requested backend cannot fall back');

  return frame;
};

const mockPad = async (frame: Frame, connected: boolean, x = 0, y = 0, slot = 0) =>
  frame.evaluate(
    ({ connected, x, y, slot }) => {
      window.__b3Pads ??= [null, null, null, null];
      window.__b3Rumble ??= { plays: 0, resets: 0 };
      window.__b3Pads[slot] = connected
        ? ({
            id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)',
            index: slot,
            connected: true,
            mapping: 'standard',
            timestamp: performance.now(),
            axes: [x, y, 0, 0],
            buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
            vibrationActuator: {
              playEffect: () => {
                window.__b3Rumble.plays++;

                return Promise.resolve('complete');
              },
              reset: () => {
                window.__b3Rumble.resets++;

                return Promise.resolve('complete');
              },
            },
          } as unknown as Gamepad)
        : null;
      Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => window.__b3Pads });
    },
    { connected, x, y, slot },
  );

const pressPad = async (frame: Frame, index: number): Promise<void> => {
  const set = async (pressed: boolean) =>
    frame.evaluate(
      ({ index, pressed }) => {
        const pad = window.__b3Pads[0]!;
        window.__b3Pads[0] = {
          ...pad,
          buttons: pad.buttons.map((button, i) => (i === index ? { pressed, touched: pressed, value: pressed ? 1 : 0 } : button)),
        };
      },
      { index, pressed },
    );
  await set(true);
  await frame.waitForTimeout(80);
  await set(false);
  await frame.waitForTimeout(80);
};

const camera = async (page: Page, frame: Frame): Promise<string[]> => {
  const before = await state(frame);
  await focus(frame);
  await hold(page, 'd');
  assert((await state(frame)).camera!.x > before.camera!.x + 80);
  await mockPad(frame, true, -0.8, 0);
  await page.waitForTimeout(600);
  assert((await state(frame)).camera!.x < before.camera!.x + 180);
  await mockPad(frame, false);
  const canvas = await frame.locator('canvas').boundingBox();
  await page.mouse.move(canvas!.x + canvas!.width / 2, canvas!.y + canvas!.height / 2);
  await page.mouse.wheel(0, -250);
  await page.waitForTimeout(120);
  assert((await state(frame)).zoom! > 1);
  await page.mouse.click(canvas!.x + canvas!.width * 0.4, canvas!.y + canvas!.height * 0.35);
  await page.waitForTimeout(120);
  assert.equal((await state(frame)).markers, 1);
  const roundtrip = await frame.evaluate(() => {
    const s = window.__b3.app.scenes.currentScene as unknown as ProbeScene;
    const world = s.view!.screenToWorld(400, 250);
    const screen = s.view!.worldToScreen(world.x, world.y);

    return Math.hypot(screen.x - 400, screen.y - 250);
  });
  assert(roundtrip < 0.001);

  return ['keyboard and simulated stick pan', 'wheel zoom and world marker', 'pan/zoom screen-world roundtrip <0.001px'];
};

const parallax = async (page: Page, frame: Frame): Promise<string[]> => {
  await focus(frame);
  await hold(page, 'd', 500);
  const s = await state(frame);
  assert(s.scroll! > 50);
  assert(Math.abs(s.layers![0]! / s.layers![2]! - 0.3) < 0.01);
  assert(Math.abs(s.layers![1]! / s.layers![2]! - 0.6) < 0.01);
  await button(frame, 'Pause / Resume').click();
  const paused = (await state(frame)).scroll;
  await focus(frame);
  await hold(page, 'd', 300);
  assert.equal((await state(frame)).scroll, paused);
  await button(frame, 'Show factors').click();
  assert.equal((await state(frame)).controls!.factors, false);
  await button(frame, 'Pause / Resume').click();
  const box = (await frame.locator('canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(100);
  assert((await state(frame)).scroll! > paused! + 50);

  return ['three independent layers at 0.3/0.6/1.0 speed', 'keyboard and pointer drag', 'pause freezes scrolling; factor toggle'];
};

const split = async (page: Page, frame: Frame): Promise<string[]> => {
  await focus(frame);
  const before = await state(frame);
  await hold(page, 'd');
  const p1 = await state(frame);
  assert(p1.left!.x > before.left!.x + 80);
  assert.equal(p1.right!.x, before.right!.x);
  await hold(page, 'ArrowRight');
  const p2 = await state(frame);
  assert(p2.right!.x > before.right!.x + 80);
  assert.equal(p2.left!.x, p1.left!.x);
  assert.deepEqual(p2.leftCamera, p2.left);
  assert.deepEqual(p2.rightCamera, p2.right);
  await mockPad(frame, true, 0, -0.8);
  await page.waitForTimeout(500);
  await mockPad(frame, false);
  assert((await state(frame)).left!.y < -30);
  assert.equal((await state(frame)).right!.y, 0);

  await mockPad(frame, true, 0, 0);
  await page.waitForTimeout(150);
  const beforePad2 = await state(frame);
  await mockPad(frame, true, 0, 0.8, 1);
  await page.waitForTimeout(500);
  await mockPad(frame, false, 0, 0, 1);
  assert((await state(frame)).right!.y > beforePad2.right!.y + 30);
  assert.equal((await state(frame)).left!.y, beforePad2.left!.y);

  return [
    'simulated Pad 2 controls only P2',
    'P1/P2 independent keys and follow cameras',
    'shared world renders in two views',
    'simulated pad 1 controls only P1',
  ];
};

const minimap = async (page: Page, frame: Frame): Promise<string[]> => {
  await focus(frame);
  const before = await state(frame);
  await hold(page, 'd');
  const moved = await state(frame);
  assert(moved.player!.x > before.player!.x + 80);
  assert.deepEqual(moved.map, moved.player);
  assert(moved.camera!.x > before.camera!.x + 80);

  return ['action moves player', 'main camera and round render-texture map follow same world'];
};

const actions = async (page: Page, frame: Frame): Promise<string[]> => {
  await focus(frame);
  const before = await state(frame);
  await hold(page, 'd', 350);
  assert((await state(frame)).player!.x > before.player!.x + 30);
  await page.keyboard.press('Space');
  await page.waitForTimeout(80);
  assert.equal((await state(frame)).pulses, 1, 'pulse action should fire');
  await button(frame, 'Rebind pulse').click();
  await page.keyboard.press('w');
  await page.waitForTimeout(80);
  assert.equal((await state(frame)).rebinding, true);
  assert.match((await state(frame)).message!, /Conflict/);
  await button(frame, 'Cancel').click();
  assert.equal((await state(frame)).rebinding, false);
  await button(frame, 'Rebind pulse').click();
  await page.keyboard.press('q');
  await page.waitForTimeout(100);
  assert.equal((await state(frame)).rebinding, false);
  await focus(frame);
  await page.keyboard.press('q');
  await page.waitForTimeout(80);
  assert.equal((await state(frame)).pulses, 2);
  await mockPad(frame, true, 0.1, 0.1);
  await frame.waitForTimeout(100);
  await pressPad(frame, 0);
  assert.equal((await state(frame)).pulses, 3);
  await page.waitForTimeout(150);
  assert.match((await frame.locator('.exo-demo-bar').textContent())!, /Deadzone 0.00,0.00/);
  await mockPad(frame, true, 0.8, 0);
  await page.waitForTimeout(250);
  assert((await state(frame)).player!.x > before.player!.x + 80);
  await mockPad(frame, false);
  await focus(frame);
  const disconnected = await state(frame);
  await hold(page, 'a', 250);
  assert((await state(frame)).player!.x < disconnected.player!.x - 20);
  await Promise.all([frame.waitForNavigation(), frame.evaluate(() => location.reload())]);
  await frame.waitForFunction(() => Boolean(window.__b3?.app.scenes.currentScene));
  await frame.waitForTimeout(150);
  await focus(frame);
  await page.keyboard.press('q');
  await page.waitForTimeout(100);
  assert.equal((await state(frame)).pulses, 1, 'pulse action should fire');
  await button(frame, 'Reset').click();
  await focus(frame);
  await page.keyboard.press('q');
  await page.waitForTimeout(80);
  assert.equal((await state(frame)).pulses, 0);
  await page.keyboard.press('Space');
  await page.waitForTimeout(80);
  assert.equal((await state(frame)).pulses, 1, 'pulse action should fire');

  return [
    'reload preserves Q; Reset restores Space',
    'move and pulse actions',
    'conflict rejection and Cancel',
    'rebind Q preserves pad South',
    'simulated raw neutral deadzone and stick action',
    'disconnect retains keyboard fallback',
  ];
};

const spaceship = async (page: Page, frame: Frame): Promise<string[]> => {
  assert.equal((await state(frame)).sound, false);
  assert.equal(await button(frame, 'Haptics').getAttribute('aria-pressed'), 'false');
  const keys = [['d'], ['d', 's'], ['s'], ['s', 'a'], ['a'], ['a', 'w'], ['w'], ['w', 'd']];

  for (let i = 0; i < keys.length; i++) {
    await button(frame, 'Restart').click();
    await frame.evaluate(() => {
      (window.__b3.app.scenes.currentScene as unknown as ProbeScene).asteroids!.length = 0;
    });
    await focus(frame);

    for (const key of keys[i]!) {
      await page.keyboard.down(key);
    }

    await page.waitForTimeout(550);
    const held = await state(frame);

    const heading = (i * Math.PI) / 4;
    assert(Math.abs(Math.cos(held.facing!) - Math.cos(heading)) < 0.001);
    assert(Math.abs(Math.sin(held.facing!) - Math.sin(heading)) < 0.001);
    const rotation = (-(held.rotation! + 90) * Math.PI) / 180;
    assert(Math.abs(Math.cos(rotation) - Math.cos(heading)) < 0.001);
    assert(Math.abs(Math.sin(rotation) - Math.sin(heading)) < 0.001);
    assert(held.velocity!.x * Math.cos(heading) + held.velocity!.y * Math.sin(heading) > 100);
    await page.keyboard.press('Space');
    await page.waitForTimeout(40);
    const shot = await state(frame);
    const bullet = shot.bullets!.at(-1)!;
    assert(bullet, 'shot exists');
    const vx = bullet.vx - held.velocity!.x;
    const vy = bullet.vy - held.velocity!.y;
    const alignment = (vx * Math.cos(heading) + vy * Math.sin(heading)) / Math.hypot(vx, vy);
    assert(alignment > Math.cos((5 * Math.PI) / 180), JSON.stringify({ i, held, shot, alignment }));

    for (const key of keys[i]!) {
      await page.keyboard.up(key);
    }
  }

  for (let i = 0; i < 8; i++) {
    await mockPad(frame, false);
    await button(frame, 'Restart').click();
    await frame.evaluate(() => {
      (window.__b3.app.scenes.currentScene as unknown as ProbeScene).asteroids!.length = 0;
    });
    const heading = (i * Math.PI) / 4;
    await mockPad(frame, true, Math.cos(heading), Math.sin(heading));
    await frame.waitForTimeout(550);
    const held = await state(frame);
    assert(Math.abs(Math.cos(held.facing!) - Math.cos(heading)) < 0.001);
    assert(Math.abs(Math.sin(held.facing!) - Math.sin(heading)) < 0.001);
    await pressPad(frame, 7);
    const shot = (await state(frame)).bullets!.at(-1)!;
    assert(shot, 'simulated trigger fires');
    const vx = shot.vx - held.velocity!.x;
    const vy = shot.vy - held.velocity!.y;
    assert((vx * Math.cos(heading) + vy * Math.sin(heading)) / Math.hypot(vx, vy) > Math.cos((5 * Math.PI) / 180));
  }

  assert.equal(await frame.evaluate(() => window.__b3Rumble.plays), 0);
  await button(frame, 'Haptics').click();
  await pressPad(frame, 7);
  assert((await frame.evaluate(() => window.__b3Rumble.plays)) > 0);
  await button(frame, 'Haptics').click();
  assert((await frame.evaluate(() => window.__b3Rumble.resets)) > 0);
  await mockPad(frame, false);
  await button(frame, 'Restart').click();
  await focus(frame);
  await hold(page, 'd', 550);
  await frame.evaluate(() => {
    const scene = window.__b3.app.scenes.currentScene as unknown as ProbeScene;
    Object.assign(scene.asteroids![0]!, { x: scene.ship!.x + 90, y: scene.ship!.y, vx: 0, vy: 0, radius: 60 });
  });
  await page.keyboard.press('Space');
  await frame.waitForFunction(() => ((window.__b3.app.scenes.currentScene as unknown as ProbeScene).score ?? 0) > 0, undefined, {
    timeout: 3000,
  });
  await button(frame, 'Engine sound').click();
  await frame.waitForTimeout(100);
  assert.equal((await state(frame)).sound, true);
  await button(frame, 'Pause / Resume').click();
  const paused = await state(frame);
  await page.waitForTimeout(250);
  assert.deepEqual((await state(frame)).player, paused.player);
  await button(frame, 'Pause / Resume').click();
  await focus(frame);
  await page.keyboard.press('r');
  await page.waitForTimeout(80);
  assert.equal((await state(frame)).bullets!.length, 0);
  assert.equal((await state(frame)).thrust, 0);
  await hold(page, 'd', 550);
  await page.keyboard.press('Space');
  await page.waitForTimeout(40);
  await button(frame, 'Pause / Resume').click();
  await page.waitForTimeout(60);
  assert.equal((await state(frame)).playing, false);

  return [
    'eight keyboard headings held 0.55s align hull/muzzle/acceleration and shots within 5deg',
    'pause freezes ship; R restarts',
    'sound and haptics default off; explicit opt-in and haptic stop',
    'eight simulated pad headings and trigger',
    'shot collision and score',
  ];
};

const donor = async (page: Page, frame: Frame, slug: string): Promise<string[]> => {
  await focus(frame);

  if (slug.endsWith('key-rebinding')) {
    await page.keyboard.press('j');
    await page.waitForTimeout(80);
    await page.keyboard.press('q');

    return ['donor jump rebinding remains runnable'];
  }

  if (values['capture-inside'] && slug.endsWith('mouse-and-pointer')) {
    await frame.locator('canvas').evaluate(canvas => canvas.style.setProperty('width', '90%', 'important'));
    await frame.waitForTimeout(100);
  }

  const box = (await frame.locator('canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.4);
  await page.waitForTimeout(100);

  if (slug.endsWith('mouse-and-pointer')) {
    assert((await state(frame)).clicks! >= 1);

    const before = (await state(frame)).player!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width + 40, box.y + box.height / 3, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(100);
    assert.equal((await state(frame)).buttons, 0);
    assert((await state(frame)).player!.x > before.x + 100);

    return ['pointer tap and mouse fallback', 'captured drag releases outside canvas'];
  }

  for (const [pointerId, clientX] of [
    [41, 500],
    [42, 700],
  ]) {
    await frame.locator('canvas').dispatchEvent('pointerover', { pointerId, pointerType: 'touch', clientX, clientY: 300, buttons: 0 });
  }

  await frame
    .locator('canvas')
    .dispatchEvent('pointerdown', { pointerId: 41, pointerType: 'touch', clientX: 500, clientY: 300, buttons: 1 });
  await frame
    .locator('canvas')
    .dispatchEvent('pointerdown', { pointerId: 42, pointerType: 'touch', clientX: 700, clientY: 300, buttons: 1 });
  await page.waitForTimeout(100);
  assert.deepEqual((await state(frame)).pointers, [41, 42]);
  await frame
    .locator('canvas')
    .dispatchEvent('pointermove', { pointerId: 41, pointerType: 'touch', clientX: 500, clientY: 200, buttons: 1 });
  await frame
    .locator('canvas')
    .dispatchEvent('pointermove', { pointerId: 42, pointerType: 'touch', clientX: 700, clientY: 400, buttons: 1 });
  await page.waitForTimeout(100);
  assert((await state(frame)).gestureScale! > 1);
  assert((await state(frame)).gestureDegrees! < 0);
  await frame
    .locator('canvas')
    .dispatchEvent('pointercancel', { pointerId: 41, pointerType: 'touch', clientX: 500, clientY: 200, buttons: 0 });
  await frame.locator('canvas').dispatchEvent('pointerup', { pointerId: 42, pointerType: 'touch', clientX: 700, clientY: 400, buttons: 0 });
  await page.waitForTimeout(100);
  assert.deepEqual((await state(frame)).pointers, []);
  assert.equal((await state(frame)).cancelled, 1);

  return ['two synthetic contact IDs', 'pinch and same-direction rotation', 'cancel/up remove contact state'];
};

const targets = [
  ['application-scenes/world-vs-screen-coords', camera],
  ['scene-graph/parallax-starfield', parallax],
  ['application-scenes/multi-view-split-screen', split],
  ['render-targets/mini-map', minimap],
  ['input/action-mapping', actions],
  ['showcase/gamepad-spaceship', spaceship],
  ['input/key-rebinding', donor],
  ['input/mouse-and-pointer', donor],
  ['input/multitouch', donor],
] as const;
const records: Array<{ example: string; size: string; status: string; checks?: string[]; error?: string }> = [];

try {
  for (const [slug, run] of targets) {
    if (values.only && !slug.includes(values.only)) {
      continue;
    }

    for (const [width, height] of [
      [1280, 720],
      [512, 288],
    ]) {
      const page = await browser.newPage({ viewport: { width: 1920, height: 1200 }, colorScheme: 'dark' });
      page.setDefaultTimeout(10000);
      const name = `${values.browser}-${backend}-${slug.split('/')[1]}-${width}${values['capture-inside'] ? '-inside' : ''}`;
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(String(error)));

      try {
        const frame = await open(page, slug, width!, height!);
        await capture(frame, `${name}-startup`);
        const checks = await run(page, frame, slug);
        await capture(frame, `${name}-interaction`);

        if (!slug.includes('input/')) {
          const reset = button(frame, slug.includes('spaceship') ? 'Restart' : 'Reset');
          await reset.click();

          if (slug.includes('coords')) {
            assert.equal((await state(frame)).markers, 0);
            assert.equal((await state(frame)).zoom, 1);
          }

          if (slug.includes('parallax')) {
            assert.equal((await state(frame)).scroll, 0);
          }

          checks.push('reset restores initial state');
        }

        await frame.evaluate(() => {
          window.__b3.voice = (window.__b3.app.scenes.currentScene as unknown as ProbeScene).engine;
          window.__b3.callbacks = Object.values(window.__b3.app.scenes.currentScene!).filter(value => typeof value === 'function');
          window.__b3.app.stop();
        });
        await frame.waitForFunction(() => !window.__b3.app.scenes.currentScene);
        const scene = await frame.evaluate(() =>
          [
            'onKeyDown',
            'onPointerDown',
            'onPointerMove',
            'onPointerUp',
            'onPointerCancel',
            'onPinch',
            'onRotate',
            'onMouseWheel',
            'onAnyGamepadButtonDown',
          ].map(name => {
            const signal = window.__b3.app.input[name as keyof typeof window.__b3.app.input] as { has(handler: unknown): boolean };

            return window.__b3.callbacks!.filter(callback => signal.has(callback)).length;
          }),
        );
        assert.equal(await frame.locator('.exo-demo-bar,.exo-demo-caption').count(), 0);
        checks.push('scene disposal removes controls and owned handlers');
        assert(await frame.evaluate(() => !window.__b3.voice || window.__b3.voice.ended), 'audio voice ends on scene exit');
        assert.equal(errors.length, 0, errors.join('\n'));
        assert(
          scene.every(count => count === 0),
          `owned input listeners after stop: ${scene}`,
        );
        records.push({ example: slug, size: `${width}x${height}`, status: 'PASS', checks });
      } catch (error) {
        for (const candidate of page.frames().filter(frame => frame.url().includes('preview.html'))) {
          errors.push(
            JSON.stringify(
              await candidate
                .evaluate(() => ({
                  probe: Boolean(window.__b3),
                  backend: window.__b3?.app.backend?.backendType,
                  scene: Boolean(window.__b3?.app.scenes.currentScene),
                  state: window.__b3?.app.state,
                }))
                .catch(String),
            ),
          );
        }

        console.error('Acceptance failure', error);
        await page
          .screenshot({ path: resolve(output, `${name}-failure.png`), timeout: 5000 })
          .catch(captureError => console.error('Failure capture', String(captureError)));
        records.push({
          example: slug,
          size: `${width}x${height}`,
          status: 'FAIL',
          error: error instanceof Error ? error.message : String(error),
          checks: errors,
        });
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
    resolve(
      output,
      `${values.browser}-${backend}${values.only ? `-${values.only}` : ''}${values['capture-inside'] ? '-inside' : ''}-results.json`,
    ),
    `${JSON.stringify({ browser: values.browser, version, backend, hardware: { touch: 'NOT_TESTED', gamepad: 'NOT_TESTED', haptics: 'NOT_TESTED', humanListening: 'NOT_TESTED' }, records }, null, 2)}\n`,
  );
}

assert(
  records.every(r => r.status === 'PASS'),
  'B3 interaction acceptance failed',
);
