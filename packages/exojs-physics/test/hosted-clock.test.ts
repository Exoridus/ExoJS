import {
  ActionMap,
  Application,
  BehaviorComponent,
  ButtonAction,
  Container,
  Keyboard,
  logger,
  Scene,
  type Seconds,
  SystemOrder,
  Time,
} from '@codexo/exojs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BoxShape,
  CircleShape,
  KinematicMovementComponent,
  PhysicsBody,
  PhysicsBodyComponent,
  PhysicsWorld,
  type PhysicsWorldOptions,
} from '../src/index';
import { colliderAt } from './support';

/**
 * A world hosted by a real Application frame loop: one world step per host
 * fixed step, at the host's duration, with presentation that never feeds back
 * into the simulation. A world stepped by hand keeps its own accumulator.
 */

vi.mock('../../../src/rendering/OutputTransform', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../src/rendering/OutputTransform')>();

  class StubOutputTransform extends actual.OutputTransform {
    public override present(): void {}
  }

  return { ...actual, OutputTransform: StubOutputTransform };
});

vi.mock('../../../src/rendering/webgl2/WebGl2Backend', async () => {
  const { View } = await import('../../../src/rendering/View');

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

type Configure = (scene: HostScene, app: Application) => void;

class HostScene extends Scene {
  public static configure: Configure = () => {};
  public world!: PhysicsWorld;
  public onUpdate: (delta: Seconds) => void = () => {};

  public override init(): void {
    HostScene.configure(this, this.app);
  }

  public override update(delta: Seconds): void {
    this.onUpdate(delta);
  }
}

class OtherScene extends Scene {}

/** Runs `run` from the fixed step of a behaviour on a node of `scene`, ahead of the scene's systems. */
class Hook extends BehaviorComponent {
  public constructor(private readonly _run: () => void) {
    super();
  }

  public override fixedUpdate(): void {
    this._run();
  }
}

interface Rig {
  readonly app: Application;
  readonly scene: HostScene;
  readonly errors: Error[];
  /** Host fixed steps run since the scene started. */
  hostSteps(): number;
  frame(ms: number): void;
}

const apps: Application[] = [];

const host = async (hz: number, configure: Configure): Promise<Rig> => {
  HostScene.configure = configure;

  const app = new Application({ backend: { type: 'webgl2' }, fixedTimeStep: 1 / hz, scenes: { host: HostScene, other: OtherScene } });
  const errors: Error[] = [];
  let steps = 0;

  vi.spyOn(app.platform, 'requestFrame').mockReturnValue(1);
  vi.spyOn(app.platform, 'cancelFrame').mockImplementation(() => {});
  apps.push(app);
  app.onError.add(error => errors.push(error));
  app.onFixedFrame.add(() => steps++);

  await app.start(HostScene);

  let now = 0;

  (app as unknown as { _scheduler: { _lastFrameTimestamp: number } })._scheduler._lastFrameTimestamp = now;

  return {
    app,
    scene: app.scenes.currentScene as HostScene,
    errors,
    hostSteps: () => steps,
    frame: ms => {
      now += ms;
      app.update(now);
    },
  };
};

afterEach(async () => {
  vi.restoreAllMocks();

  for (const app of apps.splice(0)) {
    await app.destroy();
  }
});

/** A scene-owned world, registered once as the scene's physics system. */
const sceneWorld =
  (options: (app: Application) => PhysicsWorldOptions = app => ({ fixedDelta: app.fixedTimeStep })): Configure =>
  (scene, app) => {
    scene.world = new PhysicsWorld(options(app));
    scene.systems.add(scene.world, { order: SystemOrder.Physics });
  };

/** A dynamic body coasting along +x at `speed`, so its position is speed × simulated time. */
const coaster = (world: PhysicsWorld, speed: number): PhysicsBody => {
  const body = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, colliders: [{ shape: new BoxShape(10, 10) }] }));

  body.linearVelocityX = speed;

  return body;
};

/** A kinematic body a behaviour moves along +x at full speed on every fixed step. */
const walker = (scene: HostScene, maxSpeed: number): KinematicMovementComponent => {
  const node = new Container();
  const physics = node.addComponent(
    new PhysicsBodyComponent(scene.world, { type: 'kinematic', position: { x: 0, y: 500 }, colliders: [{ shape: new CircleShape(8) }] }),
  );
  const movement = node.addComponent(new KinematicMovementComponent(physics, { maxSpeed }));

  node.addComponent(new Hook(() => movement.move({ x: 1, y: 0 })));
  scene.addChild(node);

  return movement;
};

