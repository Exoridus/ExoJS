/**
 * Run the authored guide modules, including their real Application, media,
 * shaders, input transports and physics. These sources are intentionally not
 * in the Playground catalog, so importing a recreated fixture would miss them.
 *
 * The only replacement selects this project's real WebGL2 backend before the
 * Application constructor runs. Capability checks and backend creation are
 * unchanged; a missing browser capability fails this lane rather than passing
 * through a stand-in. The start spy calls the original implementation and only
 * captures ownership for assertions and teardown.
 */
import { CharacterMovementComponent, PhysicsBodyComponent } from '@codexo/exojs/physics';
import { page, server, userEvent } from 'vitest/browser';

import { Sound } from '#audio/Sound';
import { Application } from '#core/Application';
import type { Scene } from '#core/scene/Scene';
import { Container } from '#rendering/Container';
import type { Graphics } from '#rendering/primitives/Graphics';
import type { RenderNode } from '#rendering/RenderNode';
import { AnimatedSprite } from '#rendering/sprite/AnimatedSprite';
import { Sprite } from '#rendering/sprite/Sprite';
import { BitmapText } from '#rendering/text/BitmapText';
import { Text } from '#rendering/text/Text';
import { Texture } from '#rendering/texture/Texture';
import type { View } from '#rendering/View';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';
import { Button } from '#ui/Button';
import { Label } from '#ui/Label';
import { TextInput } from '#ui/TextInput';

vi.mock(import('#core/application/backendSelection'), async importOriginal => ({
  ...(await importOriginal()),
  resolveBackendType: () => 'webgl2' as const,
}));

const applications: Application[] = [];
const errors: string[] = [];
const poll = { timeout: 10_000, interval: 20 };
const previousViewport = { width: window.innerWidth, height: window.innerHeight };

beforeAll(async () => {
  await page.viewport(960, 640);
});

afterAll(async () => {
  await page.viewport(previousViewport.width, previousViewport.height);
});

beforeEach(() => {
  errors.length = 0;
  const start = Application.prototype.start;

  vi.spyOn(Application.prototype, 'start').mockImplementation(function (this: Application, ...args) {
    applications.push(this);
    this.onError.add(error => errors.push(error.message));

    return Reflect.apply(start, this, args) as ReturnType<typeof start>;
  });
  const report = console.error;

  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    errors.push(args.map(String).join(' '));
    report(...args);
  });
});

afterEach(async () => {
  try {
    try {
      await userEvent.cleanup();
    } finally {
      for (const app of applications.splice(0)) {
        const canvas = app.canvas;

        await app.destroy();
        expect((canvas as HTMLCanvasElement).isConnected).toBe(false);
      }
    }

    expect(errors).toEqual([]);
  } finally {
    vi.restoreAllMocks();
  }
});

const frames = (app: Application, count: number): Promise<void> =>
  new Promise(resolve => {
    let remaining = count;

    const onFrame = (): void => {
      if (--remaining === 0) {
        app.onFrame.remove(onFrame);
        resolve();
      }
    };

    app.onFrame.add(onFrame);
  });

const currentScene = (app: Application): Scene => {
  const scene = app.scenes.currentScene;

  expect(scene).not.toBeNull();

  return scene!;
};

const canvasOf = (app: Application): HTMLCanvasElement => {
  expect(app.canvas).toBeInstanceOf(HTMLCanvasElement);

  return app.canvas as HTMLCanvasElement;
};

const boot = async (load: () => Promise<unknown>, sceneName: string): Promise<Application> => {
  await load();
  expect(applications).toHaveLength(1);
  const app = applications[0]!;

  expect(app.backend).toBeInstanceOf(WebGl2Backend);
  expect(currentScene(app).constructor.name).toBe(sceneName);
  expect(canvasOf(app).isConnected).toBe(true);
  expect(canvasOf(app).getBoundingClientRect().width).toBeGreaterThan(0);
  await expect.poll(() => app.loader.inspect().every(row => row.state === 'ready'), poll).toBe(true);
  await frames(app, 2);

  return app;
};

const descendants = function* (node: RenderNode): Generator<RenderNode> {
  yield node;

  if (node instanceof Container) {
    for (const child of node.children) {
      yield* descendants(child);
    }
  }
};

const button = (scene: Scene, label: string): Button => {
  const found = [...descendants(scene.ui)].find(node => node instanceof Button && node.label === label);

  expect(found, `button: ${label}`).toBeInstanceOf(Button);

  return found as Button;
};

const click = async (app: Application, node: RenderNode): Promise<void> => {
  const canvas = canvasOf(app);
  const box = canvas.getBoundingClientRect();
  const bounds = node.getBounds();

  await userEvent.click(canvas, {
    position: {
      x: ((bounds.x + bounds.width / 2) * box.width) / app.width,
      y: ((bounds.y + bounds.height / 2) * box.height) / app.height,
    },
  });
};

