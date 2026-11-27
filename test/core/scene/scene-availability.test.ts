/**
 * Scene availability (`when`) for tweens, sprite animations and audio voices,
 * through the real Application -> SceneDirector -> SceneScope path.
 *
 * Three states are kept apart: what the caller asked a resource to do (its own
 * play/pause/stop state), what the scene currently allows (lifecycle state plus
 * the pause flag, filtered by the resource's `when` policy), and what the
 * resource therefore actually does. The scene never rewrites the requested
 * state: it only withholds time or output, from the moment a resource is
 * registered, not just on the next pause transition.
 */
import { Tween } from '#animation/Tween';
import { getAudioContext } from '#audio/audioContext';
import { AudioGenerator } from '#audio/AudioGenerator';
import type { Voice } from '#audio/Playable';
import { Sound } from '#audio/Sound';
import { Application } from '#core/Application';
import { logger } from '#core/Logger';
import { Scene } from '#core/scene/Scene';
import { SceneAvailability } from '#core/scene/SceneAvailability';
import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';
import { AnimatedSprite } from '#rendering/sprite/AnimatedSprite';

import { setLastFrameTimestamp } from '../../support/application-frame-loop';

vi.mock('#rendering/OutputTransform', async importOriginal => {
  const actual = await importOriginal<typeof import('#rendering/OutputTransform')>();

  class StubOutputTransform extends actual.OutputTransform {
    public override present(): void {}
  }

  return { ...actual, OutputTransform: StubOutputTransform };
});

vi.mock('#rendering/webgl2/WebGl2Backend', async () => {
  // A real view, so hit testing can map canvas points into the world.
  const { View } = await import('#rendering/View');

  return {
    WebGl2Backend: vi.fn().mockImplementation(function () {
      return {
        onContextLost: { add: vi.fn(), destroy: vi.fn() },
        onContextRestored: { add: vi.fn(), destroy: vi.fn() },
        onRenderError: { add: vi.fn(), destroy: vi.fn() },
        stats: {
          frameTimeMs: 0,
          drawCalls: 0,
          culledNodes: 0,
          submittedNodes: 0,
          batches: 0,
          renderPasses: 0,
          renderTargetChanges: 0,
          frame: 0,
          rawFrameDeltaMs: 0,
        },
        resetStats: vi.fn().mockReturnThis(),
        flush: vi.fn().mockReturnThis(),
        initialize: vi.fn().mockResolvedValue(undefined),
        destroy: vi.fn(),
        resize: vi.fn().mockReturnThis(),
        view: new View(400, 300, 800, 600),
        renderTarget: {},
        rendererRegistry: { bindRenderer: vi.fn() },
        backendType: 'webgl2',
        setView: vi.fn().mockReturnThis(),
        draw: vi.fn().mockReturnThis(),
        execute: vi.fn().mockReturnThis(),
        setRenderTarget: vi.fn().mockReturnThis(),
        resolveRenderTarget: vi.fn(),
        clearColor: { red: 0, green: 0, blue: 0, alpha: 1 },
        clear: vi.fn().mockReturnThis(),
        pushScissorRect: vi.fn().mockReturnThis(),
        popScissorRect: vi.fn().mockReturnThis(),
        acquireRenderTexture: vi.fn(),
        releaseRenderTexture: vi.fn().mockReturnThis(),
        composeWithAlphaMask: vi.fn().mockReturnThis(),
      };
    }),
  };
});

const sound = (): Sound => new Sound({ duration: 10 } as AudioBuffer);

class PlayScene extends Scene {}
class OtherScene extends Scene {}

class FailingScene extends Scene {
  public static target: { x: number } | null = null;

  public override init(): void {
    const target = { x: 0 };

    FailingScene.target = target;
    this.tweens.create(target).to({ x: 100 }, 1).start();

    throw new Error('init failed');
  }
}

class QueuedScene extends Scene {
  public static voice: Voice | null = null;

