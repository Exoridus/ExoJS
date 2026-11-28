/**
 * A boss introduction driven through the real Application frame loop and real
 * keyboard events: input and camera are taken over and handed back, the world
 * keeps running, and confirm, held and rebound keys, a roar that never ends
 * while audio is locked, pause, skip, scene replacement and replay leave
 * nothing behind.
 */
import { tweenOperation } from '#animation/tweenOperation';
import { Application } from '#core/Application';
import { Scene } from '#core/scene/Scene';
import { SceneAvailability } from '#core/scene/SceneAvailability';
import type { SequenceContext, SequenceGenerator } from '#core/sequence/SequenceContext';
import type { SequenceHandle } from '#core/sequence/SequenceHandle';
import { Sequencer } from '#core/sequence/Sequencer';
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

const line = 'You came all this way?';

class Arena extends Scene {
  public readonly view = new View(100, 300, 800, 600);
  public readonly player = new Container().setPosition(100, 300);
  public readonly boss = new Container().setPosition(700, 300);
  /** Stands in for the roar voice's `onEnd`, which never fires while audio is locked. */
  public readonly roarEnded = new Signal();
  public readonly cutsceneControls = new ActionMap({ confirm: new ButtonAction(Keyboard.Enter) });
  public readonly cutscene = new InputScope(this.cutsceneControls);
  public readonly sequencer = new Sequencer();
  public dialogue = '';
  public worldTicks = 0;
  public afterEnd = 0;
  public run: SequenceHandle | null = null;

  public override init(): void {
    this.root.addChild(this.player);
    this.root.addChild(this.boss);
    this.view.follow(this.player);
    this.systems.add(this.sequencer);
  }

  public override update(): void {
    this.worldTicks++;
  }

  public start(): SequenceHandle {
    this.run?.cancel();
    this.run = this.sequencer.play(context => this.intro(context));

    return this.run;
  }

  private *intro(context: SequenceContext): SequenceGenerator {
    const { view } = this;

    this.inputs.pushScope(this.cutscene);
    view.clearFollow();

    try {
      yield* this.pan(context, this.boss.x, 0.4);
      yield* context.all([
        (c: SequenceContext) => c.race([(r: SequenceContext) => r.waitFor(this.roarEnded), (r: SequenceContext) => r.wait(2)]),
        function* (c: SequenceContext): SequenceGenerator {
          view.shake(10, 0.3 as Seconds);

          try {
            yield* c.wait(0.3);
          } finally {
            view.clearShake();
          }
        },
      ]);
      this.dialogue = line;
      yield* context.waitFor(() => this.cutsceneControls.confirm.pressed);
      this.dialogue = '';
      yield* this.pan(context, this.player.x, 0.2);
      this.afterEnd++;
    } finally {
      this.inputs.popScope(this.cutscene);
      this.dialogue = '';
      view.center.set(this.player.x, this.player.y);
      view.follow(this.player);
    }
  }

  private pan(context: SequenceContext, x: number, duration: number): SequenceGenerator {
    return context.waitFor(tweenOperation(this.tweens.create(this.view.center, { when: SceneAvailability.Active }).to({ x }, duration)));
  }
}

class Elsewhere extends Scene {}

let app: Application | null = null;
let now = 0;

const frames = (count: number, stepMs = 50): void => {
  for (let i = 0; i < count; i++) {
    now += stepMs;
    app!.update(now);
  }
};

const key = (type: 'keydown' | 'keyup', code: string): void => {
  window.dispatchEvent(new KeyboardEvent(type, { code }));
};

const tap = (code: string): void => {
  key('keydown', code);
  frames(1);
  key('keyup', code);
  frames(1);
};

const arena = (): Arena => app!.scenes.currentScene as Arena;

/** Run the intro up to the dialogue, with the roar ending once the pan is done. */
const reachDialogue = (scene: Arena): void => {
  frames(10);
  scene.roarEnded.dispatch();
  frames(8);
  expect(scene.dialogue).toBe(line);
};

beforeEach(async () => {
  app = new Application({ backend: { type: 'webgl2' }, scenes: { arena: Arena, elsewhere: Elsewhere } });
  vi.spyOn(app.platform, 'requestFrame').mockReturnValue(1);
  vi.spyOn(app.platform, 'cancelFrame').mockImplementation(() => {});
  await app.start(Arena);
  now = 0;
  setLastFrameTimestamp(app, now);
  app.canvas.dispatchEvent(new FocusEvent('focus'));
});