const hold = async (keys: readonly string[], action: () => Promise<void>): Promise<void> => {
  await userEvent.keyboard(keys.map(key => `[${key}>]`).join(''));

  try {
    await action();
  } finally {
    await userEvent.keyboard(keys.map(key => `[/${key}]`).join(''));
  }
};

interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Read actual rendered pixels, then save the live canvas through the existing browser provider. */
const rendered = async (app: Application, id: string, regions: readonly Region[]): Promise<void> => {
  const canvas = canvasOf(app);

  await expect.element(canvas).toBeVisible();
  const bounds = canvas.getBoundingClientRect();

  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.top).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(window.innerWidth);
  expect(bounds.bottom).toBeLessThanOrEqual(window.innerHeight);

  const { width, height } = app;
  const target = app.backend.acquireRenderTexture(width, height);

  try {
    app.rendering._renderSurfaceInto(target, app.clearColor, () => app.scenes.draw(app.rendering));
    app.backend.flush();
    const pixels = await app.backend.readPixels(target, 0, 0, width, height);
    // Every guide leaves its top-right corner clear. Compare against its actual
    // encoded bytes, so this check does not assume a target colour transfer.
    const clear = (width - 1) * 4;

    for (const region of regions) {
      let painted = 0;

      for (let y = Math.max(0, Math.floor(region.y)); y < Math.min(height, region.y + region.height); y++) {
        for (let x = Math.max(0, Math.floor(region.x)); x < Math.min(width, region.x + region.width); x++) {
          const i = (y * width + x) * 4;
          const difference =
            Math.abs(pixels[i]! - pixels[clear]!) +
            Math.abs(pixels[i + 1]! - pixels[clear + 1]!) +
            Math.abs(pixels[i + 2]! - pixels[clear + 2]!);

          if (difference > 12) {
            painted++;
          }
        }
      }

      const { x, y, width: regionWidth, height: regionHeight } = region;

      expect(painted, `painted pixels in [${x}, ${y}, ${regionWidth}, ${regionHeight}]`).toBeGreaterThan(16);
    }
  } finally {
    app.backend.releaseRenderTexture(target);
  }

  const path = `../../../.workspace/visual-review/current/guide-${id}-webgl2-${server.browser}.png`;

  await page.screenshot({ element: canvas, path });
  console.info('guide visual evidence', {
    guide: id,
    browser: server.browser,
    scene: currentScene(app).constructor.name,
    paused: app.scenes.paused,
    capturedAt: new Date().toISOString(),
    path,
  });
};