  public override init(): void {
    QueuedScene.voice = this.audio.play(sound(), { loop: true, when: SceneAvailability.Paused });
  }
}

class HitBox extends Drawable {
  public override contains(x: number, y: number): boolean {
    return x >= 0 && x < 100 && y >= 0 && y < 100;
  }

  public override getBounds(): Rectangle {
    return new Rectangle(0, 0, 100, 100);
  }
}

interface Harness {
  app: Application;
  scene: PlayScene;
  /** Advance one frame by `ms` milliseconds. */
  frame(ms?: number): void;
}

const harnesses: Harness[] = [];

const setup = async (): Promise<Harness> => {
  const app = new Application({
    backend: { type: 'webgl2' },
    scenes: { play: PlayScene, other: OtherScene, failing: FailingScene, queued: QueuedScene },
  });

  vi.spyOn(app.platform, 'requestFrame').mockReturnValue(1);
  vi.spyOn(app.platform, 'cancelFrame').mockImplementation(() => {});

  await app.start(PlayScene);
  // Buffer sounds refuse to start on a locked context.
  await getAudioContext().resume();

  let now = 0;

  setLastFrameTimestamp(app, now);

  const harness: Harness = {
    app,
    scene: app.scenes.currentScene as PlayScene,
    frame: (ms = 100): void => {
      now += ms;
      app.update(now);
    },
  };

  harnesses.push(harness);

  return harness;
};

afterEach(async () => {
  for (const { app } of harnesses.splice(0)) {
    await app.destroy();
  }
});

/** A tween moving `x` from 0 to 1000 over 10 s - 100 per second, so 10 per 100 ms frame. */
const mover = (harness: Harness, when?: SceneAvailability): { target: { x: number }; tween: Tween<{ x: number }> } => {
  const target = { x: 0 };
  const tween = harness.scene.tweens.create(target, when === undefined ? undefined : { when }).to({ x: 1000 }, 10);

  return { target, tween };
};

/** A sprite on the scene's root whose clip advances one frame per 100 ms. */
const walker = (harness: Harness, when?: SceneAvailability): AnimatedSprite => {
  const frames = Array.from({ length: 50 }, (_, i) => new Rectangle(i * 16, 0, 16, 16));
  const sprite = new AnimatedSprite(null, { walk: { frames, fps: 10 } });

  harness.scene.root.addChild(sprite);

  return harness.scene.animations.add(sprite, when === undefined ? undefined : { when });
};

/** Whether a pausable voice is actually silent - the scene's hold included - as opposed to what its caller asked for. */
const silent = (voice: Voice): boolean => {
  // A voice queued before activation is a stand-in forwarding to the real one.
  const real = (voice as unknown as { _real?: Voice | null })._real ?? voice;
  const internal = real as unknown as { _halted?: boolean; paused?: boolean };

  return internal._halted ?? internal.paused ?? false;
};

type PausableVoice = Voice & { pause(): void; resume(): void; readonly paused: boolean };

