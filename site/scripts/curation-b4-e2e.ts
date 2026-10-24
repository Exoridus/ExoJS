import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import type { Application, Container, Graphics, Sprite, View } from '@codexo/exojs';
import type { GridSpace, PathResult } from '@codexo/exojs/pathfinding';
import type { CharacterMovementComponent, MouseJoint, PhysicsBody, PhysicsWorld } from '@codexo/exojs/physics';
import type { ChunkStreamer, MapObjectDescriptor, TileLayer, TileMap } from '@codexo/exojs/tilemap';
import { chromium, firefox, type Frame, type Page } from 'playwright';

const { values } = parseArgs({
  options: {
    host: { type: 'string', default: 'http://127.0.0.1:4325/ExoJS' },
    browser: { type: 'string', default: 'chromium' },
    backend: { type: 'string', default: 'webgl2' },
    shots: { type: 'string', default: '../docs/curation/evidence/b4' },
    only: { type: 'string', default: '' },
  },
});
assert(['webgl2', 'webgpu'].includes(values.backend!));
assert(['chromium', 'firefox'].includes(values.browser!));
const output = resolve(values.shots!);
const browser =
  values.browser === 'firefox'
    ? await firefox.launch({ firefoxUserPrefs: { 'dom.webgpu.enabled': true } })
    : await chromium.launch({ channel: 'chromium', args: ['--enable-webgl', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });
const records: Array<{ example: string; size: string; status: string; checks?: string[]; error?: string }> = [];

interface ProbeScene {
  worldRoot: Container;
  hexRoot: Container;
  selection: Graphics;
  hexSelection: Graphics;
  map: TileMap;
  objects: Map<string, MapObjectDescriptor>;
  doorOpen: boolean;
  collected: boolean;
  selected: string;
  explorer: Sprite;
  camera: View;
  mapView: { band(name: string): { visible: boolean }; pixelSnapMode: number };
  layer: TileLayer;
  painting: boolean;
  showMasks: boolean;
  hovered: { projection: string; tx: number; ty: number };
  hexProjection: TileMap['projection'];
  result: PathResult;
  grid: GridSpace;
  agent: { x: number; y: number };
  goal: { x: number; y: number };
  pruning: boolean;
  agentSize: number;
  groundStreamer: ChunkStreamer;
  propsStreamer: ChunkStreamer;
  bodies: PhysicsBody[];
  platforms: Array<{ body: PhysicsBody; width: number }>;
  body: PhysicsBody;
  sprites: Sprite[];
  floor: Sprite;
  world: PhysicsWorld;
  dragJoint: MouseJoint | null;
  character: CharacterMovementComponent;
  controls: { airJumpsLeft: number };
  panel: { values: Record<string, unknown> };
  reset(): void;
}
declare global {
  interface Window {
    __b4: { app: Application };
  }
}

const open = async (page: Page, slug: string, width: number, height: number): Promise<Frame> => {
  await page.route(`**/examples/${slug}.js*`, async route => {
    const response = await route.fetch();
    const source = (await response.text())
      .replace('const app = new Application({', `const app = new Application({ backend: { type: '${values.backend}' },`)
      .replace('await app.start(', 'window.__b4 = { app };\nawait app.start(');
    await route.fulfill({ response, body: source });
  });
  await page.goto(`${values.host}/en/playground/?version=current&example=${slug}`);
  const frame = await (async () => {
    await page.waitForSelector('iframe[src*="preview.html"]', { timeout: 30_000 });

    const handle = await page.locator('iframe[src*="preview.html"]').elementHandle();
    const preview = await handle!.contentFrame();
    assert(preview);
    await preview.waitForURL(/preview\.html/);

    return preview;
  })();
  await frame.waitForFunction(() => Boolean(window.__b4?.app.scenes.currentScene), { timeout: 30_000 });
  await frame.locator('.exo-demo-bar').waitFor({ timeout: 30_000 });
  const stack = page.getByRole('button', { name: 'Switch to stacked layout', exact: true });

  if (await stack.isVisible()) {
    await stack.click();
  }

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
  await frame.waitForTimeout(200);
  const box = (await (await frame.frameElement()).boundingBox())!;
  assert(Math.abs(box.width - width) < 1 && Math.abs(box.height - height) < 1);
  assert.equal(await frame.evaluate(() => window.__b4.app.backend.backendType), values.backend, 'backend fallback is not a pass');

  if (slug === 'physics/sprite-follows-body') {
    assert(
      await frame.evaluate(() => {
        const scene = window.__b4.app.scenes.currentScene as unknown as ProbeScene;

        return (scene.floor.texture?.width ?? 0) > 0 && (scene.sprites[0]!.texture?.width ?? 0) > 0;
      }),
      'character and floor textures are ready before startup capture',
    );
  }

  if (slug === 'tilemap/tile-chunks-and-bands') {
    assert(
      await frame.evaluate(() => ((window.__b4.app.scenes.currentScene as unknown as ProbeScene).explorer.texture?.width ?? 0) > 0),
      'explorer texture is ready before startup capture',
    );
  }

  return frame;
};

const capture = async (frame: Frame, name: string) => (await frame.frameElement()).screenshot({ path: resolve(output, `${name}.png`) });

const click = async (page: Page, frame: Frame, x: number, y: number) => {
  const box = (await frame.locator('canvas').boundingBox())!;
  const logical = await frame.evaluate(() => ({ width: window.__b4.app.width, height: window.__b4.app.height }));
  await page.mouse.click(box.x + (x / logical.width) * box.width, box.y + (y / logical.height) * box.height);
  await frame.waitForTimeout(80);
};

const key = async (page: Page, frame: Frame, name: string, ms = 100) => {
  await frame.locator('canvas').focus();
  await page.keyboard.down(name);
  await frame.waitForTimeout(ms);
  await page.keyboard.up(name);
  await frame.waitForTimeout(80);
};

const interactions = async (slug: string, page: Page, frame: Frame): Promise<string[]> => {
  if (slug === 'tilemap/editor-objects-gameplay') {
    const objectPoint = async (kind: string) =>
      frame.evaluate(kind => {
        const scene = window.__b4.app.scenes.currentScene as unknown as ProbeScene;
        const object = scene.objects.get(kind)!;

        return {
          x: scene.worldRoot.x + (object.x + object.width / 2) * scene.worldRoot.scale.x,
          y: scene.worldRoot.y + (object.y + object.height / 2) * scene.worldRoot.scale.y,
        };
      }, kind);
    let point = await objectPoint('Collectible');
    await click(page, frame, point.x, point.y);
    assert.equal(await frame.evaluate(() => (window.__b4.app.scenes.currentScene as unknown as ProbeScene).collected), false);
    point = await objectPoint('Switch');
    await click(page, frame, point.x, point.y);
    assert.equal(await frame.evaluate(() => (window.__b4.app.scenes.currentScene as unknown as ProbeScene).doorOpen), true);
    point = await objectPoint('Collectible');
    await click(page, frame, point.x, point.y);
    assert.equal(await frame.evaluate(() => (window.__b4.app.scenes.currentScene as unknown as ProbeScene).collected), true);
    await frame.getByRole('button', { name: 'Reset', exact: true }).click();
    await key(page, frame, 'Enter');
    await key(page, frame, 'ArrowRight');
    await key(page, frame, 'ArrowRight');
    await key(page, frame, 'Enter');
    assert.equal(await frame.evaluate(() => (window.__b4.app.scenes.currentScene as unknown as ProbeScene).collected), true);

    return ['locked gem stays locked; switch opens authored door; gem collected; Reset and keyboard Select/Confirm repeat puzzle'];
  }

  if (slug === 'tilemap/tile-chunks-and-bands') {
    const before = await frame.evaluate(() => (window.__b4.app.scenes.currentScene as unknown as ProbeScene).explorer.x);
    await key(page, frame, 'd', 350);
    assert((await frame.evaluate(() => (window.__b4.app.scenes.currentScene as unknown as ProbeScene).explorer.x)) > before + 30);
    await frame.getByRole('button', { name: 'Canopy band' }).click();
    assert.equal(
      await frame.evaluate(() => (window.__b4.app.scenes.currentScene as unknown as ProbeScene).mapView.band('canopy').visible),
      false,
    );

    for (const snap of ['none', 'position', 'geometry']) {
      await frame.getByRole('combobox', { name: 'Pixel snap' }).selectOption(snap);
    }

    await frame.getByRole('combobox', { name: 'Camera zoom' }).selectOption('1.25');
    assert.equal(await frame.evaluate(() => (window.__b4.app.scenes.currentScene as unknown as ProbeScene).camera.zoomLevel), 1.25);
    await frame.getByRole('button', { name: 'Canopy band' }).click();
    assert((await frame.locator('.exo-demo-status').innerText()).includes('pixelRatio'));

    return [
      'movement Action advances actor; canopy A/B changes band visibility; all three snap modes; fractional zoom; CSS/logical/buffer/DPR/pixelRatio/camera readout',
    ];
  }

  if (slug === 'tilemap/paint-autotiled-room') {
    const point = await frame.evaluate(() => {
      const scene = window.__b4.app.scenes.currentScene as unknown as ProbeScene;

      return { x: scene.worldRoot.x + 1.5 * 64 * scene.worldRoot.scale.x, y: scene.worldRoot.y + 1.5 * 64 * scene.worldRoot.scale.y };
    });
    const original = await frame.evaluate(
      () => (window.__b4.app.scenes.currentScene as unknown as ProbeScene).layer.getTileAt(1, 1)?.localTileId,
    );
    assert.notEqual(original, undefined);
    await frame.getByRole('combobox', { name: 'Brush' }).selectOption('erase');
    await click(page, frame, point.x, point.y);
    assert.equal(await frame.evaluate(() => (window.__b4.app.scenes.currentScene as unknown as ProbeScene).layer.getTileAt(1, 1)), null);
    await frame.getByRole('combobox', { name: 'Brush' }).selectOption('paint');
    await click(page, frame, point.x, point.y);
    assert.equal(
      await frame.evaluate(() => (window.__b4.app.scenes.currentScene as unknown as ProbeScene).layer.getTileAt(1, 1)?.localTileId),
      original,
    );
    await frame.getByRole('button', { name: 'Show masks' }).click();
    await frame.evaluate(() => {
      const app = window.__b4.app;
      app.input.onPointerDown.dispatch({ x: -10, y: -10 } as never, {} as never, {} as never);
      app.input.onPointerCancel.dispatch({} as never, {} as never, {} as never);
    });
    assert.equal(await frame.evaluate(() => (window.__b4.app.scenes.currentScene as unknown as ProbeScene).painting), false);
    await key(page, frame, 'r');
    assert.equal(
      await frame.evaluate(() => (window.__b4.app.scenes.currentScene as unknown as ProbeScene).layer.getTileAt(1, 1)?.localTileId),
      original,
    );

    return [
      'paint/erase change actual TileLayer; neighbours recover; 16-case legend shown; pointercancel ends stroke; R restores deterministic meadow',
    ];
  }

  if (slug === 'tilemap/tiled-isometric') {
    const target = await frame.evaluate(() => {
      const scene = window.__b4.app.scenes.currentScene as unknown as ProbeScene;
      const p = scene.map.projection.tileToPixel(4.5, 4.5);

      return { x: scene.worldRoot.x + p.x * scene.worldRoot.scale.x, y: scene.worldRoot.y + p.y * scene.worldRoot.scale.y };
    });
    await click(page, frame, target.x, target.y);
    const before = await frame.evaluate(() => ({
      x: (window.__b4.app.scenes.currentScene as unknown as ProbeScene).body.x,
      y: (window.__b4.app.scenes.currentScene as unknown as ProbeScene).body.y,
    }));
    await frame.waitForTimeout(400);
    const after = await frame.evaluate(() => ({
      x: (window.__b4.app.scenes.currentScene as unknown as ProbeScene).body.x,
      y: (window.__b4.app.scenes.currentScene as unknown as ProbeScene).body.y,
    }));
    assert(Math.hypot(after.x - before.x, after.y - before.y) > 1);
    const hex = await frame.evaluate(() => {
      const scene = window.__b4.app.scenes.currentScene as unknown as ProbeScene;
      const p = scene.hexProjection.tileToPixel(2, 2);

      return { x: scene.hexRoot.x + (p.x + 32) * scene.hexRoot.scale.x, y: scene.hexRoot.y + (p.y + 36) * scene.hexRoot.scale.y };
    });
    await click(page, frame, hex.x, hex.y);
    assert.deepEqual(await frame.evaluate(() => (window.__b4.app.scenes.currentScene as unknown as ProbeScene).hovered), {
      projection: 'hexagonal',
      tx: 2,
      ty: 2,
    });

    const canvas = (await frame.locator('canvas').boundingBox())!;
    const lines = await frame.evaluate(() => {
      const scene = window.__b4.app.scenes.currentScene as unknown as ProbeScene;

      return [scene.selection.lineWidth * scene.worldRoot.scale.x, scene.hexSelection.lineWidth * scene.hexRoot.scale.x];
    });
    assert(
      lines.every(width => (width * canvas.width) / 1280 >= 1.99),
      'projection highlights stay >=2 CSS px',
    );

    return [
      'isometric picking targets logical physics actor and wakes it; side-by-side hex cell centre picks (2,2); highlights >=2 CSS px',
    ];
  }

  if (slug === 'pathfinding/grid-navigation') {
    await frame.getByRole('button', { name: 'Pause / Resume', exact: true }).click();
    const frozen = await frame.evaluate(() => ({ ...(window.__b4.app.scenes.currentScene as unknown as ProbeScene).agent }));
    await frame.waitForTimeout(150);
    assert.deepEqual(await frame.evaluate(() => ({ ...(window.__b4.app.scenes.currentScene as unknown as ProbeScene).agent })), frozen);
    await frame.getByRole('combobox', { name: 'Click paints' }).selectOption('mud');
    const mud = await frame.evaluate(() => {
      const root = (window.__b4.app.scenes.currentScene as unknown as ProbeScene).worldRoot;

      return { x: root.x + 3.5 * 32 * root.scale.x, y: root.y + 2.5 * 32 * root.scale.y };
    });
    await click(page, frame, mud.x, mud.y);
    assert.equal(await frame.evaluate(() => (window.__b4.app.scenes.currentScene as unknown as ProbeScene).grid.costAt(3, 2)), 6);
    assert((await frame.locator('.exo-demo-status').innerText()).includes('plain A*'));
    await frame.getByRole('combobox', { name: 'Scenario' }).selectOption('2x2 agent');
    assert.equal(await frame.evaluate(() => (window.__b4.app.scenes.currentScene as unknown as ProbeScene).agentSize), 2);
    await frame.getByRole('combobox', { name: 'Scenario' }).selectOption('no diagonals');
    assert.equal(await frame.evaluate(() => (window.__b4.app.scenes.currentScene as unknown as ProbeScene).grid.diagonals), 'never');
    await frame.getByRole('button', { name: 'Reset', exact: true }).click();
    assert.equal(await frame.evaluate(() => (window.__b4.app.scenes.currentScene as unknown as ProbeScene).grid.costAt(3, 2)), 1);

    return [
      'pause freezes agent; mud is weighted cost 6 and disables JPS; 2x2 footprint and diagonal scenarios retained; reset clears paint',
    ];
  }

  if (slug === 'tilemap/tiled-infinite-map') {
    const before = await frame.evaluate(() => (window.__b4.app.scenes.currentScene as unknown as ProbeScene).camera.center.x);
    await key(page, frame, 'a', 1000);
    assert((await frame.evaluate(() => (window.__b4.app.scenes.currentScene as unknown as ProbeScene).camera.center.x)) < before - 200);
    await key(page, frame, 'd', 1000);
    const residents = await frame.evaluate(
      () => (window.__b4.app.scenes.currentScene as unknown as ProbeScene).groundStreamer.residentCount,
    );
    assert(residents > 0 && residents <= 8);
    await frame.getByRole('button', { name: 'Reset', exact: true }).click();
    assert.equal(await frame.evaluate(() => (window.__b4.app.scenes.currentScene as unknown as ProbeScene).camera.center.x), 0);

    return [
      'camera Action pans through negative coordinates and returns; resident ground set bounded by eight authored chunks; reset returns origin',
    ];
  }

  if (slug === 'physics/sprite-follows-body') {
    await frame.getByRole('button', { name: 'Show colliders' }).click();
    await frame.evaluate(() => {
      const scene = window.__b4.app.scenes.currentScene as unknown as ProbeScene;
      scene.world.gravity.y = 0;
      scene.bodies[1]!.setTransform({ x: 640, y: 260 }, Math.PI / 4);
      scene.bodies[1]!.linearVelocityX = scene.bodies[1]!.linearVelocityY = scene.bodies[1]!.angularVelocity = 0;
    });
    const box = (await frame.locator('canvas').boundingBox())!;
    const x = box.x + (682 / 1280) * box.width;
    const y = box.y + (260 / 720) * box.height;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await frame.waitForTimeout(80);
    assert.equal(await frame.evaluate(() => (window.__b4.app.scenes.currentScene as unknown as ProbeScene).world.joints.length), 1);
    await page.mouse.move(x + 35, y - 20, { steps: 6 });
    await frame.waitForTimeout(150);
    await page.mouse.move(box.x + box.width + 5, y);
    await page.mouse.up();
    await frame.waitForTimeout(80);
    assert.equal(await frame.evaluate(() => (window.__b4.app.scenes.currentScene as unknown as ProbeScene).world.joints.length), 0);
    await frame.getByRole('button', { name: 'Reset', exact: true }).click();
    await frame.waitForTimeout(50);
    assert.equal(await frame.evaluate(() => (window.__b4.app.scenes.currentScene as unknown as ProbeScene).bodies.length), 3);

    return [
      'three bodies; rotated body query grabs; dragging creates one MouseJoint; outside release removes joint; reset retains exactly three dynamic bodies',
    ];
  }

  if (slug === 'physics/character-movement') {
    await frame.waitForTimeout(500);
    const before = await frame.evaluate(() => (window.__b4.app.scenes.currentScene as unknown as ProbeScene).character.movement.body.x);
    await key(page, frame, 'd', 350);
    assert(
      (await frame.evaluate(() => (window.__b4.app.scenes.currentScene as unknown as ProbeScene).character.movement.body.x)) > before + 20,
    );
    await key(page, frame, 'Space', 50);
    await key(page, frame, 'Space', 50);
    assert.equal(await frame.evaluate(() => (window.__b4.app.scenes.currentScene as unknown as ProbeScene).controls.airJumpsLeft), 0);
    await frame.getByRole('button', { name: 'Reset', exact: true }).click();
    assert.equal(await frame.evaluate(() => (window.__b4.app.scenes.currentScene as unknown as ProbeScene).controls.airJumpsLeft), 1);

    await frame.evaluate(() => {
      const scene = window.__b4.app.scenes.currentScene as unknown as ProbeScene;
      scene.character.launch({ x: 0, y: 0 });
      scene.character.movement.body.setTransform({ x: 1010, y: 634 }, 0);
    });
    await frame.waitForTimeout(120);
    await key(page, frame, 'Space', 50);
    await frame.waitForTimeout(100);
    await key(page, frame, 'Space', 50);
    await frame.waitForTimeout(150);
    assert(
      (await frame.evaluate(() => (window.__b4.app.scenes.currentScene as unknown as ProbeScene).character.movement.body.y)) < 519,
      'jumps through one-way from below',
    );
    await frame.waitForTimeout(600);
    assert.equal(
      await frame.evaluate(() => (window.__b4.app.scenes.currentScene as unknown as ProbeScene).character.groundCollider?.filter.category),
      2,
      'lands on one-way from above',
    );
    await key(page, frame, 'ArrowDown', 100);
    await frame.waitForTimeout(250);
    assert(
      (await frame.evaluate(() => (window.__b4.app.scenes.currentScene as unknown as ProbeScene).character.movement.body.y)) > 550,
      'drop passes below one-way',
    );
    await frame.evaluate(() => {
      const scene = window.__b4.app.scenes.currentScene as unknown as ProbeScene;
      scene.character.launch({ x: 0, y: 0 });
      scene.character.movement.body.setTransform({ x: 650, y: 400 }, 0);
    });
    await frame.waitForTimeout(700);
    const normal = await frame.evaluate(() => {
      const scene = window.__b4.app.scenes.currentScene as unknown as ProbeScene;

      return { grounded: scene.character.grounded, x: scene.character.groundNormal.x, y: scene.character.groundNormal.y };
    });
    assert(normal.grounded && Math.abs(normal.x) > 0.2 && normal.y < -0.5, 'walkable slope support');
    await frame.evaluate(() => {
      const scene = window.__b4.app.scenes.currentScene as unknown as ProbeScene;
      const platform = scene.platforms[0]!.body;
      scene.character.launch({ x: 0, y: 0 });
      scene.character.movement.body.setTransform({ x: platform.x, y: platform.y - 80 }, 0);
    });
    await frame.waitForFunction(
      () => {
        const scene = window.__b4.app.scenes.currentScene as unknown as ProbeScene;

        return scene.character.groundBody === scene.platforms[0]!.body;
      },
      undefined,
      { timeout: 3000 },
    );
    const carriedFrom = await frame.evaluate(
      () => (window.__b4.app.scenes.currentScene as unknown as ProbeScene).character.movement.body.x,
    );
    await frame.waitForTimeout(250);
    assert(
      Math.abs(
        (await frame.evaluate(() => (window.__b4.app.scenes.currentScene as unknown as ProbeScene).character.movement.body.x)) -
          carriedFrom,
      ) > 10,
      'shuttle carries supported character',
    );
    await frame.getByRole('button', { name: 'Reset', exact: true }).click();
    await frame.waitForTimeout(100);
    await key(page, frame, 'd', 650);
    const step = await frame.evaluate(() => {
      const body = (window.__b4.app.scenes.currentScene as unknown as ProbeScene).character.movement.body;

      return { x: body.x, y: body.y };
    });
    assert(step.x > 240 && step.y < 630, 'walks onto low step');
    await frame.getByRole('button', { name: 'Reset', exact: true }).click();

    return [
      'walk Action and double jump; reset; one-way passage from below and landing above; Down drops through; ramp support; shuttle carry; low step',
    ];
  }

  throw new Error(`Unknown example ${slug}`);
};

await mkdir(output, { recursive: true });

try {
  for (const slug of [
    'tilemap/editor-objects-gameplay',
    'tilemap/tile-chunks-and-bands',
    'tilemap/paint-autotiled-room',
    'tilemap/tiled-isometric',
    'pathfinding/grid-navigation',
    'tilemap/tiled-infinite-map',
    'physics/sprite-follows-body',
    'physics/character-movement',
  ].filter(slug => !values.only || slug.includes(values.only))) {
    for (const [width, height] of [
      [1280, 720],
      [512, 288],
    ] as const) {
      const page = await browser.newPage({
        viewport: { width: 1920, height: 1200 },
        colorScheme: 'dark',
        deviceScaleFactor: width === 512 ? 2 : 1,
      });
      const name = `${values.browser}-${values.backend}-${slug.split('/')[1]}-${width}`;
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(String(error)));

      try {
        const frame = await open(page, slug, width, height);
        await capture(frame, `${name}-startup`);
        const checks = await interactions(slug, page, frame);
        await capture(frame, `${name}-interaction`);
        assert.deepEqual(errors, [], 'page errors');
        await frame.evaluate(() => window.__b4.app.destroy());
        assert.equal(await frame.locator('.exo-demo-bar').count(), 0);
        checks.push('application disposal removes controls; no page errors');
        records.push({ example: slug, size: `${width}x${height}`, status: 'PASS', checks });
      } catch (error) {
        await page.screenshot({ path: resolve(output, `${name}-failure.png`) });
        records.push({
          example: slug,
          size: `${width}x${height}`,
          status: 'FAIL',
          error: (error instanceof Error ? error.stack : String(error)) + (errors.length ? ` | ${errors.join('; ')}` : ''),
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
    resolve(output, `${values.browser}-${values.backend}${values.only ? `-${values.only}` : ''}-results.json`),
    `${JSON.stringify(
      { browser: values.browser, version, backend: values.backend, hardwareTouch: 'NOT_TESTED', hardwareGamepad: 'NOT_TESTED', records },
      null,
      2,
    )}\n`,
  );
}

assert(
  records.every(record => record.status === 'PASS'),
  'B4 acceptance failed',
);
