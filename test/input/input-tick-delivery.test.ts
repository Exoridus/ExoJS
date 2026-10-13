/**
 * Tick input contract, through the real Application -> InputSystem -> fixed
 * step path with controlled platform events and a hand-driven frame clock.
 *
 * An action's `tick` view reports what the current fixed step owns: every
 * press and release the input frames sampled since the previous fixed step,
 * counted, delivered to exactly one step, plus the held state. A frame that
 * runs no fixed step keeps its occurrences for the next one; a frame that runs
 * several delivers them to the first and none to the others. The frame API
 * (`pressed`/`released`) keeps its per-frame meaning.
 */
import { Application } from '#core/Application';
import { BehaviorComponent } from '#core/BehaviorComponent';
import { logger } from '#core/Logger';
import { Scene } from '#core/scene/Scene';
import { SceneAvailability } from '#core/scene/SceneAvailability';
import { ActionMap } from '#input/actions/ActionMap';
import { ButtonAction } from '#input/actions/ButtonAction';
import { ChordAction } from '#input/actions/ChordAction';
import { InputScope } from '#input/actions/InputScope';
import { SequenceAction } from '#input/actions/SequenceAction';
import { GamepadButton } from '#input/GamepadButton';
import { Keyboard } from '#input/types';
import { Container } from '#rendering/Container';

import { setLastFrameTimestamp } from '../support/application-frame-loop';

vi.mock('#rendering/OutputTransform', async importOriginal => {
  const actual = await importOriginal<typeof import('#rendering/OutputTransform')>();

  class StubOutputTransform extends actual.OutputTransform {
    public override present(): void {}
  }

  return { ...actual, OutputTransform: StubOutputTransform };
});