describe('tweens', () => {
  test("an 'active' tween started while the scene is paused does not run until resume", async () => {
    const harness = await setup();
    const { target, tween } = mover(harness, SceneAvailability.Active);

    harness.app.scenes.pause();
    tween.start();
    harness.frame();
    harness.frame();

    expect(target.x).toBe(0);

    harness.app.scenes.resume();
    harness.frame();

    expect(target.x).toBeCloseTo(10);
  });

  test("a 'paused' tween started while the scene runs only runs while it is paused", async () => {
    const harness = await setup();
    const { target, tween } = mover(harness, SceneAvailability.Paused);

    tween.start();
    harness.frame();

    expect(target.x).toBe(0);

    harness.app.scenes.pause();
    harness.frame();

    expect(target.x).toBeCloseTo(10);

    harness.app.scenes.resume();
    harness.frame();

    expect(target.x).toBeCloseTo(10);
  });

  test("an 'active' tween the caller pauses while the scene is paused stays paused after resume", async () => {
    const harness = await setup();
    const { target, tween } = mover(harness, SceneAvailability.Active);

    tween.start();
    harness.frame();
    harness.app.scenes.pause();
    tween.pause();
    harness.app.scenes.resume();
    harness.frame();

    expect(target.x).toBeCloseTo(10);
    expect(tween.state).toBe('paused');
  });

  test("an 'active' tween the caller resumes while the scene is paused waits for the scene", async () => {
    const harness = await setup();
    const { target, tween } = mover(harness, SceneAvailability.Active);

    tween.start();
    harness.frame();
    harness.app.scenes.pause();
    tween.pause();
    tween.resume();
    harness.frame();

    expect(target.x).toBeCloseTo(10);

    harness.app.scenes.resume();
    harness.frame();

    expect(target.x).toBeCloseTo(20);
  });

  test('a tween the caller stops is not restarted by resume or restore', async () => {
    const harness = await setup();
    const { target, tween } = mover(harness, SceneAvailability.Active);

    tween.start();
    harness.frame();
    harness.app.scenes.pause();
    tween.stop();
    harness.app.scenes.resume();
    await harness.app.scenes.change(OtherScene, { suspendCurrent: true });
    await harness.app.scenes.restore(PlayScene);
    harness.frame();

    expect(tween.state).toBe('stopped');
    expect(target.x).toBeCloseTo(10);
  });

  test('repeated pause and resume advance a tween exactly by the running time', async () => {
    const harness = await setup();
    const { target, tween } = mover(harness, SceneAvailability.Active);

    tween.start();

    for (let i = 0; i < 5; i++) {
      harness.frame();
      harness.app.scenes.pause();
      harness.frame();
      harness.app.scenes.resume();
    }

    expect(target.x).toBeCloseTo(50);
  });

  test("an 'always' tween runs through a pause but not while its scene is retained", async () => {
    const harness = await setup();
    const { target, tween } = mover(harness);

    tween.start();
    harness.app.scenes.pause();
    harness.frame();

    expect(target.x).toBeCloseTo(10);

    await harness.app.scenes.change(OtherScene, { suspendCurrent: true });
    harness.frame();

    expect(target.x).toBeCloseTo(10);

    await harness.app.scenes.restore(PlayScene);
    harness.frame();

    expect(target.x).toBeCloseTo(20);
    expect(harness.app.scenes.paused).toBe(true);
  });

  test('a tween the caller paused before retention is still paused after restore', async () => {
    const harness = await setup();
    const { target, tween } = mover(harness);

    tween.start();
    harness.frame();
    tween.pause();
    await harness.app.scenes.change(OtherScene, { suspendCurrent: true });
    await harness.app.scenes.restore(PlayScene);
    harness.frame();

    expect(tween.state).toBe('paused');
    expect(target.x).toBeCloseTo(10);
  });

  test("a 'paused' sequencer started while the scene runs holds, then plays during pause", async () => {
    const harness = await setup();
    const target = { x: 0 };
    const sequencer = harness.scene.tweens.createSequencer({ when: SceneAvailability.Paused });

    sequencer.then(new Tween(target).to({ x: 1000 }, 10)).start();
    harness.frame();

    expect(target.x).toBe(0);

    harness.app.scenes.pause();
    harness.frame();

    expect(target.x).toBeCloseTo(10);
  });

  test('a tween started by a scene whose activation fails never runs', async () => {
    const harness = await setup();

    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(harness.app.scenes.change(FailingScene)).rejects.toThrow('init failed');
    harness.frame();
    harness.frame();

    expect(FailingScene.target?.x).toBe(0);
  });

  test('ending the scene stops its tweens', async () => {
    const harness = await setup();
    const { target, tween } = mover(harness);

    tween.start();
    harness.frame();
    await harness.app.scenes.change(OtherScene);
    harness.frame();

    expect(tween.state).toBe('stopped');
    expect(target.x).toBeCloseTo(10);
  });

  test('pausing one application leaves the tweens of another running', async () => {
    const first = await setup();
    const second = await setup();
    const a = mover(first, SceneAvailability.Active);
    const b = mover(second, SceneAvailability.Active);

    a.tween.start();
    b.tween.start();
    first.app.scenes.pause();
    first.frame();
    second.frame();

    expect(a.target.x).toBe(0);
    expect(b.target.x).toBeCloseTo(10);
  });
});