afterEach(async () => {
  await app?.destroy();
  app = null;
});

describe('boss introduction sequence', () => {
  test('takes over input and camera, keeps the world running, and hands both back on a confirm press', () => {
    const scene = arena();
    const run = scene.start();

    frames(1);
    expect(scene.inputs.scopes).toContain(scene.cutscene);

    const ticksBefore = scene.worldTicks;

    frames(10);
    expect(scene.view.center.x).toBeCloseTo(700, 0);
    expect(scene.worldTicks - ticksBefore).toBe(10);

    scene.roarEnded.dispatch();
    expect(scene.roarEnded.count).toBe(0);
    frames(8);
    expect(scene.dialogue).toBe(line);

    tap('Enter');
    frames(6);

    expect(run.status).toBe('completed');
    expect(scene.afterEnd).toBe(1);
    expect(scene.inputs.scopes).not.toContain(scene.cutscene);
    expect(scene.view.center.x).toBeCloseTo(scene.player.x, 0);
  });

  test('a confirm key held from before the dialogue does not confirm it; a fresh press does', () => {
    const scene = arena();
    const run = scene.start();

    frames(2);
    key('keydown', 'Enter');
    reachDialogue(scene);

    frames(5);
    expect(scene.dialogue).toBe(line);

    key('keyup', 'Enter');
    frames(1);
    expect(scene.dialogue).toBe(line);

    tap('Enter');
    frames(6);
    expect(run.status).toBe('completed');
  });

  test('a confirm action rebound while the dialogue waits listens to its new key only', () => {
    const scene = arena();
    const run = scene.start();

    reachDialogue(scene);
    scene.cutsceneControls.rebind('confirm', Keyboard.Space);

    tap('Enter');
    expect(scene.dialogue).toBe(line);

    tap('Space');
    frames(6);
    expect(run.status).toBe('completed');
  });

  test('a roar that never ends, as while audio is locked, is bounded and its listener released', () => {
    const scene = arena();

    scene.start();
    frames(10);
    expect(scene.roarEnded.count).toBe(1);

    frames(30);
    expect(scene.dialogue).toBe('');

    frames(12);
    expect(scene.dialogue).toBe(line);
    expect(scene.roarEnded.count).toBe(0);
  });

  test('pausing the scene freezes the sequence with the world; resuming continues it', () => {
    const scene = arena();
    const run = scene.start();

    frames(3);
    app!.scenes.pause();

    const frozenAt = scene.view.center.x;
    const ticks = scene.worldTicks;

    frames(10);
    expect(scene.view.center.x).toBe(frozenAt);
    expect(scene.worldTicks).toBe(ticks);
    expect(run.status).toBe('running');

    app!.scenes.resume();
    frames(10);
    expect(scene.view.center.x).toBeCloseTo(700, 0);
  });

  test('skipping cancels at once, restores control, camera and dialogue, and stops the pan it owned', () => {
    const scene = arena();
    const run = scene.start();

    frames(4);
    run.cancel();

    expect(run.status).toBe('cancelled');
    expect(scene.inputs.scopes).not.toContain(scene.cutscene);
    expect(scene.view.center.x).toBe(scene.player.x);

    frames(10);
    expect(scene.view.center.x).toBe(scene.player.x);

    const replay = scene.start();

    reachDialogue(scene);
    replay.cancel();
    expect(scene.dialogue).toBe('');

    tap('Enter');
    frames(10);
    expect(scene.afterEnd).toBe(0);
  });

  test('replacing the scene cancels the run without a stale continuation or listener', async () => {
    const scene = arena();
    const run = scene.start();

    frames(12);
    expect(scene.roarEnded.count).toBe(1);

    await app!.scenes.change(Elsewhere);

    expect(run.status).toBe('cancelled');
    expect(scene.roarEnded.count).toBe(0);

    scene.roarEnded.dispatch();
    frames(20);
    expect(scene.afterEnd).toBe(0);
  });

  test('a replay supersedes the running intro and the next one completes on its own', () => {
    const scene = arena();
    const first = scene.start();

    frames(5);

    const second = scene.start();

    expect(first.status).toBe('cancelled');
    frames(1);
    expect(scene.inputs.scopes.filter(scope => scope === scene.cutscene)).toHaveLength(1);

    reachDialogue(scene);
    tap('Enter');
    frames(6);

    expect(second.status).toBe('completed');
    expect(scene.afterEnd).toBe(1);
  });
});
