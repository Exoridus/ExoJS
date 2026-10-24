import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import type { Application, Color, Graphics, Rectangle, RenderTexture, Sprite, Video } from '@codexo/exojs';
import { chromium, firefox, type Frame, type Page } from 'playwright';

import { w3cBlend } from '../../test/rendering/browser/_blendReference';

const { values } = parseArgs({
  options: {
    host: { type: 'string', default: 'http://127.0.0.1:4326/ExoJS' },
    browser: { type: 'string', default: 'chromium' },
    backend: { type: 'string', default: 'webgl2' },
    shots: { type: 'string', default: 'docs/curation/evidence/b6' },
    only: { type: 'string', default: '' },
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
interface Probe {
  panel: { values: Record<string, string | number | boolean>; set: (key: string, value: string | number | boolean) => void };
  playing: boolean;
  elapsed: number;
  time: number;
  angle: number;
  planet: Sprite;
  planetOrbit: Sprite;
  moon: Sprite;
  offsets: Array<{ x: number; y: number }>;
  rectMask: Rectangle;
  circle: Graphics;
  magnified: Sprite[];
  minified: Sprite[];
  sources: Sprite[];
  sprites: Sprite[];
  stage: Sprite;
  blur: { strength: number };
  color: { matrix: number[] };
  shadow: { offsetX: number };
  bloom: { threshold: number; intensity: number; strength: number };
  zoom: number;
  cameraMotion: boolean;
  captureCount: number;
  capturedTime: number;
  target: RenderTexture;
  liveTarget: RenderTexture;
  video: Video | null;
  videoIdx: number;
  generation: number;
  loading: boolean;
  mediaState: string;
  torch: { x: number; y: number; radius: number; height: number };
  beam: { intensity: number };
  lights: Array<{ height: number }>;
  lighting: { activeSurfaceCount: number };
  system: { aliveCount: number; simulationBackend: string };
  attractor: { x: number; y: number; strength: number };
  repeller: { strength: number };
  targetX: number;
  emitterX: number;
}
declare global {
  interface Window {
    __b6: {
      app: Application;
      target: RenderTexture;
      clear: Color;
      Sprite: typeof Sprite;
      Texture: typeof import('@codexo/exojs').Texture;
      Rectangle: typeof Rectangle;
      Graphics: typeof Graphics;
      Color: typeof Color;
    };
  }
}
const slugs = [
  'scene-graph/nested-transforms',
  'scene-graph/pivot-and-anchor',
  'scene-graph/masks',
  'sprites-textures/texture-sampling',
  'sprites-textures/blendmodes',
  'filters/blur-filter',
  'filters/bloom-filter',
  'render-targets/render-to-texture',
  'sprites-textures/video-drawable',
  'lighting/shadow-casters',
  'lighting/lightmap-normals',
  'particles/emitter-basics',
  'particles/cursor-attractor-particles',
];
const records: Array<{ example: string; size: string; status: string; checks?: unknown; error?: string }> = [];
const inspect = (frame: Frame) =>
  frame.evaluate(() => {
    const s = window.__b6.app.scenes.currentScene as unknown as Probe;

    return {
      playing: s.playing,
      elapsed: s.elapsed,
      time: s.time,
      angle: s.angle,
      values: s.panel.values,
      local: s.planet ? { x: s.planet.x, y: s.planet.y } : null,
      world: s.planet ? { x: s.planet.getWorldTransform().x, y: s.planet.getWorldTransform().y } : null,
      offsets: s.offsets,
      rect: s.rectMask ? { x: s.rectMask.x, y: s.rectMask.y } : null,
      circle: s.circle ? { x: s.circle.x, y: s.circle.y } : null,
      positions: s.magnified?.map(p => ({ x: p.x, y: p.y, snap: p.pixelSnapMode })),
      zoom: s.zoom,
      cameraMotion: s.cameraMotion,
      count: s.captureCount,
      capturedTime: s.capturedTime,
      video: s.video ? { time: s.video.currentTime, paused: s.video.paused, muted: s.video.muted, duration: s.video.duration } : null,
      videoIdx: s.videoIdx,
      loading: s.loading,
      mediaState: s.mediaState,
      torch: s.torch ? { x: s.torch.x, y: s.torch.y, radius: s.torch.radius } : null,
      beam: s.beam?.intensity,
      heights: s.lights?.map(light => light.height),
      surfaces: s.lighting?.activeSurfaceCount,
      particles: s.system?.aliveCount,
      simulation: s.system?.simulationBackend,
      attractor: s.attractor ? { x: s.attractor.x, y: s.attractor.y, strength: s.attractor.strength } : null,
      repel: s.repeller?.strength,
      targetX: s.targetX,
      emitterX: s.emitterX,
    };
  });

const shot = async (frame: Frame, name: string) => {
  await (await frame.frameElement()).screenshot({ path: resolve(output, `${name}.png`) });
};

const settle = (frame: Frame) =>
  frame.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

const slider = async (frame: Frame, name: string, value: number) => {
  const control = frame.getByRole('slider', { name, exact: true });
  await control.fill(String(value));
  await control.dispatchEvent('input');
  await settle(frame);
};

const choose = async (frame: Frame, name: string, value: string) => {
  await frame.getByRole('combobox', { name, exact: true }).selectOption({ label: value });
  await settle(frame);
};

const toggle = async (frame: Frame, name: string) => {
  await frame.getByRole('button', { name, exact: true }).click();
  await settle(frame);
};

const button = async (frame: Frame, name: string) => {
  await frame.getByRole('button', { name, exact: true }).click();
  await settle(frame);
};

const move = async (page: Page, frame: Frame, x: number, y: number, drag = false) => {
  const box = (await frame.locator('canvas').boundingBox())!;

  if (drag) {
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.25);
    await page.mouse.down();
  }

  await page.mouse.move(box.x + box.width * x, box.y + box.height * y, { steps: 5 });

  if (drag) {
    await page.mouse.up();
  }

  await settle(frame);
};

const pixels = async (frame: Frame, side = 0) =>
  frame.evaluate(async side => {
    const app = window.__b6.app;
    const scene = app.scenes.currentScene!;

    if ((scene as unknown as Probe).sources) {
      scene.root.children.forEach((layer, index) =>
        app.rendering.renderTo(layer, { target: window.__b6.target, ...(index === 0 ? { clear: window.__b6.clear } : {}) }),
      );
    } else {
      app.rendering.renderTo(scene.root, { target: window.__b6.target, clear: window.__b6.clear });
    }

    const image = await app.rendering.readPixels(window.__b6.target);
    const half = Math.floor(image.width / 2);
    const sums = [0, 0, 0, 0];
    let nonzero = 0;

    for (let y = 100; y < Math.min(image.height, 500); y += 3) {
      for (let x = side * half; x < (side + 1) * half; x += 3) {
        const i = (y * image.width + x) * 4;

        for (let c = 0; c < 4; c++) {
          sums[c] += image.data[i + c]!;
        }

        if (image.data[i + 3]! > 0) {
          nonzero++;
        }
      }
    }

    return { sums, nonzero };
  }, side);

const open = async (page: Page, slug: string, width: number, height: number): Promise<Frame> => {
  await page.route(`**/examples/${slug}.js*`, async route => {
    const response = await route.fetch();
    const source = await response.text();
    const body = `import { RenderTexture as ProbeRenderTexture, Color as ProbeColor, Graphics as ProbeGraphics, Sprite as ProbeSprite, Texture as ProbeTexture, Rectangle as ProbeRectangle } from '@codexo/exojs';\n${source
      .replace('const app = new Application({', `const app = new Application({ backend: { type: '${values.backend}' },`)
      .replace(
        'await app.start(',
        'window.__b6 = { app, target: new ProbeRenderTexture(app.width, app.height), clear: ProbeColor.transparent, Graphics: ProbeGraphics, Color: ProbeColor, Sprite: ProbeSprite, Texture: ProbeTexture, Rectangle: ProbeRectangle };\nawait app.start(',
      )}`;
    await route.fulfill({ response, body });
  });
  await page.goto(`${values.host}/en/playground/?version=current&example=${slug}`);
  await page.waitForSelector('iframe[src*="preview.html"]', { timeout: 30000 });
  await page.frameLocator('iframe[src*="preview.html"]').locator('.exo-demo-bar').waitFor({ timeout: 30_000 });
  const frame = page.frames().find(candidate => candidate.url().includes('preview.html'))!;
  await frame.waitForFunction(() => Boolean(window.__b6?.app.scenes.currentScene), null, { timeout: 30000 });
  await frame.locator('.exo-demo-bar').waitFor();
  await page.locator('iframe[src*="preview.html"]').evaluate(
    (element, size) => {
      const f = element as HTMLIFrameElement;
      Object.assign(f.parentElement!.style, {
        position: 'fixed',
        left: '0',
        top: '0',
        zIndex: '10000',
        width: `${size.width}px`,
        height: `${size.height}px`,
        overflow: 'visible',
      });
      Object.assign(f.style, { width: '1280px', height: '720px', transform: `scale(${size.width / 1280})` });
    },
    { width, height },
  );
  await frame.waitForTimeout(250);
  assert.equal(await frame.evaluate(() => window.__b6.app.backend.backendType), values.backend, 'no backend fallback');

  return frame;
};

const exercise = async (page: Page, frame: Frame, slug: string, name: string) => {
  const checks: unknown[] = [];
  await shot(frame, `${name}-startup`);

  if (slug.endsWith('nested-transforms')) {
    await button(frame, 'Pause / Resume');
    const a = await inspect(frame);
    await button(frame, 'Parent +15°');
    const b = await inspect(frame);
    assert.deepEqual(b.local, a.local);
    assert.notDeepEqual(b.world, a.world);
    const t = b.elapsed;
    await frame.waitForTimeout(250);
    assert.equal((await inspect(frame)).elapsed, t);
    checks.push('parent rotation moves world position only; pause freezes time');
  }

  if (slug.endsWith('pivot-and-anchor')) {
    await button(frame, 'Step 15°');
    const a = await inspect(frame);
    await button(frame, 'Step 15°');
    assert.equal((await inspect(frame)).angle, a.angle + 15);
    await frame.locator('canvas').focus();
    await page.keyboard.press('ArrowRight');
    await settle(frame);
    assert.equal((await inspect(frame)).angle, a.angle + 30);
    assert.equal((await inspect(frame)).playing, false);
    checks.push('button and Right each step exactly 15 degrees and pause');
  }

  if (slug.endsWith('/masks')) {
    const a = await inspect(frame);
    await move(page, frame, 0.76, 0.32, true);
    const b = await inspect(frame);
    assert.notDeepEqual(b.offsets, a.offsets);
    assert(b.circle!.x > 640);
    await toggle(frame, 'Bypass');
    assert.equal((await inspect(frame)).values.bypass, true);
    await toggle(frame, 'Bypass');
    checks.push('world-space circular mask follows drag; bypass and restore');
  }

  if (slug.endsWith('texture-sampling')) {
    await toggle(frame, 'Motion');
    const a = await inspect(frame);
    await choose(frame, 'Pixel snap', 'Position');
    const b = await inspect(frame);
    assert.deepEqual(
      b.positions?.map(p => ({ x: p.x, y: p.y })),
      a.positions?.map(p => ({ x: p.x, y: p.y })),
    );
    await choose(frame, 'Pixel snap', 'Geometry');
    await button(frame, 'Camera drift');
    await move(page, frame, 0.5, 0.4);
    await frame.locator('canvas').focus();
    await page.mouse.wheel(0, 120);
    await settle(frame);
    assert((await inspect(frame)).zoom < 1);
    checks.push({
      snapPreservesLogicalPositions: true,
      position: a.positions,
      device: await frame.evaluate(() => ({
        dpr: devicePixelRatio,
        ratio: window.__b6.app.pixelRatio,
        buffer: [window.__b6.app.canvas.width, window.__b6.app.canvas.height],
      })),
    });
  }

  if (slug.endsWith('blendmodes')) {
    await button(frame, 'Fix frame');
    const modes = await frame.getByRole('combobox', { name: 'Blend mode', exact: true }).locator('option').allTextContents();
    assert.equal(modes.length, 18);
    const results = [];

    for (const bg of ['Opaque gray', 'Transparent']) {
      await choose(frame, 'Background', bg);

      for (const mode of modes) {
        await choose(frame, 'Blend mode', mode);
        results.push({
          background: bg,
          mode,
          active: await frame.evaluate(() => {
            const scene = window.__b6.app.scenes.currentScene as unknown as Probe;

            return { mode: scene.sources[1]!.blendMode, alpha: scene.sources[1]!.tint.a, background: scene.panel.values.background };
          }),
          rgba: await pixels(frame, 1),
        });
      }
    }

    checks.push({ fixedTimeModes: results });
    await shot(frame, `${name}-interaction`);
    assert(results.every(result => result.rgba.nonzero > 0));
    const reference = await frame.evaluate(async () => {
      const probe = window.__b6;
      const app = probe.app;
      const destination = new probe.Sprite(probe.Texture.white).setPosition(4, 4);
      const source = new probe.Sprite(probe.Texture.white).setPosition(4, 4);
      destination.width = source.width = 24;
      destination.height = source.height = 24;
      const records = [];

      try {
        for (const alpha of [1, 0.45]) {
          for (let mode = 0; mode < 18; mode++) {
            destination.tint = new probe.Color(80, 160, 220, alpha);
            source.tint = new probe.Color(210, 70, 140, 0.7);
            source.setBlendMode(mode);
            app.rendering.renderTo(destination, { target: probe.target, clear: probe.clear });
            app.rendering.renderTo(source, { target: probe.target });
            const pixel = await app.rendering.readPixels(probe.target, { region: new probe.Rectangle(12, 12, 1, 1) });
            records.push({ mode, destinationAlpha: alpha, rgba: [...pixel.data] });
          }
        }
      } finally {
        source.destroy();
        destination.destroy();
      }

      return records;
    });

    const linear = (value: number): number => {
      const encoded = value / 255;

      return encoded <= 0.04045 ? encoded / 12.92 : ((encoded + 0.055) / 1.055) ** 2.4;
    };

    const cb = [80, 160, 220].map(linear) as [number, number, number];
    const cs = [210, 70, 140].map(linear) as [number, number, number];
    const referenceChecks = reference.map(record => {
      const as = 0.7;
      const ad = record.destinationAlpha;
      const expected = [0, 0, 0, record.mode === 2 ? ad : as + ad * (1 - as)];
      const blend = record.mode >= 3 ? w3cBlend(record.mode, cb, cs) : cs;

      for (let channel = 0; channel < 3; channel++) {
        const source = cs[channel]! * as;
        const destination = cb[channel]! * ad;
        expected[channel] =
          record.mode === 0
            ? source + destination * (1 - as)
            : record.mode === 1
              ? source + destination
              : record.mode === 2
                ? destination * (1 - source)
                : (1 - as) * destination + (1 - ad) * source + as * ad * blend[channel]!;
      }

      const bytes = expected.map(value => Math.round(Math.max(0, Math.min(1, value)) * 255));

      return { ...record, expected: bytes, maxError: Math.max(...record.rgba.map((value, channel) => Math.abs(value - bytes[channel]!))) };
    });
    await writeFile(
      resolve(output, `${name}-blend-reference.json`),
      `${JSON.stringify(
        { tolerance: 5, source: [210, 70, 140, 0.7], destination: [80, 160, 220], images: results, reference: referenceChecks },
        null,
        2,
      )}\n`,
    );
    assert(
      referenceChecks.every(record => record.maxError <= 5),
      JSON.stringify(referenceChecks),
    );
    assert(new Set(results.map(result => result.rgba.sums.join(','))).size > 10, JSON.stringify(results));
    await choose(frame, 'Blend mode', 'Subtract');
    assert((await frame.locator('.exo-demo-status').innerText()).includes('Cd * (1 - Cs)'));
  }

  if (slug.endsWith('blur-filter')) {
    for (const effect of ['Blur', 'Drop Shadow', 'Grayscale', 'Sepia']) {
      await choose(frame, 'Filter', effect);
      await slider(frame, effect === 'Blur' ? 'Radius / px' : effect === 'Drop Shadow' ? 'Offset / px' : 'Amount', 0.9);
      const data = await pixels(frame, 1);
      assert(data.nonzero > 0);
    }

    await toggle(frame, 'Bypass');
    assert.equal(await frame.evaluate(() => (window.__b6.app.scenes.currentScene as unknown as Probe).sprites[1]!.filters.length), 0);
    assert.deepEqual(await pixels(frame, 0), await pixels(frame, 1));
    checks.push('all four public filter families draw; bypass pixels match reference');
  }

  if (slug.endsWith('bloom-filter')) {
    await button(frame, 'Pause / Resume');
    await slider(frame, 'Threshold', 0);
    const a = await pixels(frame, 1);
    await slider(frame, 'Threshold', 1);
    const b = await pixels(frame, 1);
    assert.notDeepEqual(a.sums, b.sums);
    await slider(frame, 'Intensity', 3);
    await slider(frame, 'Spread', 18);
    await toggle(frame, 'Bypass');
    assert.equal(await frame.evaluate(() => (window.__b6.app.scenes.currentScene as unknown as Probe).stage.filters.length), 0);
    checks.push('threshold changes rendered luminance, independent intensity/spread and bypass');
  }

  if (slug.endsWith('render-to-texture')) {
    await button(frame, 'Capture');
    const a = await inspect(frame);
    await frame.waitForTimeout(350);
    const b = await inspect(frame);
    assert(b.time > a.time);
    assert.equal(b.count, a.count);
    assert.equal(b.capturedTime, a.capturedTime);
    await button(frame, 'Capture');
    assert.equal((await inspect(frame)).count, a.count + 1);
    checks.push('frozen timestamp/count stay fixed while live advances; recapture occurs once');
  }

  if (slug.endsWith('video-drawable')) {
    await frame.waitForFunction(
      () => {
        const s = window.__b6.app.scenes.currentScene as unknown as Probe;

        return Boolean(s.video) && !s.loading;
      },
      null,
      { timeout: 30000 },
    );
    const a = await inspect(frame);
    assert(a.video!.muted && a.video!.paused);
    await button(frame, 'Play / Pause');
    await frame.waitForTimeout(400);
    assert((await inspect(frame)).video!.time > a.video!.time);
    await button(frame, 'Play / Pause');
    await slider(frame, 'Seek %', 40);
    assert((await inspect(frame)).video!.time > 0);
    await choose(frame, 'Clip', '4K 24 fps (MP4)');
    await choose(frame, 'Clip', '1080p 60 fps (WebM)');
    await frame.waitForFunction(
      () => {
        const s = window.__b6.app.scenes.currentScene as unknown as Probe;

        return s.videoIdx === 2 && !s.loading;
      },
      null,
      { timeout: 60000 },
    );
    assert((await inspect(frame)).video!.paused);
    assert((await inspect(frame)).video!.muted);
    await toggle(frame, 'Loop');
    await slider(frame, 'Seek %', 99);
    await button(frame, 'Play / Pause');
    await frame.waitForFunction(
      () => {
        const scene = window.__b6.app.scenes.currentScene as unknown as Probe;

        return Boolean(scene.video?.videoElement.ended) && scene.panel.values.paused === true;
      },
      null,
      { timeout: 10000 },
    );
    checks.push('silent paused startup; play/pause/seek; last clip selection wins; non-looping end synchronizes pause');
  }

  if (slug.endsWith('shadow-casters')) {
    await button(frame, 'Pause / Resume');
    const a = await inspect(frame);
    await move(page, frame, 0.7, 0.35, true);
    assert.notDeepEqual((await inspect(frame)).torch, a.torch);
    await slider(frame, 'Radius', 120);
    await choose(frame, 'Light', 'Spot');
    assert((await inspect(frame)).beam! > 0);
    await toggle(frame, 'Show occluders');
    await frame.locator('canvas').focus();
    await page.keyboard.press('r');
    await settle(frame);
    assert.deepEqual((await inspect(frame)).values, { radius: 230, softness: 0.35, occluders: false, type: 'Point' });
    checks.push('drag, radius, spot and alpha-outline debug work; R restores all defaults');
  }

  if (slug.endsWith('lightmap-normals')) {
    const a = await inspect(frame);
    assert(a.surfaces! > 0);
    await slider(frame, 'Light height', 100);
    const b = await inspect(frame);
    assert(b.heights![0] === b.heights![1] && b.heights![0]! > a.heights![0]!);
    await move(page, frame, 0.3, 0.3);
    await toggle(frame, 'Normals A/B');
    assert.equal((await inspect(frame)).surfaces, 0);
    await toggle(frame, 'Normals A/B');
    await toggle(frame, 'Show normals');
    await frame.locator('canvas').focus();
    await page.keyboard.press('r');
    await settle(frame);
    assert.deepEqual((await inspect(frame)).values, { height: 34, normals: true, debug: false });
    checks.push('shared height, A/B registration and debug work; R restores synchronized defaults');
  }

  if (slug.endsWith('emitter-basics')) {
    await button(frame, 'Pause / Resume');
    const a = await inspect(frame);
    await frame.waitForTimeout(250);
    assert.equal((await inspect(frame)).particles, a.particles);
    await button(frame, 'Reset');
    assert.equal((await inspect(frame)).particles, 0);
    await slider(frame, 'Rate / s', 200);
    await slider(frame, 'Lifetime / s', 2);
    await slider(frame, 'Speed / px/s', 120);
    await move(page, frame, 0.65, 0.5, true);
    await button(frame, 'Pause / Resume');
    await frame.waitForTimeout(1000);
    assert((await inspect(frame)).particles! > 100);
    checks.push('pause freezes live count; reset empties; rate/lifetime/speed and drag affect emitter');
  }

  if (slug.endsWith('cursor-attractor-particles')) {
    await button(frame, 'Pause / Resume');
    await slider(frame, 'Strength / px/s²', 0);
    assert.equal((await inspect(frame)).attractor!.strength, 0);
    await choose(frame, 'Force', 'Repel');
    await slider(frame, 'Strength / px/s²', 1000);
    assert.equal((await inspect(frame)).repel, 1000);
    await frame.locator('canvas').focus();
    const a = await inspect(frame);
    await page.keyboard.press('ArrowLeft');
    await settle(frame);
    assert((await inspect(frame)).targetX < a.targetX);
    await button(frame, 'Reset');
    assert.equal((await inspect(frame)).particles, 0);
    checks.push('zero reference; repulsion strength; keyboard force placement; reset clears particles');
  }

  await shot(frame, `${name}-interaction`);

  return checks;
};

try {
  for (const slug of slugs.filter(slug => !values.only || values.only.split(',').some(filter => slug.includes(filter)))) {
    for (const [width, height] of [
      [1280, 720],
      [512, 288],
    ]) {
      const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      const name = `${values.browser}-${values.backend}-${slug.split('/').at(-1)}-${width}`;

      try {
        const frame = await open(page, slug, width!, height!);
        const checks = await exercise(page, frame, slug, name);
        assert.deepEqual(errors, [], 'page errors');
        await frame.evaluate(async () => {
          window.__b6.target.destroy();
          await window.__b6.app.destroy();
        });
        await settle(frame);
        assert.equal(await frame.locator('.exo-demo-bar').count(), 0, 'panel removed after teardown');
        records.push({ example: slug, size: `${width}x${height}`, status: 'PASS', checks });
      } catch (error) {
        records.push({ example: slug, size: `${width}x${height}`, status: 'FAIL', error: String(error) });
        await page.screenshot({ path: resolve(output, `${name}-failure.png`) }).catch(() => undefined);
      } finally {
        await page.unrouteAll({ behavior: 'wait' });
        await page.close();
      }

      console.log(JSON.stringify(records.at(-1)));
    }
  }

  if (!values.only || values.only.split(',').includes('texture-sampling')) {
    for (const dpr of [1.25, 2, 3]) {
      const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: dpr });

      try {
        const frame = await open(page, 'sprites-textures/texture-sampling', 512, 288);
        const checks = await exercise(
          page,
          frame,
          'sprites-textures/texture-sampling',
          `${values.browser}-${values.backend}-sampling-dpr${dpr}-512`,
        );
        const device = await frame.evaluate(() => ({
          dpr: devicePixelRatio,
          ratio: window.__b6.app.pixelRatio,
          buffer: [window.__b6.app.canvas.width, window.__b6.app.canvas.height],
        }));
        assert.equal(device.dpr, dpr);
        assert.equal(device.buffer[0], 1280 * device.ratio);
        assert.equal(device.buffer[1], 720 * device.ratio);
        await frame.evaluate(async () => {
          window.__b6.target.destroy();
          await window.__b6.app.destroy();
        });
        records.push({ example: 'sprites-textures/texture-sampling', size: `DPR ${dpr} 512x288`, status: 'PASS', checks });
      } catch (error) {
        records.push({ example: 'sprites-textures/texture-sampling', size: `DPR ${dpr} 512x288`, status: 'FAIL', error: String(error) });
      } finally {
        await page.unrouteAll({ behavior: 'wait' });
        await page.close();
      }
    }
  }

  if (!values.only || values.only.split(',').includes('video-drawable')) {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

    try {
      await page.route('**/demo-loop.webm*', route => route.fulfill({ status: 404, body: 'missing media fixture' }));
      const frame = await open(page, 'sprites-textures/video-drawable', 512, 288);
      await frame.waitForFunction(() => (window.__b6.app.scenes.currentScene as unknown as Probe).mediaState.startsWith('Error:'), null, {
        timeout: 30000,
      });
      assert.equal((await inspect(frame)).video, null);
      await shot(frame, `${values.browser}-${values.backend}-video-error-512`);
      await frame.evaluate(async () => {
        window.__b6.target.destroy();
        await window.__b6.app.destroy();
      });
      records.push({
        example: 'sprites-textures/video-drawable',
        size: 'media error 512x288',
        status: 'PASS',
        checks: ['actual HTTP 404 yields visible media error and teardown completes'],
      });
    } catch (error) {
      records.push({ example: 'sprites-textures/video-drawable', size: 'media error 512x288', status: 'FAIL', error: String(error) });
    } finally {
      await page.unrouteAll({ behavior: 'wait' });
      await page.close();
    }
  }

  if (!values.only || values.only.split(',').includes('video-drawable') || values.only === 'video-pending') {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    let releaseMedia!: () => void;
    const mediaGate = new Promise<void>(resolve => {
      releaseMedia = resolve;
    });

    try {
      await page.route('**/demo-loop.webm*', async route => {
        await mediaGate;
        await route.continue().catch(() => undefined);
      });
      const frame = await open(page, 'sprites-textures/video-drawable', 512, 288);
      await slider(frame, 'Seek %', 25);
      assert.equal((await inspect(frame)).loading, true);
      await shot(frame, `${values.browser}-${values.backend}-video-loading-512`);
      await frame.evaluate(async () => {
        window.__b6.target.destroy();
        await window.__b6.app.destroy();
      });
      releaseMedia();
      await frame.waitForTimeout(1800);
      assert.equal(await frame.locator('.exo-demo-bar').count(), 0);
      records.push({
        example: 'sprites-textures/video-drawable',
        size: 'leave during loading 512x288',
        status: 'PASS',
        checks: ['seek before ready is accepted; app teardown during delayed media load removes controls and ignores late completion'],
      });
    } catch (error) {
      records.push({
        example: 'sprites-textures/video-drawable',
        size: 'leave during loading 512x288',
        status: 'FAIL',
        error: String(error),
      });
    } finally {
      releaseMedia();
      await page.unrouteAll({ behavior: 'wait' });
      await page.close();
    }
  }
} finally {
  const version = browser.version();
  await browser.close();
  await writeFile(
    resolve(output, `${values.browser}-${values.backend}${values.only ? `-${values.only}` : ''}-results.json`),
    `${JSON.stringify({ browser: values.browser, version, backend: values.backend, records }, null, 2)}\n`,
  );
}

assert(
  records.every(record => record.status === 'PASS'),
  'B6 acceptance failed',
);