describe('coroutines', () => {
  const counter = (harness: Harness, when: SceneAvailability): { steps: () => number } => {
    let steps = 0;

    harness.scene.coroutines.queue(
      function* () {
        for (;;) {
          steps++;
          yield;
        }
      },
      { when },
    );

    return { steps: () => steps };
  };

  test("an 'active' coroutine queued while the scene is paused does not step until resume", async () => {
    const harness = await setup();

    harness.app.scenes.pause();

    const { steps } = counter(harness, SceneAvailability.Active);

    harness.frame();
    harness.frame();

    expect(steps()).toBe(0);

    harness.app.scenes.resume();
    harness.frame();

    expect(steps()).toBeGreaterThan(0);
  });

  test("a 'paused' coroutine queued while the scene runs steps only while it is paused", async () => {
    const harness = await setup();
    const { steps } = counter(harness, SceneAvailability.Paused);

    harness.frame();

    expect(steps()).toBe(0);

    harness.app.scenes.pause();
    harness.frame();

    const whilePaused = steps();

    expect(whilePaused).toBeGreaterThan(0);

    harness.app.scenes.resume();
    harness.frame();

    expect(steps()).toBe(whilePaused);
  });
});

describe('sprite animations', () => {
  test("an 'active' sprite played while the scene is paused does not advance until resume", async () => {
    const harness = await setup();
    const sprite = walker(harness, SceneAvailability.Active);

    harness.app.scenes.pause();
    sprite.play('walk');
    harness.frame();
    harness.frame();

    expect(sprite.currentFrame).toBe(0);
    expect(sprite.playing).toBe(true);

    harness.app.scenes.resume();
    harness.frame();

    expect(sprite.currentFrame).toBe(1);
  });

  test("a 'paused' sprite played while the scene runs advances only while it is paused", async () => {
    const harness = await setup();
    const sprite = walker(harness, SceneAvailability.Paused);

    sprite.play('walk');
    harness.frame();

    expect(sprite.currentFrame).toBe(0);

    harness.app.scenes.pause();
    harness.frame();

    expect(sprite.currentFrame).toBe(1);

    harness.app.scenes.resume();
    harness.frame();

    expect(sprite.currentFrame).toBe(1);
  });

  test("an 'active' sprite the caller pauses while the scene is paused stays paused after resume", async () => {
    const harness = await setup();
    const sprite = walker(harness, SceneAvailability.Active);

    sprite.play('walk');
    harness.frame();
    harness.app.scenes.pause();
    sprite.pause();
    harness.app.scenes.resume();
    harness.frame();

    expect(sprite.playing).toBe(false);
    expect(sprite.currentFrame).toBe(1);
  });

  test('a sprite the caller paused before retention is still paused after restore', async () => {
    const harness = await setup();
    const sprite = walker(harness);

    sprite.play('walk');
    harness.frame();
    sprite.pause();
    await harness.app.scenes.change(OtherScene, { suspendCurrent: true });
    await harness.app.scenes.restore(PlayScene);
    harness.frame();

    expect(sprite.playing).toBe(false);
    expect(sprite.currentFrame).toBe(1);
  });

  test('repeated pause and resume advance a sprite exactly by the running time', async () => {
    const harness = await setup();
    const sprite = walker(harness, SceneAvailability.Active);

    sprite.play('walk');

    for (let i = 0; i < 4; i++) {
      harness.frame();
      harness.app.scenes.pause();
      harness.frame();
      harness.app.scenes.resume();
    }

    expect(sprite.currentFrame).toBe(4);
  });
});

