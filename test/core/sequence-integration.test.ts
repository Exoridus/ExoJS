/**
 * A boss introduction driven through the real Application frame loop: input
 * and camera are taken over and handed back, the world keeps running, and
 * pause, skip, scene replacement and replay leave nothing behind.
 */
import { TweenState } from '#animation/types';
import { Application } from '#core/Application';
import { Scene } from '#core/scene/Scene';
import { SceneAvailability } from '#core/scene/SceneAvailability';
import { isSequenceCancellation, Sequence, type SequenceContext, type SequenceHandle } from '#core/sequence/Sequence';
import { Signal } from '#core/Signal';
import type { Seconds } from '#core/units';
import { ActionMap } from '#input/actions/ActionMap';
import { ButtonAction } from '#input/actions/ButtonAction';
import { InputScope } from '#input/actions/InputScope';
import { Keyboard } from '#input/types';
import { Container } from '#rendering/Container';
import { View } from '#rendering/View';

import { setLastFrameTimestamp } from '../support/application-frame-loop';

vi.mock('#rendering/OutputTransform', async importOriginal => {
  const actual = await importOriginal<typeof import('#rendering/OutputTransform')>();

  class StubOutputTransform extends actual.OutputTransform {
    public override present(): void {}
  }

  return { ...actual, OutputTransform: StubOutputTransform };
});

vi.mock('#rendering/webgl2/WebGl2Backend', () => ({
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
      view: { getBounds: vi.fn().mockReturnValue({ left: 0, top: 0, right: 800, bottom: 600 }) },
      renderTarget: {},
      rendererRegistry: { bindRenderer: vi.fn() },
      backendType: 'webgl2',
      setView: vi.fn().mockReturnThis(),
      draw: vi.fn().mockReturnThis(),
      // Runs the pass body the way a coordinator-less backend does, so the
      // frame's draw phase actually reaches the scene.
      execute: vi.fn().mockImplementation(function (this: unknown, pass: { execute(backend: unknown): void }) {
        pass.execute(this);

        return this;
      }),
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
}));

const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

class Arena extends Scene {
  public readonly view = new View(100, 300, 800, 600);
  public readonly player = new Container().setPosition(100, 300);
  public readonly boss = new Container().setPosition(700, 300);
  public readonly roarEnded = new Signal();
  public readonly cutscene = new InputScope(new ActionMap({ confirm: new ButtonAction(Keyboard.Enter) }));
  public confirmPressed = false;
  public dialogue = '';
  public worldTicks = 0;
  public afterEnd = 0;
  public run: SequenceHandle | null = null;

  public readonly intro = new Sequence(async context => {
    this.inputs.pushScope(this.cutscene);
    this.view.clearFollow();
    context.defer(() => {
      this.inputs.popScope(this.cutscene);
      this.dialogue = '';
      this.view.center.set(this.player.x, this.player.y);
      this.view.follow(this.player);
    });

    await context.run(this.pan(this.boss.x, 0.4));
    await context.all([
      (c: SequenceContext) => c.race([(r: SequenceContext) => r.waitFor(this.roarEnded), (r: SequenceContext) => r.wait(2)]),
      async (c: SequenceContext) => {
        this.view.shake(10, 0.3 as Seconds);
        c.defer(() => this.view.clearShake());
        await c.wait(0.3);
      },
    ]);
    this.dialogue = 'You came all this way?';
    await context.waitUntil(() => this.confirmPressed);
    this.dialogue = '';
    await context.run(this.pan(this.player.x, 0.2));
    this.afterEnd++;
  });

  public override init(): void {
    this.root.addChild(this.player);
    this.root.addChild(this.boss);
    this.view.follow(this.player);
  }

  public override update(): void {
    this.worldTicks++;
  }

  public start(): SequenceHandle {
    this.run?.cancel();
    this.run = this.intro.start(this);
    this.run.then(undefined, (error: unknown) => {
      if (!isSequenceCancellation(error)) {
        throw error;
      }
    });

    return this.run;
  }

