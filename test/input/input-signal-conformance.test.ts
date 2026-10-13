/**
 * Input notification contract, through the real Application -> InputSystem ->
 * InteractionSystem path with controlled platform events and a hand-driven
 * frame clock.
 *
 * Each frame the input system first brings every piece of input state up to
 * date - gamepads polled, bindings advanced, action maps and scopes sampled -
 * and only then publishes notifications, by category: gamepad controls,
 * bindings, keys, wheel, then the pointer journal in arrival order. Every
 * callback therefore reads the same, current generation of input state,
 * whatever kind of callback it is. A listener that throws keeps no other
 * listener or later occurrence from its notification; the frame's errors reach
 * the frame guard once, after the input frame has closed, and nothing already
 * published is ever delivered again.
 */
import { Application } from '#core/Application';
import { logger } from '#core/Logger';
import { Scene } from '#core/scene/Scene';
import { SceneAvailability } from '#core/scene/SceneAvailability';
import { ActionMap } from '#input/actions/ActionMap';
import { ButtonAction } from '#input/actions/ButtonAction';
import { InputScope } from '#input/actions/InputScope';
import { GamepadButton } from '#input/GamepadButton';
import type { GamepadSlotStrategy } from '#input/InputSystem';
import { Keyboard } from '#input/types';
import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';

import { setLastFrameTimestamp } from '../support/application-frame-loop';

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

class PlayScene extends Scene {}
class OtherScene extends Scene {}

class HitBox extends Drawable {
  public constructor() {
    super();
    this.interactive = true;
  }

  public override contains(x: number, y: number): boolean {
    return x >= 0 && x < 100 && y >= 0 && y < 100;
  }

  public override getBounds(): Rectangle {
    return new Rectangle(0, 0, 100, 100);
  }
}

type BrowserGamepad = NonNullable<ReturnType<Navigator['getGamepads']>[number]>;

const xbox = 'Vendor: 045e Product: 0b13';
const playStation = 'Vendor: 054c Product: 0ce6';
const switchPro = 'Vendor: 057e Product: 2009';

const nativePad = (id: string, index: number, south = 0): BrowserGamepad =>
  ({
    id,
    index,
    connected: true,
    mapping: 'standard',
    timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, (_, i) => {
      const value = i === 0 ? south : 0;

      return { value, pressed: value > 0, touched: value > 0 };
    }),
    vibrationActuator: null,
  }) as unknown as BrowserGamepad;

let padSnapshot: Array<BrowserGamepad | null> = [];
let restoreGetGamepads: (() => void) | null = null;

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
  /** Errors the frame guard handed to `app.onError`. */
  errors: Error[];
  /** Advance one frame by `ms` milliseconds. */
  frame(ms?: number): void;
}

const harnesses: Harness[] = [];