describe('audio voices', () => {
  test("an 'active' voice started while the scene is paused stays silent until resume", async () => {
    const harness = await setup();

    harness.app.scenes.pause();

    const voice = harness.scene.audio.play(sound(), { loop: true, when: SceneAvailability.Active });

    expect(silent(voice)).toBe(true);

    harness.app.scenes.resume();

    expect(silent(voice)).toBe(false);
  });

  test("a 'paused' voice started while the scene runs is silent until the scene pauses", async () => {
    const harness = await setup();
    const voice = harness.scene.audio.play(sound(), { loop: true, when: SceneAvailability.Paused });

    expect(silent(voice)).toBe(true);

    harness.app.scenes.pause();

    expect(silent(voice)).toBe(false);

    harness.app.scenes.resume();

    expect(silent(voice)).toBe(true);
  });

  test("an 'active' voice the caller pauses while the scene is paused stays paused after resume", async () => {
    const harness = await setup();
    const voice = harness.scene.audio.play(sound(), { loop: true, when: SceneAvailability.Active }) as PausableVoice;

    harness.app.scenes.pause();
    voice.pause();
    harness.app.scenes.resume();

    expect(voice.paused).toBe(true);
    expect(silent(voice)).toBe(true);
  });

  test("an 'active' voice the caller resumes while the scene is paused waits for the scene", async () => {
    const harness = await setup();
    const voice = harness.scene.audio.play(sound(), { loop: true, when: SceneAvailability.Active }) as PausableVoice;

    voice.pause();
    harness.app.scenes.pause();
    voice.resume();

    expect(voice.paused).toBe(false);
    expect(silent(voice)).toBe(true);

    harness.app.scenes.resume();

    expect(silent(voice)).toBe(false);
  });

  test('a generator voice follows the same hold', async () => {
    const harness = await setup();

    harness.app.scenes.pause();

    const voice = harness.scene.audio.play(new AudioGenerator({ frequency: 440 }), { when: SceneAvailability.Active });

    expect(silent(voice)).toBe(true);

    harness.app.scenes.resume();

    expect(silent(voice)).toBe(false);
  });

  test("a 'paused' voice queued before activation is silent when the scene starts running", async () => {
    const harness = await setup();

    QueuedScene.voice = null;
    await harness.app.scenes.change(QueuedScene);

    expect(QueuedScene.voice).not.toBeNull();
    expect(silent(QueuedScene.voice!)).toBe(true);
  });

  test('a voice that cannot pause warns when given a pause policy it cannot honour', async () => {
    const harness = await setup();
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const unpausable = { ended: false, stop: vi.fn(), onEnd: { add: vi.fn() } } as unknown as Voice;

    harness.scene.audio.add(unpausable, { when: SceneAvailability.Active });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toMatch(/cannot pause/i);
  });
});

describe('pause menu interaction', () => {
  test("a 'paused' interaction scope makes the menu the only hit target while paused, and the world again after resume", async () => {
    const harness = await setup();
    const world = new HitBox();
    const menu = new Container();
    const button = new HitBox();

    world.interactive = true;
    button.interactive = true;
    menu.addChild(button);
    harness.scene.root.addChild(world, menu);
    harness.scene.interaction.scope(menu, { when: SceneAvailability.Paused });
    world.zIndex = 10;
    harness.frame();

    expect(harness.app.interaction.nodeAt(50, 50)).toBe(world);

    harness.app.scenes.pause();
    harness.frame();

    expect(harness.app.interaction.nodeAt(50, 50)).toBe(button);

    harness.app.scenes.resume();
    harness.frame();

    expect(harness.app.interaction.nodeAt(50, 50)).toBe(world);
  });
});