const STEP_60 = 1000 / 60;

describe('a world hosted on a matching clock', () => {
  it.each([30, 60, 120])('advances one world step per %i Hz host step and integrates exactly the host time', async hz => {
    let body!: PhysicsBody;
    let movement!: KinematicMovementComponent;
    const rig = await host(hz, (scene, app) => {
      sceneWorld()(scene, app);
      body = coaster(scene.world, 60);
      movement = walker(scene, 90);
    });

    for (let i = 0; i < 144; i++) {
      rig.frame(1000 / 144);
    }

    const steps = rig.hostSteps();
    const simulated = steps / hz;

    expect(rig.errors).toEqual([]);
    expect(steps).toBeGreaterThanOrEqual(hz - 1);
    expect(rig.scene.world._stepEpoch).toBe(steps);
    expect(body.x).toBeCloseTo(60 * simulated, 6);
    expect(movement.body.x).toBeCloseTo(90 * simulated, 6);
  });

  it.each([30, 50, 60, 120, 144])('accepts a world built with the literal 1 / %i on a host configured with the same rate', async hz => {
    const rig = await host(
      hz,
      sceneWorld(() => ({ fixedDelta: 1 / hz })),
    );

    for (let i = 0; i < 10; i++) {
      rig.frame(1000 / hz);
    }

    expect(rig.errors).toEqual([]);
    expect(rig.hostSteps()).toBeGreaterThan(0);
    expect(rig.scene.world._stepEpoch).toBe(rig.hostSteps());
  });

  it('runs exactly the host-authorized steps for 0, 1, N and clamped frames', async () => {
    const rig = await host(60, sceneWorld());
    const world = rig.scene.world;
    const observed: Array<[host: number, world: number]> = [];

    for (const ms of [5, STEP_60 - 5, STEP_60, STEP_60 * 3, 1000, 0, 0]) {
      const hostBefore = rig.hostSteps();
      const worldBefore = world._stepEpoch;

      rig.frame(ms);
      observed.push([rig.hostSteps() - hostBefore, world._stepEpoch - worldBefore]);
    }

    // 1000 ms is clamped to the host's 100 ms frame budget: six 60 Hz steps.
    expect(observed).toEqual([
      [0, 0],
      [1, 1],
      [1, 1],
      [3, 3],
      [6, 6],
      [0, 0],
      [0, 0],
    ]);
  });
});