  private pan(x: number, duration: number) {
    return async (context: SequenceContext): Promise<void> => {
      const tween = this.tweens.create(this.view.center, { when: SceneAvailability.Active }).to({ x }, duration).start();

      context.defer(() => tween.stop());
      await context.waitUntil(() => tween.state === TweenState.Complete);
    };
  }
}

class Elsewhere extends Scene {}

let app: Application | null = null;
let now = 0;

const frames = async (count: number, stepMs = 50): Promise<void> => {
  for (let i = 0; i < count; i++) {
    now += stepMs;
    app!.update(now);
    await settle();
  }
};

const arena = (): Arena => app!.scenes.currentScene as Arena;

beforeEach(async () => {
  app = new Application({ backend: { type: 'webgl2' }, scenes: { arena: Arena, elsewhere: Elsewhere } });
  vi.spyOn(app.platform, 'requestFrame').mockReturnValue(1);
  vi.spyOn(app.platform, 'cancelFrame').mockImplementation(() => {});
  await app.start(Arena);
  now = 0;
  setLastFrameTimestamp(app, now);
});

afterEach(async () => {
  await app?.destroy();
  app = null;
});

describe('boss introduction sequence', () => {
  test('takes over input and camera, keeps the world running, and hands both back on completion', async () => {
    const scene = arena();
    const run = scene.start();

    await frames(1);
    expect(scene.inputs.scopes).toContain(scene.cutscene);

    const ticksBefore = scene.worldTicks;

    await frames(10);
    expect(scene.view.center.x).toBeCloseTo(700, 0);
    expect(scene.worldTicks - ticksBefore).toBe(10);

    scene.roarEnded.dispatch();
    await frames(8);
    expect(scene.dialogue).toBe('You came all this way?');

    scene.confirmPressed = true;
    await frames(1);
    scene.confirmPressed = false;
    await frames(6);

    expect(run.status).toBe('completed');
    expect(scene.afterEnd).toBe(1);
    expect(scene.inputs.scopes).not.toContain(scene.cutscene);
    expect(scene.view.center.x).toBeCloseTo(scene.player.x, 0);
  });

  test('pausing the scene freezes the sequence with the world; resuming continues it', async () => {
    const scene = arena();
    const run = scene.start();

    await frames(3);
    app!.scenes.pause();

    const frozenAt = scene.view.center.x;
    const ticks = scene.worldTicks;

    await frames(10);
    expect(scene.view.center.x).toBe(frozenAt);
    expect(scene.worldTicks).toBe(ticks);
    expect(run.status).toBe('running');

    app!.scenes.resume();
    await frames(10);
    expect(scene.view.center.x).toBeCloseTo(700, 0);
  });

  test('skipping cancels at once and restores control, camera and dialogue', async () => {
    const scene = arena();
    const run = scene.start();

    await frames(10);
    scene.roarEnded.dispatch();
    await frames(8);
    expect(scene.dialogue).not.toBe('');

    run.cancel();

    expect(run.status).toBe('cancelled');
    expect(scene.dialogue).toBe('');
    expect(scene.inputs.scopes).not.toContain(scene.cutscene);
    expect(scene.view.center.x).toBe(scene.player.x);

    scene.confirmPressed = true;
    await frames(10);
    expect(scene.afterEnd).toBe(0);
  });

  test('replacing the scene cancels the run without a stale continuation', async () => {
    const scene = arena();
    const run = scene.start();

    await frames(3);
    await app!.scenes.change(Elsewhere);
    await settle();

    expect(run.status).toBe('cancelled');

    scene.roarEnded.dispatch();
    scene.confirmPressed = true;
    await frames(20);
    expect(scene.afterEnd).toBe(0);
  });

  test('a replay supersedes the running intro and the next one completes on its own', async () => {
    const scene = arena();
    const first = scene.start();

    await frames(5);

    const second = scene.start();

    expect(first.status).toBe('cancelled');
    await frames(1);
    expect(scene.inputs.scopes.filter(scope => scope === scene.cutscene)).toHaveLength(1);

    await frames(10);
    scene.roarEnded.dispatch();
    await frames(8);
    scene.confirmPressed = true;
    await frames(1);
    scene.confirmPressed = false;
    await frames(6);

    expect(second.status).toBe('completed');
    expect(scene.afterEnd).toBe(1);
  });
});