vi.mock('#rendering/webgl2/WebGl2Backend', async () => {
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

type Controls = ActionMap<{ jump: ButtonAction }>;

/** What one fixed step of a scene saw. */
interface StepRecord {
  readonly step: number;
  readonly pressCount: number;
  readonly releaseCount: number;
  readonly pressed: boolean;
  readonly active: boolean;
  /** The frame API, read from the same fixed step. */
  readonly framePressed: boolean;
}

class PlayScene extends Scene {
  public controls!: Controls;
  public readonly steps: StepRecord[] = [];
  public onFixed: (() => void) | null = null;

  public override init(): void {
    this.controls = this.inputs.attach(new ActionMap({ jump: new ButtonAction(Keyboard.Space) }));
  }

  public override fixedUpdate(): void {
    const { jump } = this.controls;

    this.steps.push({
      step: jump.tick.step,
      pressCount: jump.tick.pressCount,
      releaseCount: jump.tick.releaseCount,
      pressed: jump.tick.pressed,
      active: jump.tick.active,
      framePressed: jump.pressed,
    });
    this.onFixed?.();
  }
}

class OtherScene extends PlayScene {}

const STEP_MS = 1000 / 60;

let restoreGetGamepads: (() => void) | null = null;
let padSnapshot: Array<Gamepad | null> = [];

beforeEach(() => {
  const original = Object.getOwnPropertyDescriptor(window.navigator, 'getGamepads');

  padSnapshot = [];
  Object.defineProperty(window.navigator, 'getGamepads', {
    configurable: true,
    value: (): ReturnType<Navigator['getGamepads']> => padSnapshot as ReturnType<Navigator['getGamepads']>,
  });

  restoreGetGamepads = (): void => {
    if (original) {
      Object.defineProperty(window.navigator, 'getGamepads', original);
    } else {
      delete (window.navigator as { getGamepads?: unknown }).getGamepads;
    }
  };

  vi.spyOn(logger, 'error').mockImplementation(() => {});
});

interface Harness {
  app: Application;
  scene: PlayScene;
  errors: Error[];
  /** Advance one frame by `ms` milliseconds. */
  frame(ms?: number): void;
}

const harnesses: Harness[] = [];

const setup = async (fixedTimeStep = 1 / 60): Promise<Harness> => {
  const app = new Application({
    backend: { type: 'webgl2' },
    fixedTimeStep,
    scenes: { play: PlayScene, other: OtherScene },
  });

  vi.spyOn(app.platform, 'requestFrame').mockReturnValue(1);
  vi.spyOn(app.platform, 'cancelFrame').mockImplementation(() => {});

  await app.start(PlayScene);

  let now = 0;
  const errors: Error[] = [];

  setLastFrameTimestamp(app, now);
  app.onError.add(error => {
    errors.push(error);
  });
  app.canvas.dispatchEvent(new FocusEvent('focus'));

  const harness: Harness = {
    app,
    get scene(): PlayScene {
      return app.scenes.currentScene as PlayScene;
    },
    errors,
    frame: (ms = STEP_MS): void => {
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

  restoreGetGamepads?.();
  restoreGetGamepads = null;
});

const key = (type: 'keydown' | 'keyup', code: string): void => {
  window.dispatchEvent(new KeyboardEvent(type, { code }));
};

const tapKey = (code: string): void => {
  key('keydown', code);
  key('keyup', code);
};

const presses = (scene: PlayScene): number[] => scene.steps.map(step => step.pressCount);

const nativePad = (south: number): Gamepad =>
  ({
    id: 'Vendor: 045e Product: 0b13',
    index: 0,
    connected: true,
    mapping: 'standard',
    timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, (_, i) => {
      const value = i === 0 ? south : 0;

      return { value, pressed: value > 0, touched: value > 0 };
    }),
    vibrationActuator: null,
  }) as unknown as Gamepad;

describe('assignment to fixed steps', () => {
  test('a press in a frame without a fixed step reaches the next fixed step, once', async () => {
    const { scene, frame } = await setup();

    key('keydown', 'Space');
    frame(5);

    expect(scene.steps).toHaveLength(0);

    frame(STEP_MS);
    frame(STEP_MS);

    expect(presses(scene)).toEqual([1, 0]);
    expect(scene.steps.map(step => step.active)).toEqual([true, true]);
  });

  test('a press before a frame of three catch-up steps belongs to the first; the held state reaches all three', async () => {
    const { scene, frame } = await setup();

    key('keydown', 'Space');
    frame(STEP_MS * 3);

    expect(presses(scene)).toEqual([1, 0, 0]);
    expect(scene.steps.map(step => step.active)).toEqual([true, true, true]);
  });

  test('the frame API keeps its per-frame meaning inside fixed steps', async () => {
    const { scene, frame } = await setup();

    key('keydown', 'Space');
    frame(STEP_MS * 3);

    expect(scene.steps.map(step => step.framePressed)).toEqual([true, true, true]);
  });

  test('a press and release between two frames still reaches a fixed step', async () => {
    const { scene, frame } = await setup();

    tapKey('Space');
    frame(STEP_MS);

    expect(scene.steps[0]).toMatchObject({ pressCount: 1, releaseCount: 1, pressed: true, active: false });
  });

  test('two full taps before the next fixed step are counted as two', async () => {
    const { scene, frame } = await setup();

    tapKey('Space');
    frame(5);
    tapKey('Space');
    frame(STEP_MS);

    expect(scene.steps.map(step => [step.pressCount, step.releaseCount])).toEqual([[2, 2]]);
  });

  test('every step of a frame reports the same step identity to every reader of that step', async () => {
    const { scene, frame } = await setup();
    const readings: number[] = [];

    scene.onFixed = (): void => {
      readings.push(scene.controls.jump.tick.step);
    };

    frame(STEP_MS * 2);

    expect(readings).toEqual(scene.steps.map(step => step.step));
    expect(new Set(readings).size).toBe(2);
    expect(readings.every(step => step > 0)).toBe(true);
  });

  test('outside a fixed step the tick view reports no occurrence', async () => {
    const { scene, frame } = await setup();
    let inUpdate: number | null = null;

    key('keydown', 'Space');
    frame(STEP_MS);
    scene.onFixed = null;
    vi.spyOn(scene, 'update').mockImplementation(() => {
      inUpdate = scene.controls.jump.tick.pressCount;
    });
    frame(STEP_MS);

    expect(inUpdate).toBe(0);
    expect(scene.controls.jump.tick.step).toBe(0);
    expect(scene.controls.jump.tick.active).toBe(true);
  });

  test.each([
    ['30', 1000 / 30, 1 / 60],
    ['60', 1000 / 60, 1 / 60],
    ['144', 1000 / 144, 1 / 60],
    ['144 at a 120 Hz step', 1000 / 144, 1 / 120],
    ['60 at a 30 Hz step', 1000 / 60, 1 / 30],
  ])('at %s fps every tap reaches exactly one fixed step', async (_label, frameMs, fixedTimeStep) => {
    const { scene, frame } = await setup(fixedTimeStep);

    for (let i = 0; i < 40; i++) {
      if (i % 3 === 0) {
        tapKey('Space');
      }

      frame(frameMs);
    }

    for (let i = 0; i < 10; i++) {
      frame(frameMs);
    }

    const counts = presses(scene);

    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(14);
    expect(counts.every(count => count <= 2)).toBe(true);
  });
});

describe('reading order', () => {
  test('a system ordered before the core input systems reads the step it runs in', async () => {
    const { app, scene, frame } = await setup();
    const seen: Array<[number, number]> = [];
    let inUpdate: number | null = null;

    app.systems.add(
      {
        fixedUpdate: () => {
          seen.push([scene.controls.jump.tick.step, scene.controls.jump.tick.pressCount]);
        },
        update: () => {
          inUpdate = scene.controls.jump.tick.pressCount;
        },
      },
      { order: -1000 },
    );

    key('keydown', 'Space');
    frame(STEP_MS * 2);

    expect(seen.map(([, count]) => count)).toEqual([1, 0]);
    expect(seen.map(([step]) => step)).toEqual(scene.steps.map(step => step.step));
    expect(inUpdate).toBe(0);
  });

  test('a listener of a failed fixed step reads no tick occurrence', async () => {
    const { app, scene, frame } = await setup();
    let afterFailure: [number, number] | null = null;

    app.onError.add(() => {
      afterFailure = [scene.controls.jump.tick.step, scene.controls.jump.tick.pressCount];
    });

    scene.onFixed = (): void => {
      throw new Error('step failed');
    };

    key('keydown', 'Space');
    frame(STEP_MS);

    expect(scene.steps[0]!.pressCount).toBe(1);
    expect(afterFailure).toEqual([0, 0]);
  });

  test('a catch-up capped frame delivers a press once', async () => {
    const { scene, frame } = await setup();

    key('keydown', 'Space');
    frame(1000);

    expect(scene.steps.length).toBeGreaterThan(1);
    expect(presses(scene).filter(count => count > 0)).toEqual([1]);
  });
});

describe('several readers', () => {
  test('two consumers of the same step read the same occurrences; neither takes them from the other', async () => {
    const { scene, frame } = await setup();
    const seen: Array<[string, number]> = [];

    class Reader extends BehaviorComponent {
      public constructor(private readonly name: string) {
        super();
      }

      public override fixedUpdate(): void {
        seen.push([this.name, scene.controls.jump.tick.pressCount]);
      }
    }

    for (const name of ['first', 'second']) {
      const node = new Container();

      node.addComponent(new Reader(name));
      scene.root.addChild(node);
    }

    tapKey('Space');
    frame(STEP_MS);

    expect(seen).toEqual([
      ['first', 1],
      ['second', 1],
    ]);
    expect(scene.steps[0]!.pressCount).toBe(1);
  });

  test('a chord reports its press to one fixed step', async () => {
    const { scene, frame } = await setup();
    const save = scene.inputs.attach(new ActionMap({ save: new ChordAction([Keyboard.Control, Keyboard.S]) }));
    const seen: number[] = [];

    scene.onFixed = (): void => {
      seen.push(save.save.tick.pressCount);
    };

    key('keydown', 'ControlLeft');
    key('keydown', 'KeyS');
    frame(STEP_MS * 2);

    expect(seen).toEqual([1, 0]);
  });

  test('a sequence reports its completion to one fixed step', async () => {
    const { scene, frame } = await setup();
    const combo = scene.inputs.attach(new ActionMap({ combo: new SequenceAction([Keyboard.A, Keyboard.B]) }));
    const triggered: number[] = [];

    scene.onFixed = (): void => {
      triggered.push(combo.combo.tick.triggerCount);
    };

    tapKey('KeyA');
    frame(5);
    tapKey('KeyB');
    frame(STEP_MS * 2);

    expect(triggered).toEqual([1, 0]);
  });
});

describe('ownership', () => {
  test('a press captured before a modal scope opens in the same frame is still the gameplay press', async () => {
    const { app, scene, frame } = await setup();
    const menu = new ActionMap({ close: new ButtonAction(Keyboard.Escape), confirm: new ButtonAction(Keyboard.Space) });

    app.input.onKeyDown.add(channel => {
      if (channel === (Keyboard.Escape as number)) {
        scene.inputs.pushScope(new InputScope(menu));
      }
    });

    key('keydown', 'Space');
    key('keydown', 'Escape');
    frame(5);
    frame(STEP_MS);

    expect(presses(scene)).toEqual([1]);

    key('keyup', 'Space');
    frame(STEP_MS);
    key('keydown', 'Space');
    frame(STEP_MS);

    expect(presses(scene)).toEqual([1, 0, 0]);
  });

  test('a press captured before a pause is not delivered after resume', async () => {
    const { app, scene, frame } = await setup();

    key('keydown', 'Space');
    frame(5);
    app.scenes.pause();
    frame(STEP_MS);
    frame(STEP_MS);
    app.scenes.resume();
    frame(STEP_MS);

    expect(presses(scene)).toEqual([0]);
  });

  test('a pause requested from the input callback of a press keeps that press from the scene, also after resume', async () => {
    const { app, scene, frame } = await setup();

    app.input.onKeyDown.add(() => app.scenes.pause());
    key('keydown', 'Space');
    frame(STEP_MS);

    expect(scene.steps).toHaveLength(0);

    app.scenes.resume();
    frame(STEP_MS);

    expect(presses(scene)).toEqual([0]);
  });

  test('a pause requested inside the step that receives a press finishes that step and replays nothing on resume', async () => {
    const { app, scene, frame } = await setup();

    scene.onFixed = (): void => {
      if (scene.steps.length === 1) {
        app.scenes.pause();
      }
    };

    key('keydown', 'Space');
    frame(STEP_MS * 3);

    expect(presses(scene)).toEqual([1]);

    app.scenes.resume();
    frame(STEP_MS);

    expect(presses(scene)).toEqual([1, 0]);
  });

  test("a 'paused' map keeps working with the frame API while gameplay ticks stand still", async () => {
    const { app, scene, frame } = await setup();
    const menu = scene.inputs.attach(new ActionMap({ confirm: new ButtonAction(Keyboard.Enter) }), { when: SceneAvailability.Paused });

    app.scenes.pause();
    key('keydown', 'Enter');
    frame(STEP_MS);

    expect(menu.confirm.pressed).toBe(true);
    expect(scene.steps).toHaveLength(0);
  });

  test('focus loss delivers the release once and refocus delivers no press', async () => {
    const { app, scene, frame } = await setup();

    key('keydown', 'Space');
    frame(STEP_MS);
    window.dispatchEvent(new FocusEvent('blur'));
    frame(STEP_MS);
    app.canvas.dispatchEvent(new FocusEvent('focus'));
    frame(STEP_MS);

    expect(scene.steps.map(step => [step.pressCount, step.releaseCount, step.active])).toEqual([
      [1, 0, true],
      [0, 1, false],
      [0, 0, false],
    ]);
  });

  test('a gamepad disconnect delivers the release of a held button once', async () => {
    const { scene, frame } = await setup();
    const pad = scene.inputs.attach(new ActionMap({ jump: new ButtonAction(GamepadButton.South) }));
    const seen: Array<[number, number]> = [];

    scene.onFixed = (): void => {
      seen.push([pad.jump.tick.pressCount, pad.jump.tick.releaseCount]);
    };

    padSnapshot = [nativePad(1)];
    frame(STEP_MS);
    padSnapshot = [];
    frame(STEP_MS);
    frame(STEP_MS);

    expect(seen).toEqual([
      [1, 0],
      [0, 1],
      [0, 0],
    ]);
  });

  test('a press in the outgoing scene never reaches the incoming one', async () => {
    const { app, frame } = await setup();
    const outgoing = app.scenes.currentScene as PlayScene;

    key('keydown', 'Space');
    frame(5);
    await app.scenes.change(OtherScene);
    frame(STEP_MS);

    const incoming = app.scenes.currentScene as OtherScene;

    expect(incoming).toBeInstanceOf(OtherScene);
    expect(presses(incoming)).toEqual([0]);
    expect(outgoing.steps).toHaveLength(0);
  });

  test('a retained scene neither receives presses while suspended nor replays one when restored', async () => {
    const { app, frame } = await setup();
    const retained = app.scenes.currentScene as PlayScene;

    key('keydown', 'Space');
    frame(5);
    await app.scenes.change(OtherScene, { suspendCurrent: true });
    key('keyup', 'Space');
    tapKey('Space');
    frame(STEP_MS);
    await app.scenes.restore(PlayScene, { suspendCurrent: true });
    frame(STEP_MS);

    expect(presses(retained)).toEqual([0]);
  });

  test('a detached map delivers nothing it captured before the detach', async () => {
    const { scene, frame } = await setup();

    key('keydown', 'Space');
    frame(5);
    scene.controls.detach();
    frame(STEP_MS);

    expect(presses(scene)).toEqual([0]);
  });

  test('a press on an application map that a stop interrupts is not delivered after a restart', async () => {
    const { app, frame } = await setup();
    const global = app.input.attach(new ActionMap({ jump: new ButtonAction(Keyboard.Space) }));
    const seen: number[] = [];

    app.onFixedFrame.add(() => seen.push(global.jump.tick.pressCount));
    key('keydown', 'Space');
    frame(5);
    app.stop();
    await app.start(PlayScene);
    setLastFrameTimestamp(app, 0);
    app.update(STEP_MS);

    expect(seen).toEqual([0]);
  });

  test('a press sampled before the document hides is not delivered when it shows again', async () => {
    const { app, scene, frame } = await setup();
    const visibility = app as unknown as { _documentVisible: boolean };

    app.pauseOnHidden = true;
    key('keydown', 'Space');
    frame(5);
    visibility._documentVisible = false;
    frame(STEP_MS);
    visibility._documentVisible = true;
    frame(STEP_MS);

    expect(presses(scene)).toEqual([0]);
  });

  test('a pause and resume between two input frames still drops the press sampled before them', async () => {
    const { app, scene, frame } = await setup();

    key('keydown', 'Space');
    frame(5);
    app.scenes.pause();
    app.scenes.resume();
    frame(STEP_MS);

    expect(presses(scene)).toEqual([0]);
  });

  test('a completed sequence a pause interrupts is not delivered after resume', async () => {
    const { app, scene, frame } = await setup();
    const combo = scene.inputs.attach(new ActionMap({ combo: new SequenceAction([Keyboard.A, Keyboard.B]) }));
    const triggered: number[] = [];

    scene.onFixed = (): void => {
      triggered.push(combo.combo.tick.triggerCount);
    };

    tapKey('KeyA');
    tapKey('KeyB');
    frame(5);
    app.scenes.pause();
    app.scenes.resume();
    frame(STEP_MS);

    expect(triggered).toEqual([0]);
  });

  test('a rebind keeps the press already sampled for the next fixed step', async () => {
    const { scene, frame } = await setup();

    key('keydown', 'Space');
    frame(5);
    scene.controls.rebind('jump', Keyboard.Enter);
    frame(STEP_MS);

    expect(presses(scene)).toEqual([1]);
  });

  test("one application's fixed steps neither deliver nor retire another application's press", async () => {
    const first = await setup();
    const second = await setup();

    second.app.canvas.dispatchEvent(new FocusEvent('blur'));
    key('keydown', 'Space');
    first.frame(5);
    second.frame(STEP_MS * 3);
    first.frame(STEP_MS);
    first.frame(STEP_MS);

    expect(second.scene.steps).toHaveLength(3);
    expect(presses(first.scene)).toEqual([1, 0]);
    expect(first.scene.steps[0]!.step).toBe(1);
  });
});

describe('input raised or failing around a frame', () => {
  test('a tap raised by an input callback reaches the fixed step after the next input frame, once', async () => {
    const { app, scene, frame } = await setup();

    app.input.onStart(Keyboard.A, () => tapKey('Space'));
    key('keydown', 'KeyA');
    frame(STEP_MS);
    frame(STEP_MS);
    frame(STEP_MS);

    expect(presses(scene)).toEqual([0, 1, 0]);
  });

  test('a press from a frame whose input stage failed reaches the next fixed step, once', async () => {
    const { app, scene, frame, errors } = await setup();
    let thrown = false;

    app.input.onKeyDown.add(() => {
      if (!thrown) {
        thrown = true;

        throw new Error('listener failed');
      }
    });

    key('keydown', 'Space');
    frame(STEP_MS);

    expect(errors).toHaveLength(1);
    expect(scene.steps).toHaveLength(0);

    frame(STEP_MS);
    frame(STEP_MS);

    expect(presses(scene)).toEqual([1, 0]);
  });

  test('a fixed step that throws after reading a press does not get it again', async () => {
    const { scene, frame, errors } = await setup();

    scene.onFixed = (): void => {
      if (scene.steps.length === 1) {
        throw new Error('step failed');
      }
    };

    key('keydown', 'Space');
    frame(STEP_MS * 2);

    expect(errors.map(error => error.message)).toEqual(['step failed']);

    frame(STEP_MS);

    expect(presses(scene)).toEqual([1, 0]);
  });
});

describe('the latch pattern the frame API needs, for comparison', () => {
  test('a press latched in update before a pause runs on the first fixed step after resume', async () => {
    const { app, scene, frame } = await setup();
    let latched = false;
    const launches: number[] = [];

    vi.spyOn(scene, 'update').mockImplementation(() => {
      if (scene.controls.jump.pressed) {
        latched = true;
      }
    });

    scene.onFixed = (): void => {
      if (latched) {
        latched = false;
        launches.push(scene.steps.length);
      }
    };

    tapKey('Space');
    frame(STEP_MS);
    app.scenes.pause();
    frame(STEP_MS);
    app.scenes.resume();
    frame(STEP_MS);

    expect(launches).toEqual([2]);
    expect(presses(scene)).toEqual([1, 0]);
  });
});