describe('a world on a mismatched host clock', () => {
  it.each([
    [120, 1 / 60],
    [30, 1 / 60],
    [60, 1 / 50],
  ])('is refused on a %i Hz host with fixedDelta %d before anything moves', async (hz, fixedDelta) => {
    let body!: PhysicsBody;
    let movement!: KinematicMovementComponent;
    const rig = await host(hz, (scene, app) => {
      sceneWorld(() => ({ fixedDelta }))(scene, app);
      body = coaster(scene.world, 60);
      movement = walker(scene, 90);
    });
    const contacts: unknown[] = [];

    rig.scene.world.onCollisionStart.add(event => contacts.push(event));
    colliderAt(rig.scene.world, new BoxShape(20, 20), { x: 0, y: 0 });

    rig.frame(1000 / hz);

    expect(rig.errors).toHaveLength(1);
    expect(rig.errors[0]!.message).toMatch(/fixedDelta/);
    expect(rig.scene.world._stepEpoch).toBe(0);
    expect(body.x).toBe(0);
    expect(body.linearVelocityX).toBe(60);
    expect(movement.body.x).toBe(0);
    expect(movement.body.linearVelocityX).toBe(0);
    expect(contacts).toEqual([]);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, -1 / 60, (1 / 60) * (1 + 2e-9)])(
    'refuses a host step of %d without changing existing simulation or pending commands',
    step => {
      const world = new PhysicsWorld();
      const body = coaster(world, 1);
      const node = new Container();

      world.bind(body, node);
      colliderAt(world, new BoxShape(20, 20), { x: 0, y: 0 }, 0, 'static', { isSensor: true });
      world.fixedUpdate(Time.seconds(1 / 60));

      const beforeStep = vi.fn();
      const afterStep = vi.fn();
      const contact = vi.fn();
      const command = vi.fn();
      const commands = (world as unknown as { _commands: Array<() => void> })._commands;

      world._addStepController({ _followsOthers: true, _beforeStep: beforeStep, _afterStep: afterStep });
      world.onSensorEnter.add(contact);
      world.onSensorExit.add(contact);
      commands.push(command);

      const snapshot = () => ({
        x: body.x,
        y: body.y,
        previousX: body.previousX,
        previousY: body.previousY,
        velocity: body.linearVelocityX,
        sleepTime: body._sleepTime,
        sleeping: body.isSleeping,
        epoch: world._stepEpoch,
        accumulator: world.timeStepper.accumulator,
        nodeX: node.x,
        nodeY: node.y,
      });
      const before = snapshot();

      expect(() => world.fixedUpdate(Time.seconds(step))).toThrow(Number.isFinite(step) && step > 0 ? Error : RangeError);
      expect(snapshot()).toEqual(before);
      expect(beforeStep).not.toHaveBeenCalled();
      expect(afterStep).not.toHaveBeenCalled();
      expect(contact).not.toHaveBeenCalled();
      expect(command).not.toHaveBeenCalled();
      expect(commands).toEqual([command]);

      world.fixedUpdate(Time.seconds(1 / 60));

      expect(beforeStep).toHaveBeenCalledExactlyOnceWith(1 / 60);
      expect(afterStep).toHaveBeenCalledOnce();
      expect(contact).not.toHaveBeenCalled();
      expect(command).toHaveBeenCalledOnce();
      expect(commands).toEqual([]);
      world.destroy();
    },
  );

  it.each([
    [1 / 60, 1 / 60],
    [1 / 60, (1 / 60) * (1 + 0.5e-9)],
    [1 / 60, (1 / 60) * (1 - 0.5e-9)],
    [1e9, 1e9 + 1],
    [1e9, 1e9 - 1],
  ])('accepts fixedDelta %d and host step %d, preserving the configured duration', (fixedDelta, step) => {
    // At 1e9 seconds the 1e-9 relative boundary is exactly one second:
    // both the threshold and the subtraction are representable without rounding.
    const world = new PhysicsWorld({ fixedDelta, enableSleeping: false });
    const body = coaster(world, 1 / fixedDelta);
    const beforeStep = vi.fn();

    world._addStepController({ _followsOthers: false, _beforeStep: beforeStep, _afterStep: vi.fn() });
    world.fixedUpdate(Time.seconds(step));

    expect(world._stepEpoch).toBe(1);
    expect(world.timeStepper.fixedDelta).toBe(fixedDelta);
    expect(beforeStep).toHaveBeenCalledExactlyOnceWith(fixedDelta);
    expect(body.x).toBeCloseTo(1, 10);
    world.destroy();
  });

  it.each([1e9 + 1.25, 1e9 - 1.25])('rejects host step %d clearly outside the exact relative boundary', step => {
    const world = new PhysicsWorld({ fixedDelta: 1e9 });
    const body = coaster(world, 1e-9);

    expect(() => world.fixedUpdate(Time.seconds(step))).toThrow(/fixedDelta/);
    expect(world._stepEpoch).toBe(0);
    expect(body.x).toBe(0);
    world.destroy();
  });
});

describe('a world stepped by hand', () => {
  it('keeps its own accumulator and rate inside a scene on a different host clock', async () => {
    let body!: PhysicsBody;
    const world = new PhysicsWorld({ fixedDelta: 1 / 50, maxSubSteps: 3 });
    const rig = await host(60, scene => {
      body = coaster(world, 50);
      scene.onUpdate = delta => world.step(delta);
    });
    const warn = vi.spyOn(logger, 'warn');

    // 20 ms frames: one 50 Hz step each, whatever the host's 60 Hz steps do.
    for (let i = 0; i < 10; i++) {
      rig.frame(20);
    }

    expect(rig.errors).toEqual([]);
    expect(body.x).toBeCloseTo(10, 6);

    // A 100 ms frame owes five 50 Hz steps; maxSubSteps runs three and drops the rest.
    rig.frame(100);

    expect(body.x).toBeCloseTo(13, 6);
    expect(world.timeStepper.accumulator).toBeLessThan(world.timeStepper.fixedDelta);
    expect(warn).not.toHaveBeenCalled();

    world.destroy();
  });
});