const setup = async (gamepadSlotStrategy: GamepadSlotStrategy = 'sticky'): Promise<Harness> => {
  const app = new Application({
    backend: { type: 'webgl2' },
    input: { gamepadSlotStrategy },
    scenes: { play: PlayScene, other: OtherScene },
  });

  vi.spyOn(app.platform, 'requestFrame').mockReturnValue(1);
  vi.spyOn(app.platform, 'cancelFrame').mockImplementation(() => {});
  vi.spyOn(app.canvas as HTMLCanvasElement, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: app.canvas.width,
    bottom: app.canvas.height,
    width: app.canvas.width,
    height: app.canvas.height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);

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
    scene: app.scenes.currentScene as PlayScene,
    errors,
    frame: (ms = 16): void => {
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

const pointer = (app: Application, type: string, x: number, y: number, pointerId = 1): void => {
  app.canvas.dispatchEvent(
    new PointerEvent(type, { pointerId, clientX: x, clientY: y, isPrimary: true, button: 0, pointerType: 'mouse', bubbles: true }),
  );
};

const wheel = (app: Application, deltaY: number): void => {
  app.canvas.dispatchEvent(new WheelEvent('wheel', { deltaY, deltaMode: 0, cancelable: true }));
};

const jumpMap = (): ActionMap<{ jump: ButtonAction }> => new ActionMap({ jump: new ButtonAction(Keyboard.Space) });

/** Throws on its first call only, so a failure is confined to one frame. */
const throwOnce = (message = 'listener failed'): (() => void) => {
  let thrown = false;

  return (): void => {
    if (!thrown) {
      thrown = true;

      throw new Error(message);
    }
  };
};

describe('what an input callback reads', () => {
  test('a binding callback reads action maps already sampled for its own frame', async () => {
    const { app, frame } = await setup();
    const map = app.input.attach(jumpMap());
    let seen: boolean | null = null;

    app.input.onStart(Keyboard.Space, () => {
      seen = map.jump.pressed;
    });

    key('keydown', 'Space');
    frame();

    expect(seen).toBe(true);
  });

  test('a binding callback and a key signal read the same action state in the same frame', async () => {
    const { app, frame } = await setup();
    const map = app.input.attach(jumpMap());
    const seen: Array<[string, boolean]> = [];

    app.input.onStart(Keyboard.Space, () => seen.push(['binding', map.jump.pressed]));
    app.input.onKeyDown.add(() => seen.push(['key', map.jump.pressed]));

    key('keydown', 'Space');
    frame();

    expect(seen).toEqual([
      ['binding', true],
      ['key', true],
    ]);
  });

  test("a scene binding reads the scene's own map at this frame's state", async () => {
    const { scene, frame } = await setup();
    const map = scene.inputs.attach(jumpMap());
    let seen: boolean | null = null;

    scene.inputs.onStart(Keyboard.Space, () => {
      seen = map.jump.pressed;
    });

    key('keydown', 'Space');
    frame();

    expect(seen).toBe(true);
  });

  test('a gamepad button signal reads action maps sampled for its frame', async () => {
    const { app, frame } = await setup();
    const map = app.input.attach(new ActionMap({ jump: new ButtonAction(GamepadButton.South) }));
    let seen: boolean | null = null;

    app.input.onAnyGamepadButtonDown.add(() => {
      seen = map.jump.pressed;
    });

    padSnapshot = [nativePad(xbox, 0)];
    frame();
    padSnapshot = [nativePad(xbox, 0, 1)];
    frame();

    expect(seen).toBe(true);
  });

  test('a binding callback reads every other binding at the same frame state', async () => {
    const { app, frame } = await setup();
    let seen: boolean | null = null;
    const later = { binding: null as ReturnType<typeof app.input.onActive> | null };

    app.input.onStart(Keyboard.Space, () => {
      seen = later.binding?.active ?? null;
    });
    later.binding = app.input.onActive(Keyboard.Space);

    key('keydown', 'Space');
    frame();

    expect(seen).toBe(true);
  });

  test("a binding's callbacks carry each edge's value while the binding reports the frame's final state", async () => {
    const { app, frame } = await setup();
    const seen: Array<[string, number, boolean]> = [];
    const binding = app.input.onStart(Keyboard.Space);

    binding.onStart.add(value => seen.push(['start', value, binding.active]));
    binding.onStop.add(value => seen.push(['stop', value, binding.active]));

    tapKey('Space');
    key('keydown', 'Space');
    frame();

    expect(seen).toEqual([
      ['start', 1, true],
      ['stop', 0, true],
      ['start', 1, true],
    ]);
  });

  test('a gamepad slot binding reads action maps sampled for its frame', async () => {
    const { app, frame } = await setup();
    const map = app.input.attach(new ActionMap({ jump: new ButtonAction(GamepadButton.South) }));
    let seen: boolean | null = null;

    app.input.getGamepad(0).onStart(GamepadButton.South, () => {
      seen = map.jump.pressed;
    });

    padSnapshot = [nativePad(xbox, 0)];
    frame();
    padSnapshot = [nativePad(xbox, 0, 1)];
    frame();

    expect(seen).toBe(true);
  });

  test('a pointer signal carries the position of its own phase while the pointer reports the latest', async () => {
    const { app, frame } = await setup();
    const seen: Array<{ x: number; y: number; live: number }> = [];

    app.input.onPointerDown.add((target, x, y) => seen.push({ x, y, live: target.x }));

    pointer(app, 'pointerover', 10, 10);
    pointer(app, 'pointerdown', 10, 10);
    pointer(app, 'pointermove', 50, 50);
    frame();

    expect(seen).toHaveLength(1);
    expect(seen[0]!.x).toBe(10);
    expect(seen[0]!.y).toBe(10);
    expect(seen[0]!.live).toBe(50);
  });
});

describe('order within a frame', () => {
  test('notifications publish by category, not in global arrival order', async () => {
    const { app, frame } = await setup();
    const trace: string[] = [];

    app.input.onPointerDown.add(() => trace.push('pointer'));
    app.input.onMouseWheel.add(() => trace.push('wheel'));
    app.input.onKeyDown.add(() => trace.push('key'));
    app.input.onStart(Keyboard.A, () => trace.push('binding'));
    app.input.onAnyGamepadButtonDown.add(() => trace.push('gamepad'));

    padSnapshot = [nativePad(xbox, 0)];
    frame();

    // Host arrival order: pointer, wheel, key, then the pad is polled.
    pointer(app, 'pointerover', 10, 10);
    pointer(app, 'pointerdown', 10, 10);
    wheel(app, 10);
    key('keydown', 'KeyA');
    padSnapshot = [nativePad(xbox, 0, 1)];
    frame();

    expect(trace).toEqual(['gamepad', 'binding', 'key', 'wheel', 'pointer']);
  });

  test('two full presses in one frame reach key signals and bindings twice; the map folds them into one frame', async () => {
    const { app, frame } = await setup();
    const map = app.input.attach(jumpMap());
    const trace: string[] = [];

    app.input.onKeyDown.add(() => trace.push('down'));
    app.input.onKeyUp.add(() => trace.push('up'));
    app.input.onStart(Keyboard.Space, () => trace.push('start')).onStop.add(() => trace.push('stop'));

    tapKey('Space');
    tapKey('Space');
    frame();

    expect(trace).toEqual(['start', 'stop', 'start', 'stop', 'down', 'up', 'down', 'up']);
    expect(map.jump.pressed).toBe(true);
    expect(map.jump.released).toBe(true);
    expect(map.jump.active).toBe(false);
  });
});

describe('a throwing listener', () => {
  test('keeps neither the other listeners nor the rest of the key events from running, and nothing is delivered twice', async () => {
    const { app, frame, errors } = await setup();
    const received: number[] = [];

    app.input.onKeyDown.add(throwOnce());
    app.input.onKeyDown.add(channel => received.push(channel));

    key('keydown', 'Space');
    key('keydown', 'KeyA');
    frame();

    expect(received).toEqual([Keyboard.Space, Keyboard.A]);
    expect(errors).toHaveLength(1);

    key('keydown', 'KeyB');
    frame();

    expect(received).toEqual([Keyboard.Space, Keyboard.A, Keyboard.B]);
    expect(errors).toHaveLength(1);
  });

  test('a tap in a failed frame is not pressed again on the next frame', async () => {
    const { app, frame } = await setup();
    const map = app.input.attach(jumpMap());

    app.input.onKeyDown.add(throwOnce());

    tapKey('Space');
    frame();

    expect(map.jump.pressed).toBe(true);

    frame();

    expect(map.jump.pressed).toBe(false);
    expect(map.jump.released).toBe(false);
  });

  test('a throwing binding callback leaves the other bindings and the maps in step', async () => {
    const { app, frame } = await setup();
    const map = app.input.attach(jumpMap());
    const starts: string[] = [];

    app.input.onStart(Keyboard.Space, () => starts.push('first'));
    app.input.onStart(Keyboard.Space, throwOnce());
    app.input.onStart(Keyboard.Space, () => starts.push('last'));

    tapKey('Space');
    frame();

    expect(starts).toEqual(['first', 'last']);
    expect(map.jump.pressed).toBe(true);

    frame();

    expect(starts).toEqual(['first', 'last']);
    expect(map.jump.pressed).toBe(false);
  });

  test('a throwing pointer listener delivers the phase once, to the signal and to the node', async () => {
    const { app, scene, frame } = await setup();
    const box = new HitBox();
    let signalDowns = 0;
    let nodeDowns = 0;

    scene.root.addChild(box);
    box.onPointerDown.add(() => {
      nodeDowns++;
    });
    app.input.onPointerDown.add(throwOnce());
    app.input.onPointerDown.add(() => {
      signalDowns++;
    });

    pointer(app, 'pointerover', 50, 50);
    pointer(app, 'pointerdown', 50, 50);
    frame();

    expect(signalDowns).toBe(1);
    expect(nodeDowns).toBe(1);

    frame();
    frame();

    expect(signalDowns).toBe(1);
    expect(nodeDowns).toBe(1);
  });

  test('a failing input frame still routes its pointer press to the scene it happened in', async () => {
    const { app, scene, frame, errors } = await setup();
    const box = new HitBox();
    let nodeDowns = 0;

    scene.root.addChild(box);
    box.onPointerDown.add(() => {
      nodeDowns++;
    });
    app.input.onKeyDown.add(() => {
      void app.scenes.change(OtherScene);

      throw new Error('key listener');
    });

    key('keydown', 'Space');
    pointer(app, 'pointerover', 50, 50);
    pointer(app, 'pointerdown', 50, 50);
    frame();
    await vi.waitFor(() => expect(app.scenes.currentScene).toBeInstanceOf(OtherScene));
    frame();

    expect(nodeDowns).toBe(1);
    expect(errors.map(error => error.message)).toEqual(['key listener']);
  });

  test('a node handler failure and an input listener failure in one frame both reach onError', async () => {
    const { app, scene, frame, errors } = await setup();
    const box = new HitBox();

    scene.root.addChild(box);
    box.onPointerDown.add(() => {
      throw new Error('node handler');
    });
    app.input.onKeyDown.add(throwOnce('key listener'));

    key('keydown', 'Space');
    pointer(app, 'pointerover', 50, 50);
    pointer(app, 'pointerdown', 50, 50);
    frame();

    expect(errors.map(error => error.message).sort()).toEqual(['key listener', 'node handler']);
  });

  test('a throwing context-menu listener delivers the request once to the node', async () => {
    const { app, scene, frame } = await setup();
    const box = new HitBox();
    let nodeMenus = 0;

    scene.root.addChild(box);
    box.onContextMenu.add(() => {
      nodeMenus++;
    });
    app.input.onContextMenu.add(throwOnce());

    pointer(app, 'pointerover', 50, 50);
    app.canvas.dispatchEvent(new MouseEvent('contextmenu', { clientX: 50, clientY: 50, cancelable: true, bubbles: true }));
    frame();
    frame();

    expect(nodeMenus).toBe(1);
  });

  test('a throwing wheel listener does not fold the old delta into the next one', async () => {
    const { app, frame } = await setup();
    const deltas: number[] = [];

    app.input.onMouseWheel.add(throwOnce());
    app.input.onMouseWheel.add((_x, y) => deltas.push(y));

    wheel(app, 100);
    frame();
    wheel(app, 30);
    frame();

    expect(deltas).toEqual([100, 30]);
  });

  test('a throwing gamepad listener does not hold back another pad in the same frame', async () => {
    const { app, frame } = await setup();
    const slots: number[] = [];

    app.input.onAnyGamepadButtonDown.add(throwOnce());
    app.input.onAnyGamepadButtonDown.add(pad => slots.push(pad.slot));

    padSnapshot = [nativePad(xbox, 0), nativePad(playStation, 1)];
    frame();
    padSnapshot = [nativePad(xbox, 0, 1), nativePad(playStation, 1, 1)];
    frame();

    expect(slots).toEqual([0, 1]);

    frame();

    expect(slots).toEqual([0, 1]);
  });

  test('a throwing reassignment listener leaves the compacted slots consistent', async () => {
    const { app, frame } = await setup('compact');
    const disconnected: number[] = [];

    app.input.onAnyGamepadReassigned.add(throwOnce());
    app.input.onGamepadDisconnected.add(pad => disconnected.push(pad.slot));

    const padB = nativePad(playStation, 1);
    const padC = nativePad(switchPro, 2);

    padSnapshot = [nativePad(xbox, 0), padB, padC];
    frame();
    padSnapshot = [null, padB, padC];
    frame();

    const [first, second, third] = app.input.gamepads;

    expect(first.connected && second.connected).toBe(true);
    expect(third.connected).toBe(false);
    expect(disconnected).toEqual([2]);

    frame();

    expect(app.input.connectedGamepadCount).toBe(2);
  });

  test('every listener failure of one frame reaches the frame guard once, as one error', async () => {
    const { app, frame, errors } = await setup();

    app.input.onKeyDown.add(throwOnce('key listener'));
    app.input.onPointerDown.add(throwOnce('pointer listener'));

    key('keydown', 'Space');
    pointer(app, 'pointerover', 10, 10);
    pointer(app, 'pointerdown', 10, 10);
    frame();

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(AggregateError);
    expect((errors[0] as AggregateError).errors.map(error => (error as Error).message)).toEqual(['key listener', 'pointer listener']);

    frame();

    expect(errors).toHaveLength(1);
  });

  test('a single listener failure reaches the frame guard unwrapped', async () => {
    const { app, frame, errors } = await setup();
    const failure = new Error('only one');

    app.input.onKeyDown.add(() => {
      throw failure;
    });

    key('keydown', 'Space');
    frame();

    expect(errors).toEqual([failure]);
  });

  test('a throwing focus listener on a press the host would not focus keeps the press and is reported without failing a frame', async () => {
    const { app, frame, errors } = await setup();
    let downs = 0;
    let completedFrames = 0;
    const hostErrors: unknown[] = [];

    const swallowHostError = (event: ErrorEvent): void => {
      hostErrors.push(event.error);
      event.preventDefault();
    };

    window.addEventListener('error', swallowHostError);
    window.dispatchEvent(new FocusEvent('blur'));
    vi.spyOn(app.platform, 'focusSurface').mockImplementation(() => {});
    app.input.onCanvasFocusChange.add(throwOnce('focus listener'));
    app.input.onPointerDown.add(() => {
      downs++;
    });
    app.onFrame.add(() => {
      completedFrames++;
    });

    pointer(app, 'pointerover', 10, 10);
    pointer(app, 'pointerdown', 10, 10);
    window.removeEventListener('error', swallowHostError);

    expect(hostErrors).toEqual([]);
    expect(errors.map(error => error.message)).toEqual(['focus listener']);

    frame();

    expect(app.input.canvasFocused).toBe(true);
    expect(downs).toBe(1);
    expect(completedFrames).toBe(1);
    expect(errors).toHaveLength(1);
  });

  test('a throwing gamepad slot binding keeps the other slot bindings and replays nothing', async () => {
    const { app, frame, errors } = await setup();
    const pad = app.input.getGamepad(0);
    const starts: string[] = [];

    pad.onStart(GamepadButton.South, throwOnce());
    pad.onStart(GamepadButton.South, () => starts.push('other binding'));
    pad.onButtonDown.add(() => starts.push('button'));

    padSnapshot = [nativePad(xbox, 0)];
    frame();
    padSnapshot = [nativePad(xbox, 0, 1)];
    frame();

    expect(starts).toEqual(['button', 'other binding']);
    expect(errors).toHaveLength(1);

    frame();

    expect(starts).toEqual(['button', 'other binding']);
    expect(errors).toHaveLength(1);
  });

  test('a throwing node handler fails closed: the press is not replayed and the drag ends', async () => {
    const { app, scene, frame, errors } = await setup();
    const box = new HitBox();
    let nodeDowns = 0;
    let nodeUps = 0;

    scene.root.addChild(box);
    box.onPointerDown.add(() => {
      nodeDowns++;

      throw new Error('node handler');
    });
    box.onPointerUp.add(() => {
      nodeUps++;
    });

    pointer(app, 'pointerover', 50, 50);
    pointer(app, 'pointerdown', 50, 50);
    frame();
    frame();

    expect(nodeDowns).toBe(1);
    expect(errors).toHaveLength(1);

    pointer(app, 'pointerup', 50, 50);
    frame();

    expect(nodeDowns).toBe(1);
    expect(nodeUps).toBe(1);
  });
});

describe('ownership and lifecycle', () => {
  test('a map attached from an input callback does not see that frame press retroactively', async () => {
    const { app, frame } = await setup();
    const map = jumpMap();

    app.input.onKeyDown.add(() => {
      app.input.attach(map);
    });

    key('keydown', 'Space');
    frame();
    frame();

    expect(map.jump.active).toBe(true);
    expect(map.jump.pressed).toBe(false);
  });

  test("gameplay input stays quiet in pause, a 'paused' map works, and resume replays nothing", async () => {
    const { app, scene, frame } = await setup();
    const gameplay = scene.inputs.attach(jumpMap());
    const menu = scene.inputs.attach(jumpMap(), { when: SceneAvailability.Paused });
    let gameplayStarts = 0;

    scene.inputs.onStart(Keyboard.Space, () => {
      gameplayStarts++;
    });

    app.scenes.pause();
    key('keydown', 'Space');
    frame();

    expect(menu.jump.pressed).toBe(true);
    expect(gameplay.jump.pressed).toBe(false);

    app.scenes.resume();
    frame();

    expect(gameplay.jump.active).toBe(true);
    expect(gameplay.jump.pressed).toBe(false);
    expect(gameplayStarts).toBe(0);
  });

  test('focus loss releases held keys once and refocus presses nothing', async () => {
    const { app, frame } = await setup();
    const map = app.input.attach(jumpMap());
    const trace: string[] = [];

    app.input.onKeyDown.add(() => trace.push('down'));
    app.input.onKeyUp.add(() => trace.push('up'));

    key('keydown', 'Space');
    frame();
    window.dispatchEvent(new FocusEvent('blur'));
    frame();

    expect(map.jump.released).toBe(true);
    expect(map.jump.active).toBe(false);

    app.canvas.dispatchEvent(new FocusEvent('focus'));
    frame();

    expect(trace).toEqual(['down', 'up']);
    expect(map.jump.pressed).toBe(false);
  });

  test('a gamepad disconnect releases the buttons it held', async () => {
    const { app, frame } = await setup();
    const map = app.input.attach(new ActionMap({ jump: new ButtonAction(GamepadButton.South) }));

    padSnapshot = [nativePad(xbox, 0, 1)];
    frame();
    frame();

    expect(map.jump.active).toBe(true);

    padSnapshot = [];
    frame();

    expect(map.jump.released).toBe(true);
    expect(map.jump.active).toBe(false);
  });

  test('a suspended scene receives nothing while suspended and replays nothing when restored', async () => {
    const { app, scene, frame } = await setup();
    const map = scene.inputs.attach(jumpMap());
    let starts = 0;

    scene.inputs.onStart(Keyboard.Space, () => {
      starts++;
    });

    await app.scenes.change(OtherScene, { suspendCurrent: true });
    tapKey('Space');
    frame();
    await app.scenes.restore(PlayScene, { suspendCurrent: true });
    frame();

    expect(starts).toBe(0);
    expect(map.jump.pressed).toBe(false);
  });

  test('a tap a binding callback raises reaches the action maps on the next frame, once', async () => {
    const { app, frame } = await setup();
    const map = app.input.attach(jumpMap());

    app.input.onStart(Keyboard.A, () => tapKey('Space'));

    key('keydown', 'KeyA');
    frame();

    expect(map.jump.pressed).toBe(false);

    frame();

    expect(map.jump.pressed).toBe(true);
    expect(map.jump.released).toBe(true);

    frame();

    expect(map.jump.pressed).toBe(false);
  });

  test('a binding that unbinds itself in its start callback receives nothing more of that frame', async () => {
    const { app, frame } = await setup();
    const trace: string[] = [];
    const binding = app.input.onStart(Keyboard.Space);

    binding.onStart.add(() => {
      trace.push('start');
      binding.unbind();
    });
    binding.onStop.add(() => trace.push('stop'));

    tapKey('Space');
    frame();
    tapKey('Space');
    frame();

    expect(trace).toEqual(['start']);
  });

  test('a listener removed during a dispatch still receives that dispatch, and nothing after it', async () => {
    const { app, frame } = await setup();
    let removedCalls = 0;

    const removed = (): void => {
      removedCalls++;
    };

    app.input.onKeyDown.add(() => {
      app.input.onKeyDown.remove(removed);
    });
    app.input.onKeyDown.add(removed);

    key('keydown', 'Space');
    frame();
    key('keydown', 'KeyA');
    frame();

    expect(removedCalls).toBe(1);
  });

  test('a scene stopped from an input callback gets no node events later in that frame', async () => {
    const { app, scene, frame } = await setup();
    const box = new HitBox();
    let nodeDowns = 0;

    scene.root.addChild(box);
    box.onPointerDown.add(() => {
      nodeDowns++;
    });
    app.input.onKeyDown.add(() => {
      void app.stop();
    });

    key('keydown', 'Space');
    pointer(app, 'pointerover', 50, 50);
    pointer(app, 'pointerdown', 50, 50);
    frame();

    expect(nodeDowns).toBe(0);
  });

  test('a modal scope masks gameplay actions but not raw signals, and stopping propagation masks neither', async () => {
    const { app, scene, frame } = await setup();
    const gameplay = scene.inputs.attach(jumpMap());
    const modal = new ActionMap({ confirm: new ButtonAction(Keyboard.Space) });
    const parent = new Container();
    const button = new HitBox();
    const raw: string[] = [];

    scene.inputs.pushScope(new InputScope(modal));
    parent.interactive = true;
    scene.root.addChild(parent);
    parent.addChild(button);
    button.onPointerDown.add(event => event.stopPropagation());
    parent.onPointerDown.add(() => raw.push('parent'));
    app.input.onKeyDown.add(() => raw.push('key'));
    app.input.onPointerDown.add(() => raw.push('pointer'));

    key('keydown', 'Space');
    pointer(app, 'pointerover', 50, 50);
    pointer(app, 'pointerdown', 50, 50);
    frame();

    expect(modal.confirm.pressed).toBe(true);
    expect(gameplay.jump.pressed).toBe(false);
    expect(raw).toEqual(['key', 'pointer']);
  });
});