describe('actual guide workflows on WebGL2', { concurrent: false }, () => {
  test('sprite animation renders real textures and pauses/resumes through scene input', async () => {
    const app = await boot(() => import('../../../examples/guides/animation/sprite-animation'), 'SpriteAnimationScene');
    const scene = currentScene(app);
    const still = scene.root.children[0] as Sprite;
    const animated = scene.root.children[1] as AnimatedSprite;

    expect(still).toBeInstanceOf(Sprite);
    expect(animated).toBeInstanceOf(AnimatedSprite);
    expect((still.texture as Texture).ready).toBe(true);
    expect((animated.texture as Texture).ready).toBe(true);
    await userEvent.click(canvasOf(app));
    const changed = vi.fn();
    animated.onFrame.add(changed);
    await expect.poll(() => changed.mock.calls.length, poll).toBeGreaterThan(0);
    await userEvent.keyboard('p');
    await expect.poll(() => scene.paused, poll).toBe(true);
    const pausedFrame = animated.currentFrame;
    changed.mockClear();
    await frames(app, 12);
    expect(animated.currentFrame).toBe(pausedFrame);
    expect(changed).not.toHaveBeenCalled();
    await rendered(app, 'sprite-animation-paused', [still.getBounds(), animated.getBounds()]);
    await userEvent.keyboard('p');
    await expect.poll(() => scene.paused, poll).toBe(false);
    await expect.poll(() => changed.mock.calls.length, poll).toBeGreaterThan(0);
  }, 30_000);

  test('sprite movement keeps the artwork at its pivot and collides with the real obstacle', async () => {
    const app = await boot(() => import('../../../examples/guides/physics-basics/sprite-movement'), 'SpriteMovementScene');
    const ball = currentScene(app).root.children[0] as Sprite;
    const physics = ball.getComponent(PhysicsBodyComponent)!;

    expect(ball.x).toBe(200);
    expect(ball.y).toBe(220);
    expect(physics.body.x).toBe(200);
    expect(physics.body.y).toBe(220);
    await rendered(app, 'sprite-movement', [ball.getBounds(), { x: 388, y: 148, width: 144, height: 144 }]);
    await userEvent.click(canvasOf(app));
    const contactX = 460 - 72 - (ball.texture as Texture).logicalWidth / 2;

    await hold(['KeyD'], async () => {
      await expect.poll(() => ball.x, poll).toBeGreaterThan(contactX - 2);
      await frames(app, 12);
      expect(ball.x).toBeLessThanOrEqual(contactX + 1);
    });
    const stoppedX = ball.x;

    await hold(['KeyW', 'KeyD'], async () => {
      await expect.poll(() => ball.y, poll).toBeLessThan(190);
      expect(ball.x).toBeGreaterThan(stoppedX);
    });
  }, 30_000);

  test('animated character lands, walks, jumps and returns to idle', async () => {
    const app = await boot(() => import('../../../examples/guides/character-movement/animated-character'), 'AnimatedCharacterScene');
    const visual = currentScene(app).root.children[1] as AnimatedSprite;
    const character = visual.getComponent(CharacterMovementComponent)!;

    await expect.poll(() => character.grounded && visual.currentClip === 'idle', poll).toBe(true);
    const landedY = visual.y;
    await rendered(app, 'animated-character-grounded', [visual.getBounds()]);
    await userEvent.click(canvasOf(app));
    const beforeX = visual.x;

    await hold(['KeyD'], async () => {
      await expect.poll(() => visual.x, poll).toBeGreaterThan(beforeX + 20);
      expect(visual.currentClip).toBe('walk');
    });
    await hold(['Space'], async () => {
      await expect.poll(() => visual.y, poll).toBeLessThan(landedY - 10);
      expect(character.grounded).toBe(false);
      expect(visual.currentClip).toBe('jump');
    });
    await expect.poll(() => character.grounded && visual.currentClip === 'idle', poll).toBe(true);
    expect(visual.y).toBeCloseTo(landedY, 0);
    expect(visual.scale.x).toBe(0.5);
    expect(visual.scale.y).toBe(0.5);
  }, 30_000);

  test('name form edits through the browser transport and validates Enter, click and Tab activation', async () => {
    const app = await boot(() => import('../../../examples/guides/ui-and-widgets/name-form'), 'NameFormScene');
    const scene = currentScene(app);
    const nodes = [...descendants(scene.ui)];
    const field = nodes.find(node => node instanceof TextInput)!;
    const status = nodes.find(node => node instanceof Label)!;
    const save = button(scene, 'Save name');

    expect(field.focused).toBe(true);
    await rendered(app, 'name-form', [field.getBounds(), save.getBounds()]);
    await userEvent.keyboard('Ada{Enter}');
    await expect.poll(() => status.text, poll).toBe('Saved: Ada');
    expect(field.value).toBe('Ada');
    await userEvent.keyboard('{Control>}a{/Control}{Backspace}');
    await click(app, save);
    await expect.poll(() => status.text, poll).toBe('Enter a name first.');
    await click(app, field);
    await userEvent.keyboard('Grace{Tab}');
    await expect.poll(() => save.focused, poll).toBe(true);
    await userEvent.keyboard('{Enter}');
    await expect.poll(() => status.text, poll).toBe('Saved: Grace');
  }, 30_000);

  test('scene navigation preloads without audio and activates loaded assets only on entry', async () => {
    const app = await boot(() => import('../../../examples/guides/model-b-plus/scene-navigation'), 'MenuScene');
    const menu = currentScene(app);
    const status = [...descendants(menu.ui)].find(node => node instanceof Label)!;
    const play = vi.spyOn(app.audio, 'play');

    await rendered(app, 'scene-navigation-menu', [button(menu, 'Preload level').getBounds(), button(menu, 'Enter level').getBounds()]);
    await click(app, button(menu, 'Preload level'));
    await expect.poll(() => status.text, poll).toBe('Ready. Enter the level when you want.');
    expect(currentScene(app)).toBe(menu);
    expect(play).not.toHaveBeenCalled();
    expect(app.loader.inspect().some(row => row.type === Texture && row.state === 'ready')).toBe(true);
    expect(app.loader.inspect().some(row => row.type === Sound && row.state === 'ready')).toBe(true);
    await click(app, button(menu, 'Enter level'));
    await expect.poll(() => app.scenes.currentScene?.constructor.name, poll).toBe('LevelScene');
    await expect.poll(() => app.scenes._transitionGateOpen, poll).toBe(false);
    await expect.poll(() => play.mock.calls.length, poll).toBe(1);
    const level = currentScene(app);
    const hero = level.root.children[0] as Sprite;

    expect((hero.texture as Texture).ready).toBe(true);
    await rendered(app, 'scene-navigation-level', [hero.getBounds()]);
    await click(app, button(level, 'Play loaded sound'));
    await expect.poll(() => play.mock.calls.length, poll).toBe(2);
    await click(app, button(level, 'Return to menu'));
    await expect.poll(() => app.scenes.currentScene?.constructor.name, poll).toBe('MenuScene');
    await frames(app, 2);
    await click(app, button(currentScene(app), 'Enter level'));
    await expect.poll(() => app.scenes.currentScene?.constructor.name, poll).toBe('LevelScene');
    await expect.poll(() => play.mock.calls.length, poll).toBe(3);
  }, 30_000);

  test('enemy sensors dispatch each contact once and destroy their component-owned bodies', async () => {
    const app = await boot(() => import('../../../examples/guides/gameplay-collision/enemy-sensors'), 'EnemySensorScene');
    const scene = currentScene(app);
    const player = scene.root.children[0] as Sprite;
    const status = scene.ui.children[0] as Label;

    expect(scene.root.children).toHaveLength(4);
    expect(scene.query(PhysicsBodyComponent).size).toBe(4);
    await rendered(app, 'enemy-sensors', [player.getBounds(), (scene.root.children[2] as Sprite).getBounds()]);
    await userEvent.click(canvasOf(app));
    await hold(['KeyD'], async () => {
      await expect.poll(() => player.x, poll).toBeGreaterThanOrEqual(570);
      expect(status.text).toBe('Health: 2. 2 enemies remain.');
    });
    await hold(['KeyW'], async () => {
      await expect.poll(() => status.text, poll).toBe('Health: 1. 1 enemies remain.');
    });
    await hold(['KeyS'], async () => {
      await expect.poll(() => status.text, poll).toBe('Health: 0. 0 enemies remain.');
    });
    await frames(app, 3);
    expect(scene.root.children).toEqual([player]);
    expect(scene.query(PhysicsBodyComponent).size).toBe(1);
    expect(status.text).toBe('Health: 0. 0 enemies remain.');
  }, 30_000);

  test('parallax moves and picks through its actual camera, including after resize', async () => {
    const app = await boot(() => import('../../../examples/guides/camera-follow-and-parallax/parallax'), 'ScrollParallaxScene');
    // Read the authored scene's state; no export or hook is added to the recipe.
    const scene = currentScene(app) as Scene & { camera: View; player: Container; sky: Graphics; hills: Graphics; marker: Graphics };

    await rendered(app, 'parallax-scene', [
      { x: 350, y: 270, width: 100, height: 80 },
      { x: 0, y: 50, width: 800, height: 100 },
    ]);
    await userEvent.click(canvasOf(app));
    await hold(['KeyD'], async () => {
      await expect.poll(() => scene.player.x, poll).toBeGreaterThan(500);
    });
    app.scenes.pause();
    await frames(app, 2);
    const travel = scene.camera.center.x - 400;

    expect(travel).toBeGreaterThan(0);
    expect(Number.isFinite(travel)).toBe(true);
    expect(scene.sky.x).toBeCloseTo(0.7 * travel, 5);
    expect(scene.hills.x).toBeCloseTo(0.4 * travel, 5);
    await userEvent.hover(canvasOf(app), { position: { x: 400, y: 225 } });
    await expect.poll(() => scene.marker.x, poll).toBeCloseTo(scene.camera.center.x, 3);
    expect(scene.marker.y).toBeCloseTo(scene.camera.center.y, 3);
    app.resize(640, 360);
    expect(scene.camera.width).toBe(640);
    expect(scene.camera.height).toBe(360);
    await userEvent.hover(canvasOf(app), { position: { x: 320, y: 180 } });
    await expect.poll(() => scene.marker.y, poll).toBeCloseTo(180, 3);
    expect(scene.marker.x).toBeCloseTo(scene.camera.center.x, 3);
  }, 30_000);

  test('font types render system glyphs, the loaded FontFace and the actual RGBA bitmap atlas', async () => {
    const app = await boot(() => import('../../../examples/guides/text/font-types'), 'FontTypesScene');
    const [system, web, bitmap] = currentScene(app).root.children as readonly [Text, Text, BitmapText];

    expect(system).toBeInstanceOf(Text);
    expect(web).toBeInstanceOf(Text);
    expect(bitmap).toBeInstanceOf(BitmapText);
    const face = Array.from(document.fonts).find(face => face.family === web.style.fontFamily);

    expect(face).toBeInstanceOf(FontFace);
    expect(face?.status).toBe('loaded');
    expect(bitmap.msdf).toBe(false);
    expect(bitmap.font.textures.length).toBeGreaterThan(0);
    expect(bitmap.font.textures.every(texture => texture.ready)).toBe(true);
    expect(bitmap.getLocalBounds().width).toBeGreaterThan(0);
    await rendered(app, 'font-types', [system.getBounds(), web.getBounds(), bitmap.getBounds()]);
  }, 30_000);
});