describe('a world with two drivers', () => {
  it('warns once when a scene-hosted world is also stepped by hand', async () => {
    const warn = vi.spyOn(logger, 'warn');
    const rig = await host(60, (scene, app) => {
      sceneWorld()(scene, app);
      scene.onUpdate = delta => scene.world.step(delta);
    });

    for (let i = 0; i < 10; i++) {
      rig.frame(STEP_60);
    }

    const calls = warn.mock.calls.filter(([message]) => /step\(\)/.test(String(message)));

    expect(calls).toHaveLength(1);
    expect(String(calls[0]![0])).toMatch(/PhysicsWorld/);
  });

  it.each([0, -1 / 60, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'keeps hosted presentation and diagnostics unchanged after a no-op manual step of %d',
    delta => {
      const warn = vi.spyOn(logger, 'warn');
      const world = new PhysicsWorld({ interpolation: true });
      const body = coaster(world, 600);
      const node = new Container();

      world.bind(body, node);
      world.fixedUpdate(Time.seconds(1 / 60));
      world.update(Time.seconds(0));
      warn.mockClear();

      world.step(delta);

      expect(world._stepEpoch).toBe(1);
      expect(body.x).toBeCloseTo(10, 6);
      expect(node.x).toBeCloseTo(body.x, 6);
      expect(world.timeStepper.accumulator).toBe(0);

      world.fixedUpdate(Time.seconds(1 / 60));
      world.update(Time.seconds(0));

      expect(world._stepEpoch).toBe(2);
      expect(node.x).toBeCloseTo(body.x, 6);
      expect(warn).not.toHaveBeenCalled();
      world.destroy();
    },
  );

  it('does not warn when a world changes driver once', () => {
    const warn = vi.spyOn(logger, 'warn');
    const world = new PhysicsWorld();

    world.step(1 / 60);
    world.step(1 / 60);
    world.fixedUpdate(Time.seconds(1 / 60));
    world.fixedUpdate(Time.seconds(1 / 60));

    expect(warn).not.toHaveBeenCalled();
  });

  it('warns once when one world is registered with both the application and its scene', async () => {
    const warn = vi.spyOn(logger, 'warn');
    const rig = await host(60, (scene, app) => {
      sceneWorld()(scene, app);
      app.systems.add(scene.world, { order: SystemOrder.Physics });
    });

    for (let i = 0; i < 5; i++) {
      rig.frame(STEP_60);
    }

    const calls = warn.mock.calls.filter(([message]) => /more than one|two registries|registered with/i.test(String(message)));

    expect(calls).toHaveLength(1);

    rig.app.systems.remove(rig.scene.world);
  });
});

describe('presentation alpha', () => {
  /** A node bound to a body moving 10 px per 60 Hz step. */
  const presented = async (options: (app: Application) => PhysicsWorldOptions) => {
    let body!: PhysicsBody;
    const node = new Container();
    const rig = await host(60, (scene, app) => {
      sceneWorld(options)(scene, app);
      body = coaster(scene.world, 600);
      scene.world.bind(body, node);
      scene.addChild(node);
    });

    return { rig, body, node };
  };

  it('places bound nodes by the host alpha without moving bodies, contacts or the step count', async () => {
    const { rig, body, node } = await presented(app => ({
      fixedDelta: app.fixedTimeStep,
      interpolation: true,
      frameAlphaSource: () => app.frameAlpha,
    }));
    const world = rig.scene.world;
    const sample = () => ({ x: body.x, previous: body.previousX, epoch: world._stepEpoch, node: node.x, alpha: rig.app.frameAlpha });

    rig.frame(STEP_60);

    const stepped = sample();

    expect(stepped.epoch).toBe(1);
    expect(stepped.alpha).toBeCloseTo(0, 9);
    expect(stepped.node).toBeCloseTo(stepped.previous, 6);

    rig.frame(STEP_60 / 2);

    const half = sample();

    expect(half.epoch).toBe(1);
    expect(half.x).toBe(stepped.x);
    expect(half.alpha).toBeCloseTo(0.5, 9);
    expect(half.node).toBeCloseTo(stepped.previous + 5, 6);

    rig.frame(STEP_60 * 0.49);

    const nearOne = sample();

    expect(nearOne.epoch).toBe(1);
    expect(nearOne.x).toBe(stepped.x);
    expect(nearOne.alpha).toBeCloseTo(0.99, 9);
    expect(nearOne.node).toBeCloseTo(stepped.previous + 9.9, 6);

    // Extra render submissions without elapsed time change nothing.
    rig.frame(0);
    rig.frame(0);

    expect(sample()).toEqual(nearOne);

    rig.frame(STEP_60 * 0.51);

    const next = sample();

    expect(next.epoch).toBe(2);
    expect(next.x).toBeCloseTo(stepped.x + 10, 6);
    expect(next.alpha).toBeCloseTo(0.5, 6);
    expect(next.node).toBeCloseTo(next.previous + 5, 6);
    expect(rig.errors).toEqual([]);
  });

  it('presents the latest step, and warns once, when a hosted world interpolates without an alpha source', async () => {
    const warn = vi.spyOn(logger, 'warn');
    const { rig, body, node } = await presented(app => ({ fixedDelta: app.fixedTimeStep, interpolation: true }));

    rig.frame(STEP_60 * 1.5);
    rig.frame(STEP_60);

    expect(rig.scene.world._stepEpoch).toBe(2);
    expect(node.x).toBeCloseTo(body.x, 6);
    expect(warn.mock.calls.filter(([message]) => /frameAlphaSource/.test(String(message)))).toHaveLength(1);
  });

  it('interpolates a world stepped by hand from its own accumulator', async () => {
    const world = new PhysicsWorld({ interpolation: true });
    const body = coaster(world, 600);
    const node = new Container();
    const rig = await host(60, scene => {
      world.bind(body, node);
      scene.addChild(node);
      scene.onUpdate = delta => world.step(delta);
    });

    rig.frame(STEP_60 * 1.5);

    expect(world.timeStepper.alpha).toBeCloseTo(0.5, 6);
    expect(node.x).toBeCloseTo(body.previousX + 5, 6);

    world.destroy();
  });
});

describe('scene world and application world', () => {
  /** A behaviour gives the body its velocity on the first fixed step; where does that step's world advance stand? */
  const commandLatency = async (register: (world: PhysicsWorld, scene: HostScene, app: Application) => void): Promise<number[]> => {
    let body!: PhysicsBody;
    let issued = false;
    const rig = await host(60, (scene, app) => {
      scene.world = new PhysicsWorld({ fixedDelta: app.fixedTimeStep });
      register(scene.world, scene, app);
      body = scene.world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, colliders: [{ shape: new BoxShape(10, 10) }] }));

      const node = new Container();

      node.addComponent(
        new Hook(() => {
          if (!issued) {
            issued = true;
            body.linearVelocityX = 600;
          }
        }),
      );
      scene.addChild(node);
    });
    const positions: number[] = [];

    for (let i = 0; i < 3; i++) {
      rig.frame(STEP_60);
      positions.push(body.x);
    }

    if (rig.app.systems.has(rig.scene.world)) {
      rig.app.systems.remove(rig.scene.world);
      rig.scene.world.destroy();
    }

    return positions;
  };

  it('a scene-registered world applies a command from a scene behaviour in the same step', async () => {
    const positions = await commandLatency((world, scene) => scene.systems.add(world, { order: SystemOrder.Physics }));

    expect(positions[0]).toBeCloseTo(10, 6);
    expect(positions[1]).toBeCloseTo(20, 6);
  });

  it('an application-registered world has already stepped when the scene issues the command', async () => {
    const positions = await commandLatency((world, _scene, app) => app.systems.add(world, { order: SystemOrder.Physics }));

    expect(positions[0]).toBe(0);
    expect(positions[1]).toBeCloseTo(10, 6);
  });
});

describe('tick input into a scene world', () => {
  it.each([30, 60, 120])('a tap reaches the %i Hz step whose world advance applies it, exactly once', async hz => {
    let body!: PhysicsBody;
    let controls!: ActionMap<{ jump: ButtonAction }>;
    const node = new Container();
    const applied: number[] = [];
    const rig = await host(hz, (scene, app) => {
      sceneWorld(() => ({ fixedDelta: app.fixedTimeStep, interpolation: true, frameAlphaSource: () => app.frameAlpha }))(scene, app);
      controls = scene.inputs.attach(new ActionMap({ jump: new ButtonAction(Keyboard.Space) }));
      body = scene.world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, colliders: [{ shape: new BoxShape(10, 10) }] }));
      scene.world.bind(body, node);
      node.addComponent(
        new Hook(() => {
          if (controls.jump.tick.pressed) {
            body.linearVelocityY = -600;
            applied.push(scene.world._stepEpoch);
          }
        }),
      );
      scene.addChild(node);
    });

    rig.app.canvas.dispatchEvent(new FocusEvent('focus'));
    rig.frame(1000 / hz);

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));

    // Render frames without a fixed step hold the press for the next step.
    rig.frame(2);
    rig.frame(0);

    expect(applied).toEqual([]);

    const before = body.y;
    const epoch = rig.scene.world._stepEpoch;

    rig.frame(1000 / hz);

    // Applied in this step, ahead of the world, which then advanced it by one host step.
    expect(applied).toEqual([epoch]);
    expect(rig.scene.world._stepEpoch).toBe(epoch + 1);
    expect(body.y).toBeCloseTo(before - 600 / hz, 6);
    expect(body.previousY).toBeCloseTo(before, 6);
    expect(rig.app.frameAlpha).toBeCloseTo(0.002 * hz, 9);
    expect(node.y).toBeCloseTo(before - (600 / hz) * rig.app.frameAlpha, 6);
    expect(node.y).toBeGreaterThan(body.y);
    expect(node.y).toBeLessThan(before);

    const stepped = body.y;
    const presentedY = node.y;

    rig.frame(0);
    rig.frame(0);

    expect(body.y).toBe(stepped);
    expect(body.previousY).toBeCloseTo(before, 6);
    expect(rig.scene.world._stepEpoch).toBe(epoch + 1);
    expect(node.y).toBe(presentedY);

    for (let i = 0; i < 12; i++) {
      rig.frame(1000 / 144);
    }

    expect(applied).toHaveLength(1);
    expect(rig.errors).toEqual([]);
  });
});

describe('pause and retention', () => {
  it('a paused scene holds its world, presentation included, and resumes without a catch-up burst', async () => {
    let body!: PhysicsBody;
    const node = new Container();
    const rig = await host(60, (scene, app) => {
      sceneWorld(() => ({ fixedDelta: app.fixedTimeStep, interpolation: true, frameAlphaSource: () => app.frameAlpha }))(scene, app);
      body = coaster(scene.world, 600);
      scene.world.bind(body, node);
      scene.addChild(node);
    });
    const world = rig.scene.world;

    rig.frame(STEP_60 * 1.5);
    rig.app.scenes.pause();

    const held = { x: body.x, epoch: world._stepEpoch, node: node.x };

    for (let i = 0; i < 10; i++) {
      rig.frame(STEP_60 * 0.7);
    }

    expect({ x: body.x, epoch: world._stepEpoch, node: node.x }).toEqual(held);

    rig.app.scenes.resume();

    const hostBefore = rig.hostSteps();

    rig.frame(STEP_60);

    expect(world._stepEpoch - held.epoch).toBe(rig.hostSteps() - hostBefore);
    expect(world._stepEpoch - held.epoch).toBeLessThanOrEqual(2);
    expect(rig.errors).toEqual([]);
  });

  it('a suspended scene holds its world and a restored one steps again on the host clock', async () => {
    let body!: PhysicsBody;
    const rig = await host(60, (scene, app) => {
      sceneWorld()(scene, app);
      body = coaster(scene.world, 60);
    });
    const world = rig.scene.world;

    rig.frame(STEP_60);

    await rig.app.scenes.change(OtherScene, { suspendCurrent: true });

    const held = { x: body.x, epoch: world._stepEpoch };

    for (let i = 0; i < 10; i++) {
      rig.frame(STEP_60);
    }

    expect({ x: body.x, epoch: world._stepEpoch }).toEqual(held);

    await rig.app.scenes.restore(HostScene);
    rig.frame(STEP_60);

    expect(world._stepEpoch).toBe(held.epoch + 1);
    expect(body.x).toBeCloseTo(held.x + 1, 6);
    expect(rig.errors).toEqual([]);
  });
});

describe('ownership', () => {
  it('the scene registry destroys a scene-owned world exactly once when the scene ends', async () => {
    let destroy!: ReturnType<typeof vi.spyOn>;
    let component!: PhysicsBodyComponent;
    const rig = await host(60, (scene, app) => {
      sceneWorld()(scene, app);
      destroy = vi.spyOn(scene.world, 'destroy');

      const node = new Container();

      component = node.addComponent(
        new PhysicsBodyComponent(scene.world, { type: 'dynamic', position: { x: 0, y: 0 }, colliders: [{ shape: new CircleShape(4) }] }),
      );
      scene.addChild(node);
    });

    rig.frame(STEP_60);
    await rig.app.scenes.change(OtherScene);
    rig.frame(STEP_60);

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(component.body.destroyed).toBe(true);
    expect(rig.errors).toEqual([]);
  });
});
